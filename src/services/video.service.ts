import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import os from "os";
import path from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { getSignedDownloadUrl, uploadFromBuffer } from "./storage.service.js";

interface TimelineSegment {
  start: number;
  end: number;
  track: "ORIGINAL" | "SONG";
  volume: number; // 0-100
  order: number;
}

/**
 * Download a file from a URL to a temp path.
 */
async function downloadToTemp(url: string, ext: string): Promise<string> {
  const tmpDir = os.tmpdir();
  const tmpFile = path.join(tmpDir, `reelmix-${Date.now()}${ext}`);

  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download file: ${response.statusText}`);
  }

  const fileStream = fs.createWriteStream(tmpFile);
  const readable = Readable.fromWeb(response.body as any);
  await pipeline(readable, fileStream);

  return tmpFile;
}

/**
 * Extract video duration (in seconds) using ffprobe.
 */
export async function extractDuration(videoUrl: string): Promise<number> {
  const tmpFile = await downloadToTemp(videoUrl, ".mp4");

  try {
    return await new Promise<number>((resolve, reject) => {
      ffmpeg.ffprobe(tmpFile, (err, metadata) => {
        if (err) return reject(new Error(`ffprobe error: ${err.message}`));
        const duration = metadata.format.duration;
        if (typeof duration !== "number") {
          return reject(new Error("Could not determine video duration"));
        }
        resolve(Math.round(duration * 100) / 100); // 2 decimal places
      });
    });
  } finally {
    fs.unlink(tmpFile, () => {}); // cleanup
  }
}

/**
 * Generate a thumbnail from the video at the 1-second mark.
 * Uploads the thumbnail to Supabase Storage and returns the storage path.
 */
export async function generateThumbnail(
  videoUrl: string,
  userId: string,
  projectId: string
): Promise<string> {
  const tmpVideo = await downloadToTemp(videoUrl, ".mp4");
  const tmpDir = os.tmpdir();
  const thumbFilename = `thumb-${projectId}.jpg`;
  const tmpThumb = path.join(tmpDir, thumbFilename);

  try {
    // Extract a single frame at 1 second (or 0 if video is very short)
    await new Promise<void>((resolve, reject) => {
      ffmpeg(tmpVideo)
        .screenshots({
          count: 1,
          timemarks: ["00:00:01"],
          filename: thumbFilename,
          folder: tmpDir,
          size: "480x?", // 480px wide, auto height
        })
        .on("end", () => resolve())
        .on("error", (err) => reject(new Error(`ffmpeg thumbnail error: ${err.message}`)));
    });

    // Read the generated thumbnail and upload to Supabase Storage
    const thumbBuffer = fs.readFileSync(tmpThumb);
    const storagePath = `${userId}/${projectId}/thumbnail.jpg`;

    await uploadFromBuffer("thumbnails", storagePath, thumbBuffer, "image/jpeg");

    return storagePath;
  } finally {
    fs.unlink(tmpVideo, () => {});
    fs.unlink(tmpThumb, () => {});
  }
}

/**
 * Render a final video by mixing video + song audio according to timeline segments.
 *
 * For each time range in the video:
 * - If a segment with track=ORIGINAL exists: use video's original audio at segment.volume
 * - If a segment with track=SONG exists: use the song audio at segment.volume
 * - If multiple segments overlap, they are mixed together
 * - If no segment covers a range, original audio plays at 100%
 *
 * Returns the storage path in the "exports" bucket.
 */
export async function renderFinalVideo(
  videoUrl: string,
  songUrl: string,
  segments: TimelineSegment[],
  videoDuration: number,
  userId: string,
  projectId: string
): Promise<string> {
  const tmpVideo = await downloadToTemp(videoUrl, ".mp4");
  const tmpSong = await downloadToTemp(songUrl, ".wav");
  const tmpOutput = path.join(os.tmpdir(), `reelmix-export-${Date.now()}.mp4`);

  try {
    await new Promise<void>((resolve, reject) => {
      // Sort segments by start time
      const sorted = [...segments].sort((a, b) => a.start - b.start);

      // Build the ffmpeg filter graph
      // Inputs: [0] = video file, [1] = song audio file
      // [0:a] = original audio, [1:a] = song audio
      //
      // Strategy:
      // 1. Build volume-envelope filters for original audio and song audio
      //    using the "volume" filter with enable expressions
      // 2. Mix the two volume-controlled streams together with amix

      const originalSegments = sorted.filter(s => s.track === "ORIGINAL");
      const songSegments = sorted.filter(s => s.track === "SONG");

      // Original audio base volume — from the synthetic ORIGINAL segment
      // (covers full duration, volume = user-set original volume).
      // Falls back to 1.0 (full volume) if no ORIGINAL segment in DB.
      const baseOrigVol = originalSegments.length > 0
        ? originalSegments[0].volume / 100
        : 1.0;

      // Build volume expressions matching the frontend preview:
      //   Original audio: plays at baseOrigVol, MUTED during SONG segments
      //   Song audio:     plays only during SONG segments at their volume
      const origMuteSegments = songSegments.map(s => ({ ...s, volume: 0 }));
      const origVolumeExpr = buildVolumeExpression(origMuteSegments, videoDuration, baseOrigVol);
      const songVolumeExpr = buildVolumeExpression(songSegments, videoDuration, 0.0);

      // Filter complex:
      // 1) Apply volume curves to both audio streams
      // 2) Mix them together
      // 3) Take video from input 0
      const filterComplex = [
        `[0:a]volume='${origVolumeExpr}':eval=frame[orig]`,
        `[1:a]aloop=loop=-1:size=2e+09,atrim=0:${videoDuration},asetpts=PTS-STARTPTS,volume='${songVolumeExpr}':eval=frame[song]`,
        `[orig][song]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]`,
      ].join(";");

      console.log(`[Render] Starting ffmpeg render for project ${projectId}`);
      console.log(`[Render] Filter: ${filterComplex}`);

      ffmpeg()
        .input(tmpVideo)
        .input(tmpSong)
        .complexFilter(filterComplex)
        .outputOptions([
          "-map", "0:v",        // video from input 0
          "-map", "[aout]",     // mixed audio
          "-c:v", "copy",       // don't re-encode video (fast)
          "-c:a", "aac",        // encode audio as AAC
          "-b:a", "192k",       // audio bitrate
          "-shortest",          // stop when shortest stream ends
          "-movflags", "+faststart",
        ])
        .output(tmpOutput)
        .on("start", (cmd) => {
          console.log(`[Render] ffmpeg command: ${cmd}`);
        })
        .on("progress", (progress) => {
          if (progress.percent) {
            console.log(`[Render] Progress: ${Math.round(progress.percent)}%`);
          }
        })
        .on("end", () => {
          console.log(`[Render] ffmpeg render complete for project ${projectId}`);
          resolve();
        })
        .on("error", (err) => {
          console.error(`[Render] ffmpeg error: ${err.message}`);
          reject(new Error(`Render failed: ${err.message}`));
        })
        .run();
    });

    // Upload the rendered file to the "exports" bucket
    const outputBuffer = fs.readFileSync(tmpOutput);
    const storagePath = `${userId}/${projectId}/final.mp4`;

    await uploadFromBuffer("exports", storagePath, outputBuffer, "video/mp4");
    console.log(`[Render] Uploaded final video: exports/${storagePath}`);

    return storagePath;
  } finally {
    fs.unlink(tmpVideo, () => {});
    fs.unlink(tmpSong, () => {});
    fs.unlink(tmpOutput, () => {});
  }
}

/**
 * Build a volume expression string for ffmpeg's volume filter.
 *
 * The expression uses nested if() to set volume levels per time range.
 * For time ranges not covered by any segment, uses `defaultVol`.
 *
 * Example output: "if(between(t,0,5),0.8,if(between(t,5,10),0.5,1.0))"
 */
export function buildVolumeExpression(
  segments: TimelineSegment[],
  duration: number,
  defaultVol: number
): string {
  if (segments.length === 0) {
    return String(defaultVol);
  }

  // Build nested if() expression from the segments
  // Process in reverse so the nesting works correctly
  let expr = String(defaultVol);

  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    const vol = (seg.volume / 100).toFixed(2);
    expr = `if(between(t\\,${seg.start.toFixed(3)}\\,${seg.end.toFixed(3)})\\,${vol}\\,${expr})`;
  }

  return expr;
}

import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import os from "os";
import path from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { getSignedDownloadUrl, uploadFromBuffer } from "./storage.service.js";

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

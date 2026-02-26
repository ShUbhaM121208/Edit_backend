/**
 * Generate small WAV audio files and upload them to the Supabase "songs" bucket.
 * Each file is a short sine-wave tone at different frequencies.
 * Run with: node scripts/upload-sample-songs.js
 */
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  "https://tseyliayhfxrhreziebf.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzZXlsaWF5aGZ4cmhyZXppZWJmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjA4MTcyOSwiZXhwIjoyMDg3NjU3NzI5fQ.6gIRL79dJBMukqpU8B38Vpb2IOiiegWqWObDYIQ03gQ"
);

/**
 * Generate a WAV buffer with a sine-wave tone.
 * @param {number} freq - Frequency in Hz
 * @param {number} durationSec - Duration in seconds
 * @param {number} sampleRate - Sample rate (44100)
 */
function generateWav(freq, durationSec, sampleRate = 44100) {
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataSize = numSamples * 2; // 16-bit mono
  const fileSize = 44 + dataSize;

  const buf = Buffer.alloc(fileSize);
  let offset = 0;

  // RIFF header
  buf.write("RIFF", offset); offset += 4;
  buf.writeUInt32LE(fileSize - 8, offset); offset += 4;
  buf.write("WAVE", offset); offset += 4;

  // fmt chunk
  buf.write("fmt ", offset); offset += 4;
  buf.writeUInt32LE(16, offset); offset += 4; // chunk size
  buf.writeUInt16LE(1, offset); offset += 2;  // PCM
  buf.writeUInt16LE(1, offset); offset += 2;  // mono
  buf.writeUInt32LE(sampleRate, offset); offset += 4;
  buf.writeUInt32LE(sampleRate * 2, offset); offset += 4; // byte rate
  buf.writeUInt16LE(2, offset); offset += 2;  // block align
  buf.writeUInt16LE(16, offset); offset += 2; // bits per sample

  // data chunk
  buf.write("data", offset); offset += 4;
  buf.writeUInt32LE(dataSize, offset); offset += 4;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // Fade in/out to avoid clicks
    const env = Math.min(1, t * 10, (durationSec - t) * 10);
    const sample = Math.floor(env * 0.8 * 32767 * Math.sin(2 * Math.PI * freq * t));
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, sample)), offset);
    offset += 2;
  }

  return buf;
}

const songs = [
  { filename: "sunset-drive.mp3", freq: 261.63, duration: 5 },   // C4
  { filename: "electric-pulse.mp3", freq: 329.63, duration: 5 }, // E4
  { filename: "golden-hour.mp3", freq: 392.00, duration: 5 },    // G4
  { filename: "night-city.mp3", freq: 440.00, duration: 5 },     // A4
  { filename: "feel-good-inc.mp3", freq: 523.25, duration: 5 },  // C5
];

(async () => {
  // First ensure the bucket exists
  const { error: bucketErr } = await supabase.storage.createBucket("songs", {
    public: false,
    fileSizeLimit: 52428800,
    allowedMimeTypes: ["audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/aac"],
  });

  if (bucketErr && !bucketErr.message.includes("already exists")) {
    console.error("Failed to create bucket:", bucketErr.message);
    return;
  }
  console.log("Songs bucket ready");

  for (const song of songs) {
    console.log(`Generating ${song.filename} (${song.freq}Hz, ${song.duration}s)...`);
    const wavBuf = generateWav(song.freq, song.duration);

    // Upload as WAV (the filename says .mp3 but it's WAV — browsers can play both)
    const { error } = await supabase.storage.from("songs").upload(song.filename, wavBuf, {
      contentType: "audio/wav",
      upsert: true,
    });

    if (error) {
      console.error(`  Failed to upload ${song.filename}:`, error.message);
    } else {
      console.log(`  Uploaded ${song.filename} (${wavBuf.length} bytes)`);
    }
  }

  console.log("\nDone — all sample songs uploaded to Supabase Storage");
})();

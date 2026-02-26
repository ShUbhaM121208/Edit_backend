/**
 * Generate musical audio (with chords, melodies, rhythm) and upload to the
 * Supabase "songs" bucket, then update the database records.
 *
 * Run with:  node scripts/upload-real-songs.js
 *
 * No external downloads needed — generates proper WAV audio locally.
 */
const { Client } = require("pg");
const { createClient } = require("@supabase/supabase-js");

// ── Supabase client ──
const supabase = createClient(
  "https://tseyliayhfxrhreziebf.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzZXlsaWF5aGZ4cmhyZXppZWJmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjA4MTcyOSwiZXhwIjoyMDg3NjU3NzI5fQ.6gIRL79dJBMukqpU8B38Vpb2IOiiegWqWObDYIQ03gQ"
);

// ── Postgres client ──
const db = new Client({
  host: "57.182.231.186",
  port: 6543,
  database: "postgres",
  user: "postgres.tseyliayhfxrhreziebf",
  password: "shubhamsingh",
  ssl: { rejectUnauthorized: false },
});

// ── Note frequencies (Hz) ──
const NOTE = {
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.00, A3: 220.00, B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99,
};

const SAMPLE_RATE = 44100;

/**
 * Generate a WAV buffer from raw PCM float samples.
 */
function samplesToWav(samples) {
  const numSamples = samples.length;
  const dataSize = numSamples * 2;
  const fileSize = 44 + dataSize;
  const buf = Buffer.alloc(fileSize);
  let o = 0;
  buf.write("RIFF", o); o += 4;
  buf.writeUInt32LE(fileSize - 8, o); o += 4;
  buf.write("WAVE", o); o += 4;
  buf.write("fmt ", o); o += 4;
  buf.writeUInt32LE(16, o); o += 4;
  buf.writeUInt16LE(1, o); o += 2;  // PCM
  buf.writeUInt16LE(1, o); o += 2;  // mono
  buf.writeUInt32LE(SAMPLE_RATE, o); o += 4;
  buf.writeUInt32LE(SAMPLE_RATE * 2, o); o += 4;
  buf.writeUInt16LE(2, o); o += 2;
  buf.writeUInt16LE(16, o); o += 2;
  buf.write("data", o); o += 4;
  buf.writeUInt32LE(dataSize, o); o += 4;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.floor(s * 32767), o);
    o += 2;
  }
  return buf;
}

/** Sine oscillator */
function sine(freq, t) { return Math.sin(2 * Math.PI * freq * t); }

/** Saw-ish oscillator (warm) */
function saw(freq, t) {
  const p = (freq * t) % 1;
  return 2 * p - 1;
}

/** Square-ish oscillator */
function square(freq, t) { return sine(freq, t) > 0 ? 0.6 : -0.6; }

/** Soft pad: detuned sines */
function pad(freq, t) {
  return (sine(freq, t) + sine(freq * 1.002, t) + sine(freq * 0.998, t)) / 3;
}

/** Simple envelope */
function env(t, attack, sustain, release, total) {
  if (t < attack) return t / attack;
  if (t < attack + sustain) return 1;
  const rel = t - attack - sustain;
  if (rel < release) return 1 - rel / release;
  return 0;
}

/** Kick drum sound */
function kick(t) {
  if (t > 0.3) return 0;
  const freq = 150 * Math.exp(-t * 20) + 40;
  return Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * 8) * 0.9;
}

/** Hi-hat (noise burst) */
function hihat(t) {
  if (t > 0.08) return 0;
  return (Math.random() * 2 - 1) * Math.exp(-t * 60) * 0.3;
}

/** Snare (noise + tone) */
function snare(t) {
  if (t > 0.15) return 0;
  const tone = Math.sin(2 * Math.PI * 200 * t) * 0.3;
  const noise = (Math.random() * 2 - 1) * 0.5;
  return (tone + noise) * Math.exp(-t * 15);
}

// ────────────────────────────────────────
// Song generators — each returns a Float64Array of samples
// ────────────────────────────────────────

function generateChillSong(durationSec) {
  // Chill: slow pad chords + gentle melody
  const n = Math.floor(SAMPLE_RATE * durationSec);
  const samples = new Float64Array(n);
  const chords = [
    [NOTE.C4, NOTE.E4, NOTE.G4],
    [NOTE.A3, NOTE.C4, NOTE.E4],
    [NOTE.F3, NOTE.A3, NOTE.C4],
    [NOTE.G3, NOTE.B3, NOTE.D4],
  ];
  const melody = [NOTE.E5, NOTE.D5, NOTE.C5, NOTE.E5, NOTE.G5, NOTE.E5, NOTE.D5, NOTE.C5];
  const bpm = 70;
  const beatLen = 60 / bpm;

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const beat = t / beatLen;
    const chordIdx = Math.floor(beat / 4) % chords.length;
    const chord = chords[chordIdx];
    // Pad
    let s = 0;
    for (const f of chord) s += pad(f, t) * 0.12;
    // Bass
    s += sine(chord[0] / 2, t) * 0.15;
    // Melody
    const melIdx = Math.floor(beat) % melody.length;
    const melT = (beat % 1) * beatLen;
    s += sine(melody[melIdx], t) * env(melT, 0.05, beatLen * 0.4, beatLen * 0.3, beatLen) * 0.18;
    // Soft kick on beats
    if (Math.floor(beat) !== Math.floor(beat - 1 / SAMPLE_RATE * bpm / 60)) {
      // reset handled by modular timing below
    }
    const kickT = (beat % 2) * beatLen;
    s += kick(kickT) * 0.4;

    // Fade in/out
    const fadeIn = Math.min(1, t * 2);
    const fadeOut = Math.min(1, (durationSec - t) * 2);
    samples[i] = s * fadeIn * fadeOut;
  }
  return samples;
}

function generateEnergeticSong(durationSec) {
  const n = Math.floor(SAMPLE_RATE * durationSec);
  const samples = new Float64Array(n);
  const bassNotes = [NOTE.E3, NOTE.E3, NOTE.G3, NOTE.A3];
  const melody = [NOTE.E5, NOTE.G5, NOTE.B4, NOTE.E5, NOTE.D5, NOTE.B4, NOTE.A4, NOTE.G4];
  const bpm = 128;
  const beatLen = 60 / bpm;

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const beat = t / beatLen;
    let s = 0;
    // Four-on-the-floor kick
    const kickT = (beat % 1) * beatLen;
    s += kick(kickT) * 0.5;
    // Off-beat hihat
    const hhT = ((beat + 0.5) % 1) * beatLen;
    s += hihat(hhT) * 0.5;
    // Snare on 2 and 4
    const snrT = ((beat + 1) % 2) * beatLen;
    s += snare(snrT) * 0.4;
    // Saw bass
    const bassIdx = Math.floor(beat / 2) % bassNotes.length;
    s += saw(bassNotes[bassIdx], t) * 0.12;
    // Melody
    const melIdx = Math.floor(beat / 0.5) % melody.length;
    const melT = (beat % 0.5) * beatLen;
    s += square(melody[melIdx] , t) * env(melT, 0.01, beatLen * 0.2, beatLen * 0.2, beatLen) * 0.08;
    // Chord stabs every 4 beats
    const stabT = (beat % 4) * beatLen;
    if (stabT < 0.2) {
      s += (sine(NOTE.E4, t) + sine(NOTE.G4, t) + sine(NOTE.B4, t)) / 3 * 0.15 * (1 - stabT / 0.2);
    }
    const fadeIn = Math.min(1, t * 2);
    const fadeOut = Math.min(1, (durationSec - t) * 2);
    samples[i] = s * fadeIn * fadeOut;
  }
  return samples;
}

function generateRomanticSong(durationSec) {
  const n = Math.floor(SAMPLE_RATE * durationSec);
  const samples = new Float64Array(n);
  const chords = [
    [NOTE.C4, NOTE.E4, NOTE.G4],
    [NOTE.F3, NOTE.A3, NOTE.C4],
    [NOTE.G3, NOTE.B3, NOTE.D4],
    [NOTE.A3, NOTE.C4, NOTE.E4],
  ];
  const melody = [NOTE.G5, NOTE.E5, NOTE.C5, NOTE.D5, NOTE.E5, NOTE.G5, NOTE.A4, NOTE.G4];
  const bpm = 80;
  const beatLen = 60 / bpm;

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const beat = t / beatLen;
    const chordIdx = Math.floor(beat / 4) % chords.length;
    const chord = chords[chordIdx];
    let s = 0;
    // Arpeggio — play chord notes one at a time
    const arpIdx = Math.floor(beat * 2) % 3;
    s += sine(chord[arpIdx], t) * 0.18;
    // Soft pad
    for (const f of chord) s += pad(f, t) * 0.06;
    // Bass
    s += sine(chord[0] / 2, t) * 0.12;
    // Melody with vibrato
    const melIdx = Math.floor(beat) % melody.length;
    const vibrato = 1 + 0.003 * Math.sin(2 * Math.PI * 5 * t);
    const melT = (beat % 1) * beatLen;
    s += sine(melody[melIdx] * vibrato, t) * env(melT, 0.08, beatLen * 0.5, beatLen * 0.3, beatLen) * 0.2;

    const fadeIn = Math.min(1, t * 2);
    const fadeOut = Math.min(1, (durationSec - t) * 2);
    samples[i] = s * fadeIn * fadeOut;
  }
  return samples;
}

function generateDramaticSong(durationSec) {
  const n = Math.floor(SAMPLE_RATE * durationSec);
  const samples = new Float64Array(n);
  const chords = [
    [NOTE.A3, NOTE.C4, NOTE.E4],     // Am
    [NOTE.F3, NOTE.A3, NOTE.C4],     // F
    [NOTE.E3, NOTE.G3, NOTE.B3],     // Em
    [NOTE.G3, NOTE.B3, NOTE.D4],     // G
  ];
  const bpm = 90;
  const beatLen = 60 / bpm;

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const beat = t / beatLen;
    const chordIdx = Math.floor(beat / 4) % chords.length;
    const chord = chords[chordIdx];
    let s = 0;
    // Deep pad
    for (const f of chord) s += pad(f, t) * 0.1;
    // Low rumble bass
    s += (sine(chord[0] / 2, t) + sine(chord[0] / 4, t) * 0.5) * 0.12;
    // Dramatic hits on beats 1 and 3
    const hitPhase = beat % 4;
    if (hitPhase < 0.15 || (hitPhase > 2 && hitPhase < 2.15)) {
      s += (sine(chord[0], t) + sine(chord[1], t) + sine(chord[2], t)) / 3 * 0.3;
    }
    // Kick and snare
    const kickT = (beat % 1) * beatLen;
    s += kick(kickT) * 0.5;
    const snrT = ((beat + 1) % 2) * beatLen;
    s += snare(snrT) * 0.35;
    // String-like melody
    const melNotes = [NOTE.E5, NOTE.C5, NOTE.A4, NOTE.B4, NOTE.C5, NOTE.E5, NOTE.D5, NOTE.A4];
    const melIdx = Math.floor(beat) % melNotes.length;
    const melT = (beat % 1) * beatLen;
    s += pad(melNotes[melIdx], t) * env(melT, 0.1, beatLen * 0.4, beatLen * 0.4, beatLen) * 0.15;

    const fadeIn = Math.min(1, t * 2);
    const fadeOut = Math.min(1, (durationSec - t) * 2);
    samples[i] = s * fadeIn * fadeOut;
  }
  return samples;
}

function generateUpbeatSong(durationSec) {
  const n = Math.floor(SAMPLE_RATE * durationSec);
  const samples = new Float64Array(n);
  const bassNotes = [NOTE.C3, NOTE.G3, NOTE.A3, NOTE.F3];
  const chords = [
    [NOTE.C4, NOTE.E4, NOTE.G4],
    [NOTE.G3, NOTE.B3, NOTE.D4],
    [NOTE.A3, NOTE.C4, NOTE.E4],
    [NOTE.F3, NOTE.A3, NOTE.C4],
  ];
  const melody = [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.E5, NOTE.C5, NOTE.D5, NOTE.E5, NOTE.G5];
  const bpm = 120;
  const beatLen = 60 / bpm;

  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const beat = t / beatLen;
    const chordIdx = Math.floor(beat / 4) % chords.length;
    const chord = chords[chordIdx];
    let s = 0;
    // Punchy kick
    const kickT = (beat % 1) * beatLen;
    s += kick(kickT) * 0.45;
    // Hihat every 8th note
    const hhT = (beat % 0.5) * beatLen;
    s += hihat(hhT) * 0.25;
    // Snare on 2 and 4
    const snrT = ((beat + 1) % 2) * beatLen;
    s += snare(snrT) * 0.35;
    // Staccato chord stabs on every 8th
    const stabT = (beat % 0.5) * beatLen;
    if (stabT < 0.06) {
      for (const f of chord) s += sine(f, t) * 0.08;
    }
    // Walking bass
    const bassIdx = Math.floor(beat / 2) % bassNotes.length;
    s += saw(bassNotes[bassIdx], t) * 0.1;
    // Melody
    const melIdx = Math.floor(beat / 0.5) % melody.length;
    const melT = (beat % 0.5) * beatLen;
    s += sine(melody[melIdx], t) * env(melT, 0.01, beatLen * 0.2, beatLen * 0.2, beatLen) * 0.15;

    const fadeIn = Math.min(1, t * 2);
    const fadeOut = Math.min(1, (durationSec - t) * 2);
    samples[i] = s * fadeIn * fadeOut;
  }
  return samples;
}

// ── Song definitions ──
const songs = [
  {
    title: "Sunset Drive",
    artist: "Chillwave Co.",
    duration: "0:30",
    mood: "CHILL",
    filename: "sunset-drive.mp3",
    generate: () => generateChillSong(30),
  },
  {
    title: "Electric Pulse",
    artist: "Beat Machine",
    duration: "0:30",
    mood: "ENERGETIC",
    filename: "electric-pulse.mp3",
    generate: () => generateEnergeticSong(30),
  },
  {
    title: "Golden Hour",
    artist: "Indie Waves",
    duration: "0:30",
    mood: "ROMANTIC",
    filename: "golden-hour.mp3",
    generate: () => generateRomanticSong(30),
  },
  {
    title: "Night City",
    artist: "Synthboy",
    duration: "0:30",
    mood: "DRAMATIC",
    filename: "night-city.mp3",
    generate: () => generateDramaticSong(30),
  },
  {
    title: "Feel Good Inc.",
    artist: "Vibe Studio",
    duration: "0:30",
    mood: "UPBEAT",
    filename: "feel-good-inc.mp3",
    generate: () => generateUpbeatSong(30),
  },
];

(async () => {
  console.log("=== Generating & uploading musical audio to Supabase ===\n");

  // Ensure bucket exists
  const { error: bucketErr } = await supabase.storage.createBucket("songs", {
    public: false,
    fileSizeLimit: 52428800,
    allowedMimeTypes: ["audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/aac"],
  });
  if (bucketErr && !bucketErr.message.includes("already exists")) {
    console.error("Failed to create bucket:", bucketErr.message);
    return;
  }
  console.log("Songs bucket ready\n");

  for (const song of songs) {
    // Step 1: Generate audio locally
    console.log(`Generating "${song.title}" (${song.mood})...`);
    const samples = song.generate();
    const wavBuf = samplesToWav(samples);
    console.log(`  Generated ${(wavBuf.length / 1024).toFixed(0)} KB WAV`);

    // Step 2: Upload to Supabase Storage (upsert to overwrite old files)
    console.log(`  Uploading to songs/${song.filename}...`);
    const { error } = await supabase.storage.from("songs").upload(song.filename, wavBuf, {
      contentType: "audio/wav",
      upsert: true,
    });

    if (error) {
      console.error(`  Upload failed: ${error.message}`);
    } else {
      console.log(`  Uploaded successfully`);
    }
  }

  // Step 3: Update database records
  console.log("\nUpdating database song records...");
  await db.connect();

  for (const song of songs) {
    const result = await db.query(
      `UPDATE songs SET "fileUrl" = $1, duration = $2 WHERE title = $3`,
      [song.filename, song.duration, song.title]
    );
    if (result.rowCount > 0) {
      console.log(`  Updated "${song.title}" → ${song.filename}`);
    } else {
      console.log(`  Song "${song.title}" not found in DB, inserting...`);
      await db.query(
        `INSERT INTO songs (id, title, artist, duration, mood, "fileUrl", "createdAt")
         VALUES (gen_random_uuid(), $1, $2, $3, $4::"Mood", $5, NOW())`,
        [song.title, song.artist, song.duration, song.mood, song.filename]
      );
      console.log(`  Inserted "${song.title}"`);
    }
  }

  await db.end();
  console.log("\n=== Done — all songs now have real musical audio! ===");
})();

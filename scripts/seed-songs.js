/**
 * Seed the songs table with 5 sample songs.
 * Run with: node scripts/seed-songs.js
 *
 * Audio files should be uploaded separately to the "songs" Supabase bucket.
 * The fileUrl column stores the storage path (e.g. "sunset-drive.mp3").
 */
const { Client } = require("pg");

const c = new Client({
  host: "57.182.231.186",
  port: 6543,
  database: "postgres",
  user: "postgres.tseyliayhfxrhreziebf",
  password: "shubhamsingh",
  ssl: { rejectUnauthorized: false },
});

const songs = [
  {
    title: "Sunset Drive",
    artist: "Chillwave Co.",
    duration: "3:24",
    mood: "CHILL",
    fileUrl: "sunset-drive.mp3",
  },
  {
    title: "Electric Pulse",
    artist: "Beat Machine",
    duration: "2:58",
    mood: "ENERGETIC",
    fileUrl: "electric-pulse.mp3",
  },
  {
    title: "Golden Hour",
    artist: "Indie Waves",
    duration: "4:01",
    mood: "ROMANTIC",
    fileUrl: "golden-hour.mp3",
  },
  {
    title: "Night City",
    artist: "Synthboy",
    duration: "3:12",
    mood: "DRAMATIC",
    fileUrl: "night-city.mp3",
  },
  {
    title: "Feel Good Inc.",
    artist: "Vibe Studio",
    duration: "2:45",
    mood: "UPBEAT",
    fileUrl: "feel-good-inc.mp3",
  },
];

(async () => {
  await c.connect();
  console.log("Connected to database");

  // Ensure Mood enum exists (should already from Prisma migration)
  await c.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Mood') THEN
        CREATE TYPE "Mood" AS ENUM ('CHILL', 'ENERGETIC', 'ROMANTIC', 'DRAMATIC', 'UPBEAT');
      END IF;
    END $$;
  `);
  console.log("Mood enum ready");

  for (const song of songs) {
    // Upsert: skip if a song with this title already exists
    const existing = await c.query("SELECT id FROM songs WHERE title = $1", [song.title]);
    if (existing.rows.length > 0) {
      console.log(`  Song "${song.title}" already exists — skipping`);
      continue;
    }

    await c.query(
      `INSERT INTO songs (id, title, artist, duration, mood, "fileUrl", "createdAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4::\"Mood\", $5, NOW())`,
      [song.title, song.artist, song.duration, song.mood, song.fileUrl]
    );
    console.log(`  Inserted "${song.title}"`);
  }

  console.log("\nDone — seeded songs table");
  await c.end();
})();

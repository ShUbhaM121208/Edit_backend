const { Client } = require("pg");

const c = new Client({
  connectionString:
    "postgresql://postgres.tseyliayhfxrhreziebf:shubhamsingh@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres",
  ssl: { rejectUnauthorized: false },
});

(async () => {
  await c.connect();
  console.log("Connected");

  // Create Track enum if not exists
  await c.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Track') THEN
        CREATE TYPE "Track" AS ENUM ('ORIGINAL', 'SONG');
      END IF;
    END $$;
  `);
  console.log("Track enum ready");

  // Create timeline_segments table
  await c.query(`
    CREATE TABLE IF NOT EXISTS timeline_segments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      start DOUBLE PRECISION NOT NULL,
      "end" DOUBLE PRECISION NOT NULL,
      track "Track" NOT NULL,
      volume INT NOT NULL DEFAULT 100,
      "order" INT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "projectId" UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE
    );
  `);
  console.log("timeline_segments table created");

  // Create index
  await c.query(
    'CREATE INDEX IF NOT EXISTS timeline_segments_projectId_idx ON timeline_segments ("projectId");'
  );
  console.log("Index created");

  // Verify
  const res = await c.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'timeline_segments' ORDER BY ordinal_position"
  );
  console.log(
    "Columns:",
    res.rows.map((r) => r.column_name + " (" + r.data_type + ")").join(", ")
  );

  await c.end();
  console.log("Done!");
})().catch((e) => {
  console.error("Migration failed:", e.message);
  process.exit(1);
});

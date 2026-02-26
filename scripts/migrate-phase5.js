/**
 * Phase 5 migration: Add RENDERING status and finalVideoUrl field.
 * Run with: node scripts/migrate-phase5.js
 *
 * This applies the schema changes directly via SQL since
 * `prisma migrate dev` requires connectivity at command time.
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

(async () => {
  await c.connect();
  console.log("Connected to database");

  // 1. Add RENDERING to ProjectStatus enum (if not already present)
  await c.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'RENDERING'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'ProjectStatus')
      ) THEN
        ALTER TYPE "ProjectStatus" ADD VALUE 'RENDERING' AFTER 'PROCESSING';
      END IF;
    END $$;
  `);
  console.log("  ProjectStatus.RENDERING enum value ready");

  // 2. Add finalVideoUrl column to projects table (if not already present)
  await c.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'projects' AND column_name = 'finalVideoUrl'
      ) THEN
        ALTER TABLE projects ADD COLUMN "finalVideoUrl" TEXT;
      END IF;
    END $$;
  `);
  console.log("  projects.finalVideoUrl column ready");

  console.log("\nPhase 5 migration complete!");
  await c.end();
})();

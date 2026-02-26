/**
 * Phase 6 Migration — Add instagramUsername column to users table.
 * (instagramConnected already exists from a prior migration.)
 *
 * Run: node scripts/migrate-phase6.js
 */
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  db: { schema: "public" },
});

async function migrate() {
  console.log("[Phase 6] Adding instagramUsername column to users table...");

  const { error } = await supabase.rpc("exec_sql", {
    sql: `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS "instagramUsername" TEXT;`,
  });

  if (error) {
    // Try direct SQL via REST if RPC not available
    console.log("[Phase 6] RPC not available, trying prisma db push instead...");
    const { execSync } = await import("child_process");
    execSync("npx prisma db push --accept-data-loss", { stdio: "inherit" });
  } else {
    console.log("[Phase 6] ✓ instagramUsername column added");
  }

  // Regenerate Prisma client
  const { execSync } = await import("child_process");
  execSync("npx prisma generate", { stdio: "inherit" });
  console.log("[Phase 6] ✓ Prisma client regenerated");
  console.log("[Phase 6] Migration complete!");
}

migrate().catch((err) => {
  console.error("[Phase 6] Migration failed:", err);
  process.exit(1);
});

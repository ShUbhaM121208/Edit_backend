import { createClient } from "@supabase/supabase-js";
import { env } from "./env.js";

export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/**
 * Ensure storage buckets exist on startup.
 * Runs once — safe to call multiple times.
 */
export async function ensureStorageBuckets() {
  const buckets = ["videos", "thumbnails"];

  for (const bucket of buckets) {
    const { error } = await supabase.storage.createBucket(bucket, {
      public: false,
      fileSizeLimit: 52428800, // 50 MB (free tier limit)
      allowedMimeTypes:
        bucket === "videos"
          ? ["video/mp4", "video/quicktime", "video/webm", "video/x-msvideo"]
          : ["image/jpeg", "image/png", "image/webp"],
    });

    if (error && !error.message.includes("already exists")) {
      console.error(`[Storage] Failed to create bucket "${bucket}":`, error.message);
    } else {
      console.log(`[Storage] Bucket "${bucket}" ready`);
    }
  }
}

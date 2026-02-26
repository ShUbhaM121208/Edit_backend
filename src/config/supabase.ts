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
  const buckets = [
    {
      name: "videos",
      mimeTypes: ["video/mp4", "video/quicktime", "video/webm", "video/x-msvideo"],
    },
    {
      name: "thumbnails",
      mimeTypes: ["image/jpeg", "image/png", "image/webp"],
    },
    {
      name: "songs",
      mimeTypes: ["audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/aac"],
    },
  ];

  for (const bucket of buckets) {
    const { error } = await supabase.storage.createBucket(bucket.name, {
      public: false,
      fileSizeLimit: 52428800, // 50 MB
      allowedMimeTypes: bucket.mimeTypes,
    });

    if (error && !error.message.includes("already exists")) {
      console.error(`[Storage] Failed to create bucket "${bucket.name}":`, error.message);
    } else {
      console.log(`[Storage] Bucket "${bucket.name}" ready`);
    }
  }
}

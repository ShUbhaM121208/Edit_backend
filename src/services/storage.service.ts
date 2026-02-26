import { supabase } from "../config/supabase.js";

/**
 * Generate a signed upload URL for direct client-to-Supabase upload.
 * Returns { signedUrl, token, path } — the client PUTs the file to signedUrl.
 */
export async function generateSignedUploadUrl(
  bucket: string,
  storagePath: string
) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    throw new Error(`Failed to create upload URL: ${error?.message || "Unknown error"}`);
  }

  return {
    signedUrl: data.signedUrl,
    token: data.token,
    path: data.path,
  };
}

/**
 * Generate a signed download URL (valid for 1 hour).
 */
export async function getSignedDownloadUrl(
  bucket: string,
  storagePath: string,
  expiresIn = 3600
) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, expiresIn);

  if (error || !data) {
    throw new Error(`Failed to create download URL: ${error?.message || "Unknown error"}`);
  }

  return data.signedUrl;
}

/**
 * Upload a buffer directly from the backend (used for thumbnails).
 */
export async function uploadFromBuffer(
  bucket: string,
  storagePath: string,
  buffer: Buffer,
  contentType: string
) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(storagePath, buffer, {
      contentType,
      upsert: true,
    });

  if (error) {
    throw new Error(`Failed to upload file: ${error.message}`);
  }

  return data.path;
}

/**
 * Delete a file from storage.
 */
export async function deleteFromStorage(bucket: string, paths: string[]) {
  const { error } = await supabase.storage.from(bucket).remove(paths);
  if (error) {
    console.error(`[Storage] Failed to delete files from ${bucket}:`, error.message);
  }
}

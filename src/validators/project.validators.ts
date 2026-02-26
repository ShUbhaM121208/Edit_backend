import { z } from "zod";

export const createProjectSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(100, "Title must be 100 characters or less")
    .trim(),
});

export const requestUploadUrlSchema = z.object({
  filename: z
    .string()
    .min(1, "Filename is required")
    .max(255, "Filename too long"),
  contentType: z.enum(
    ["video/mp4", "video/quicktime", "video/webm", "video/x-msvideo"],
    { errorMap: () => ({ message: "Unsupported video format. Use MP4, MOV, WebM, or AVI." }) }
  ),
});

export const confirmUploadSchema = z.object({
  storagePath: z
    .string()
    .min(1, "Storage path is required"),
});

export const syncSegmentsSchema = z.object({
  segments: z
    .array(
      z.object({
        start: z.number().min(0, "Start must be >= 0"),
        end: z.number().min(0, "End must be >= 0"),
        track: z.enum(["ORIGINAL", "SONG"], {
          errorMap: () => ({ message: "Track must be ORIGINAL or SONG" }),
        }),
        volume: z.number().int().min(0).max(100).default(100),
        order: z.number().int().min(0),
      })
    )
    .max(50, "Maximum 50 segments allowed"),
});

export const selectSongSchema = z.object({
  songId: z.string().uuid("Invalid song ID"),
});

export const renderProjectSchema = z.object({
  quality: z
    .enum(["720p", "1080p"], {
      errorMap: () => ({ message: "Quality must be 720p or 1080p" }),
    })
    .default("1080p")
    .optional(),
});

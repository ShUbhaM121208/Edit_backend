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

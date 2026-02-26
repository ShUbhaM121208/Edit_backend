import type { Request, Response, NextFunction } from "express";
import {
  createProjectSchema,
  requestUploadUrlSchema,
  confirmUploadSchema,
} from "../validators/project.validators.js";
import * as projectService from "../services/project.service.js";
import * as storageService from "../services/storage.service.js";
import * as videoService from "../services/video.service.js";

/**
 * POST /api/projects — Create a new project
 */
export async function handleCreateProject(req: Request, res: Response, next: NextFunction) {
  try {
    const { title } = createProjectSchema.parse(req.body);
    const userId = req.user!.userId;

    const project = await projectService.createProject(userId, title);

    res.status(201).json({
      success: true,
      project,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/projects — List all projects for the authenticated user
 */
export async function handleGetProjects(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    const projects = await projectService.getProjectsByUser(userId);

    res.json({
      success: true,
      projects,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/projects/:id — Get a single project
 */
export async function handleGetProject(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    const project = await projectService.getProjectById(req.params.id as string, userId);

    if (!project) {
      res.status(404).json({ success: false, message: "Project not found" });
      return;
    }

    res.json({ success: true, project });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/projects/:id/upload-url — Generate a signed upload URL
 */
export async function handleRequestUploadUrl(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    const projectId = req.params.id as string;

    // Verify project exists and belongs to user
    const project = await projectService.getProjectById(projectId, userId);
    if (!project) {
      res.status(404).json({ success: false, message: "Project not found" });
      return;
    }

    const { filename, contentType } = requestUploadUrlSchema.parse(req.body);

    // Build storage path: videos/{userId}/{projectId}/{filename}
    const storagePath = `${userId}/${projectId}/${filename}`;

    const uploadData = await storageService.generateSignedUploadUrl("videos", storagePath);

    res.json({
      success: true,
      uploadUrl: uploadData.signedUrl,
      token: uploadData.token,
      storagePath,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/projects/:id/upload-complete — Confirm upload & trigger processing
 */
export async function handleConfirmUpload(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    const projectId = req.params.id as string;

    const project = await projectService.getProjectById(projectId, userId);
    if (!project) {
      res.status(404).json({ success: false, message: "Project not found" });
      return;
    }

    const { storagePath } = confirmUploadSchema.parse(req.body);

    // Update project to PROCESSING immediately
    await projectService.updateProject(projectId, {
      videoUrl: storagePath,
      status: "PROCESSING",
    });

    // Respond immediately — processing happens async
    res.json({
      success: true,
      message: "Upload confirmed. Processing video...",
      project: { id: projectId, status: "PROCESSING" },
    });

    // ── Async background processing ──
    (async () => {
      try {
        console.log(`[Video] Processing project ${projectId}...`);

        // Get a signed download URL for ffmpeg to access
        const downloadUrl = await storageService.getSignedDownloadUrl("videos", storagePath);

        // Extract duration
        const duration = await videoService.extractDuration(downloadUrl);
        console.log(`[Video] Duration: ${duration}s`);

        // Generate thumbnail
        const thumbPath = await videoService.generateThumbnail(downloadUrl, userId, projectId);
        console.log(`[Video] Thumbnail: ${thumbPath}`);

        // Update project with metadata
        await projectService.updateProject(projectId, {
          duration,
          thumbnailUrl: thumbPath,
          status: "DRAFT", // back to DRAFT — ready for editing
        });

        console.log(`[Video] Project ${projectId} processing complete`);
      } catch (err) {
        console.error(`[Video] Processing failed for ${projectId}:`, err);
        // Set status back to DRAFT even on failure so it's not stuck in PROCESSING
        await projectService.updateProject(projectId, { status: "DRAFT" }).catch(() => {});
      }
    })();
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/projects/:id — Delete a project and its storage files
 */
export async function handleDeleteProject(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    const projectId = req.params.id as string;

    const deleted = await projectService.deleteProject(projectId, userId);
    if (!deleted) {
      res.status(404).json({ success: false, message: "Project not found" });
      return;
    }

    // Clean up storage files (best-effort, non-blocking)
    if (deleted.videoUrl) {
      storageService.deleteFromStorage("videos", [deleted.videoUrl]).catch(() => {});
    }
    if (deleted.thumbnailUrl) {
      storageService.deleteFromStorage("thumbnails", [deleted.thumbnailUrl]).catch(() => {});
    }

    res.json({ success: true, message: "Project deleted" });
  } catch (error) {
    next(error);
  }
}

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { handleRenderProject, handleGetProject, handleDeleteProject } from "../../controllers/project.controller.js";

// ──────────────────────────────────────
// Mock all dependencies
// ──────────────────────────────────────

vi.mock("../../services/project.service.js", () => ({
  getProjectById: vi.fn(),
  updateProject: vi.fn(),
  enrichWithSignedUrls: vi.fn(),
  enrichWithFinalVideoUrl: vi.fn(),
  deleteProject: vi.fn(),
}));

vi.mock("../../services/storage.service.js", () => ({
  getSignedDownloadUrl: vi.fn(),
  deleteFromStorage: vi.fn(),
}));

vi.mock("../../services/video.service.js", () => ({
  renderFinalVideo: vi.fn(),
}));

import * as projectService from "../../services/project.service.js";
import * as storageService from "../../services/storage.service.js";
import * as videoService from "../../services/video.service.js";

// ──────────────────────────────────────
// Helpers
// ──────────────────────────────────────

function createMocks(overrides?: { body?: any; params?: any; user?: any }) {
  const req = {
    body: overrides?.body || {},
    params: overrides?.params || { id: "proj-123" },
    user: overrides?.user || { userId: "user-456" },
  } as unknown as Request;

  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;

  const next = vi.fn() as NextFunction;

  return { req, res, next };
}

function makeProject(overrides: Record<string, unknown> = {}) {
  return {
    id: "proj-123",
    title: "Test Project",
    userId: "user-456",
    status: "DRAFT",
    videoUrl: "user-456/proj-123/video.mp4",
    thumbnailUrl: "user-456/proj-123/thumbnail.jpg",
    finalVideoUrl: null,
    duration: 30,
    selectedSongId: "song-789",
    selectedSong: { id: "song-789", fileUrl: "songs/chill.wav", title: "Chill", artist: "Bot" },
    segments: [
      { start: 0, end: 15, track: "ORIGINAL", volume: 80, order: 0 },
      { start: 0, end: 30, track: "SONG", volume: 60, order: 1 },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ──────────────────────────────────────
// handleRenderProject
// ──────────────────────────────────────

describe("handleRenderProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 404 if project not found", async () => {
    vi.mocked(projectService.getProjectById).mockResolvedValue(null);
    const { req, res, next } = createMocks();

    await handleRenderProject(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: "Project not found" })
    );
  });

  it("should return 400 if no video uploaded", async () => {
    const project = makeProject({ videoUrl: null });
    vi.mocked(projectService.getProjectById).mockResolvedValue(project as any);
    const { req, res, next } = createMocks();

    await handleRenderProject(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "No video uploaded for this project" })
    );
  });

  it("should return 400 if no song selected (null selectedSongId)", async () => {
    const project = makeProject({ selectedSongId: null, selectedSong: null });
    vi.mocked(projectService.getProjectById).mockResolvedValue(project as any);
    const { req, res, next } = createMocks();

    await handleRenderProject(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "No song selected for this project" })
    );
  });

  it("should return 400 if selectedSong object is missing", async () => {
    const project = makeProject({ selectedSongId: "song-789", selectedSong: null });
    vi.mocked(projectService.getProjectById).mockResolvedValue(project as any);
    const { req, res, next } = createMocks();

    await handleRenderProject(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "No song selected for this project" })
    );
  });

  it("should return 409 if project is already RENDERING", async () => {
    const project = makeProject({ status: "RENDERING" });
    vi.mocked(projectService.getProjectById).mockResolvedValue(project as any);
    const { req, res, next } = createMocks();

    await handleRenderProject(req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Project is already rendering" })
    );
  });

  it("should accept and respond 202 for a valid render request", async () => {
    const project = makeProject();
    vi.mocked(projectService.getProjectById).mockResolvedValue(project as any);
    vi.mocked(projectService.updateProject).mockResolvedValue({} as any);
    vi.mocked(storageService.getSignedDownloadUrl).mockResolvedValue("https://signed-url.example.com");
    vi.mocked(videoService.renderFinalVideo).mockResolvedValue("user-456/proj-123/final.mp4");
    const { req, res, next } = createMocks();

    await handleRenderProject(req, res, next);

    expect(projectService.updateProject).toHaveBeenCalledWith("proj-123", { status: "RENDERING" });
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        project: { id: "proj-123", status: "RENDERING" },
      })
    );
  });

  it("should still accept render when project status is EXPORTED (re-render)", async () => {
    const project = makeProject({ status: "EXPORTED" });
    vi.mocked(projectService.getProjectById).mockResolvedValue(project as any);
    vi.mocked(projectService.updateProject).mockResolvedValue({} as any);
    vi.mocked(storageService.getSignedDownloadUrl).mockResolvedValue("https://signed-url.example.com");
    vi.mocked(videoService.renderFinalVideo).mockResolvedValue("user-456/proj-123/final.mp4");
    const { req, res, next } = createMocks();

    await handleRenderProject(req, res, next);

    expect(res.status).toHaveBeenCalledWith(202);
  });

  it("should accept render when project status is DRAFT", async () => {
    const project = makeProject({ status: "DRAFT" });
    vi.mocked(projectService.getProjectById).mockResolvedValue(project as any);
    vi.mocked(projectService.updateProject).mockResolvedValue({} as any);
    vi.mocked(storageService.getSignedDownloadUrl).mockResolvedValue("https://signed-url.example.com");
    vi.mocked(videoService.renderFinalVideo).mockResolvedValue("user-456/proj-123/final.mp4");
    const { req, res, next } = createMocks();

    await handleRenderProject(req, res, next);

    expect(res.status).toHaveBeenCalledWith(202);
  });

  it("should accept render with empty segments array", async () => {
    const project = makeProject({ segments: [] });
    vi.mocked(projectService.getProjectById).mockResolvedValue(project as any);
    vi.mocked(projectService.updateProject).mockResolvedValue({} as any);
    vi.mocked(storageService.getSignedDownloadUrl).mockResolvedValue("https://signed-url.example.com");
    vi.mocked(videoService.renderFinalVideo).mockResolvedValue("user-456/proj-123/final.mp4");
    const { req, res, next } = createMocks();

    await handleRenderProject(req, res, next);

    expect(res.status).toHaveBeenCalledWith(202);
  });

  it("should accept render with no body (quality defaults)", async () => {
    const project = makeProject();
    vi.mocked(projectService.getProjectById).mockResolvedValue(project as any);
    vi.mocked(projectService.updateProject).mockResolvedValue({} as any);
    vi.mocked(storageService.getSignedDownloadUrl).mockResolvedValue("https://signed-url.example.com");
    vi.mocked(videoService.renderFinalVideo).mockResolvedValue("user-456/proj-123/final.mp4");
    const { req, res, next } = createMocks({ body: undefined });

    await handleRenderProject(req, res, next);

    expect(res.status).toHaveBeenCalledWith(202);
  });

  it("should use fallback duration of 30s if project.duration is null", async () => {
    const project = makeProject({ duration: null });
    vi.mocked(projectService.getProjectById).mockResolvedValue(project as any);
    vi.mocked(projectService.updateProject).mockResolvedValue({} as any);
    vi.mocked(storageService.getSignedDownloadUrl).mockResolvedValue("https://signed-url.example.com");
    vi.mocked(videoService.renderFinalVideo).mockResolvedValue("user-456/proj-123/final.mp4");
    const { req, res, next } = createMocks();

    await handleRenderProject(req, res, next);

    // Should still respond 202 successfully
    expect(res.status).toHaveBeenCalledWith(202);
  });

  it("should call next with error if getProjectById throws", async () => {
    vi.mocked(projectService.getProjectById).mockRejectedValue(new Error("DB error"));
    const { req, res, next } = createMocks();

    await handleRenderProject(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it("should call next with error if updateProject throws before responding", async () => {
    const project = makeProject();
    vi.mocked(projectService.getProjectById).mockResolvedValue(project as any);
    vi.mocked(projectService.updateProject).mockRejectedValue(new Error("DB write error"));
    const { req, res, next } = createMocks();

    await handleRenderProject(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it("should reject invalid quality value in body via Zod", async () => {
    const project = makeProject();
    vi.mocked(projectService.getProjectById).mockResolvedValue(project as any);
    vi.mocked(projectService.updateProject).mockResolvedValue({} as any);
    const { req, res, next } = createMocks({ body: { quality: "4k" } });

    await handleRenderProject(req, res, next);

    // Zod parse failure goes to next(error)
    expect(next).toHaveBeenCalled();
  });
});

// ──────────────────────────────────────
// handleGetProject — enrichWithFinalVideoUrl integration
// ──────────────────────────────────────

describe("handleGetProject — enrichWithFinalVideoUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 404 when project is not found", async () => {
    vi.mocked(projectService.getProjectById).mockResolvedValue(null);
    const { req, res, next } = createMocks();

    await handleGetProject(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("should call enrichWithFinalVideoUrl on found project", async () => {
    const project = makeProject();
    vi.mocked(projectService.getProjectById).mockResolvedValue(project as any);
    vi.mocked(projectService.enrichWithSignedUrls).mockResolvedValue({
      ...project,
      signedVideoUrl: "https://signed.example.com/video",
      signedThumbnailUrl: null,
      signedSongUrl: null,
      signedFinalVideoUrl: null,
    } as any);
    vi.mocked(projectService.enrichWithFinalVideoUrl).mockResolvedValue({
      ...project,
      signedVideoUrl: "https://signed.example.com/video",
      signedThumbnailUrl: null,
      signedSongUrl: null,
      signedFinalVideoUrl: "https://signed.example.com/final",
    } as any);
    const { req, res, next } = createMocks();

    await handleGetProject(req, res, next);

    expect(projectService.enrichWithSignedUrls).toHaveBeenCalledWith(project);
    expect(projectService.enrichWithFinalVideoUrl).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        project: expect.objectContaining({ signedFinalVideoUrl: "https://signed.example.com/final" }),
      })
    );
  });

  it("should return signedFinalVideoUrl as null when project has no finalVideoUrl", async () => {
    const project = makeProject({ finalVideoUrl: null });
    vi.mocked(projectService.getProjectById).mockResolvedValue(project as any);
    vi.mocked(projectService.enrichWithSignedUrls).mockResolvedValue({
      ...project,
      signedVideoUrl: null,
      signedThumbnailUrl: null,
      signedSongUrl: null,
      signedFinalVideoUrl: null,
    } as any);
    vi.mocked(projectService.enrichWithFinalVideoUrl).mockImplementation(async (enriched) => enriched);
    const { req, res, next } = createMocks();

    await handleGetProject(req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        project: expect.objectContaining({ signedFinalVideoUrl: null }),
      })
    );
  });
});

// ──────────────────────────────────────
// handleDeleteProject — cleanup of exports bucket
// ──────────────────────────────────────

describe("handleDeleteProject — exports cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 404 when project not found", async () => {
    vi.mocked(projectService.deleteProject).mockResolvedValue(null as any);
    const { req, res, next } = createMocks();

    await handleDeleteProject(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("should clean up exports bucket when finalVideoUrl exists", async () => {
    const deleted = {
      id: "proj-123",
      videoUrl: "user/proj/video.mp4",
      thumbnailUrl: "user/proj/thumb.jpg",
      finalVideoUrl: "user/proj/final.mp4",
    };
    vi.mocked(projectService.deleteProject).mockResolvedValue(deleted as any);
    vi.mocked(storageService.deleteFromStorage).mockResolvedValue(undefined);
    const { req, res, next } = createMocks();

    await handleDeleteProject(req, res, next);

    expect(storageService.deleteFromStorage).toHaveBeenCalledWith("exports", ["user/proj/final.mp4"]);
    expect(storageService.deleteFromStorage).toHaveBeenCalledWith("videos", ["user/proj/video.mp4"]);
    expect(storageService.deleteFromStorage).toHaveBeenCalledWith("thumbnails", ["user/proj/thumb.jpg"]);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, message: "Project deleted" })
    );
  });

  it("should not call deleteFromStorage for exports when finalVideoUrl is null", async () => {
    const deleted = {
      id: "proj-123",
      videoUrl: "user/proj/video.mp4",
      thumbnailUrl: null,
      finalVideoUrl: null,
    };
    vi.mocked(projectService.deleteProject).mockResolvedValue(deleted as any);
    vi.mocked(storageService.deleteFromStorage).mockResolvedValue(undefined);
    const { req, res, next } = createMocks();

    await handleDeleteProject(req, res, next);

    // Should NOT have been called with "exports"
    const exportsCalls = vi.mocked(storageService.deleteFromStorage).mock.calls.filter(
      (call) => call[0] === "exports"
    );
    expect(exportsCalls).toHaveLength(0);
  });

  it("should still respond success even if storage cleanup fails", async () => {
    const deleted = {
      id: "proj-123",
      videoUrl: "user/proj/video.mp4",
      thumbnailUrl: "user/proj/thumb.jpg",
      finalVideoUrl: "user/proj/final.mp4",
    };
    vi.mocked(projectService.deleteProject).mockResolvedValue(deleted as any);
    vi.mocked(storageService.deleteFromStorage).mockRejectedValue(new Error("Storage error"));
    const { req, res, next } = createMocks();

    await handleDeleteProject(req, res, next);

    // Should still succeed — cleanup is best-effort (.catch(() => {}))
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true })
    );
  });
});

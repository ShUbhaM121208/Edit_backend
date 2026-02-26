import { describe, it, expect, vi, beforeEach } from "vitest";

// ──────────────────────────────────────
// Mock Prisma and Storage before imports
// ──────────────────────────────────────

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    project: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    timelineSegment: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("../../services/storage.service.js", () => ({
  getSignedDownloadUrl: vi.fn(),
  uploadFromBuffer: vi.fn(),
  deleteFromStorage: vi.fn(),
}));

import { enrichWithSignedUrls, enrichWithFinalVideoUrl, updateProject } from "../../services/project.service.js";
import * as storageService from "../../services/storage.service.js";
import { prisma } from "../../lib/prisma.js";

// ──────────────────────────────────────
// Helpers
// ──────────────────────────────────────

function makeProject(overrides: Record<string, unknown> = {}) {
  return {
    id: "proj-123",
    title: "Test",
    userId: "user-456",
    status: "DRAFT",
    videoUrl: "user-456/proj-123/video.mp4",
    thumbnailUrl: "user-456/proj-123/thumb.jpg",
    finalVideoUrl: null as string | null,
    duration: 30,
    selectedSongId: "song-1",
    selectedSong: { id: "song-1", fileUrl: "songs/chill.wav", title: "Chill", artist: "Bot" },
    segments: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ──────────────────────────────────────
// enrichWithSignedUrls
// ──────────────────────────────────────

describe("enrichWithSignedUrls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return signedFinalVideoUrl as null (always)", async () => {
    vi.mocked(storageService.getSignedDownloadUrl).mockResolvedValue("https://signed.example.com/url");
    const project = makeProject();
    const result = await enrichWithSignedUrls(project as any);

    // enrichWithSignedUrls always sets signedFinalVideoUrl to null
    // enrichWithFinalVideoUrl is called separately
    expect(result.signedFinalVideoUrl).toBeNull();
  });

  it("should sign video URL when videoUrl exists", async () => {
    vi.mocked(storageService.getSignedDownloadUrl).mockResolvedValue("https://signed.example.com/video");
    const project = makeProject();
    const result = await enrichWithSignedUrls(project as any);

    expect(result.signedVideoUrl).toBe("https://signed.example.com/video");
    expect(storageService.getSignedDownloadUrl).toHaveBeenCalledWith("videos", "user-456/proj-123/video.mp4");
  });

  it("should return null signedVideoUrl when videoUrl is null", async () => {
    const project = makeProject({ videoUrl: null });
    const result = await enrichWithSignedUrls(project as any);

    expect(result.signedVideoUrl).toBeNull();
  });

  it("should sign song URL when selectedSong.fileUrl exists", async () => {
    vi.mocked(storageService.getSignedDownloadUrl).mockResolvedValue("https://signed.example.com/song");
    const project = makeProject();
    const result = await enrichWithSignedUrls(project as any);

    expect(storageService.getSignedDownloadUrl).toHaveBeenCalledWith("songs", "songs/chill.wav");
  });

  it("should handle signing failures gracefully (video)", async () => {
    vi.mocked(storageService.getSignedDownloadUrl).mockRejectedValue(new Error("Signing failed"));
    const project = makeProject();
    const result = await enrichWithSignedUrls(project as any);

    // Should not throw, just return nulls
    expect(result.signedVideoUrl).toBeNull();
    expect(result.signedThumbnailUrl).toBeNull();
    expect(result.signedSongUrl).toBeNull();
  });
});

// ──────────────────────────────────────
// enrichWithFinalVideoUrl
// ──────────────────────────────────────

describe("enrichWithFinalVideoUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return enriched object unchanged when finalVideoUrl is null", async () => {
    const enriched = {
      ...makeProject({ finalVideoUrl: null }),
      signedVideoUrl: "https://signed.example.com/video",
      signedThumbnailUrl: null,
      signedSongUrl: null,
      signedFinalVideoUrl: null as string | null,
    };

    const result = await enrichWithFinalVideoUrl(enriched as any);

    // Should not attempt to sign anything
    expect(storageService.getSignedDownloadUrl).not.toHaveBeenCalled();
    expect(result.signedFinalVideoUrl).toBeNull();
  });

  it("should sign finalVideoUrl when it exists", async () => {
    vi.mocked(storageService.getSignedDownloadUrl).mockResolvedValue("https://signed.example.com/final");
    const enriched = {
      ...makeProject({ finalVideoUrl: "user-456/proj-123/final.mp4" }),
      signedVideoUrl: null,
      signedThumbnailUrl: null,
      signedSongUrl: null,
      signedFinalVideoUrl: null as string | null,
    };

    const result = await enrichWithFinalVideoUrl(enriched as any);

    expect(storageService.getSignedDownloadUrl).toHaveBeenCalledWith("exports", "user-456/proj-123/final.mp4");
    expect(result.signedFinalVideoUrl).toBe("https://signed.example.com/final");
  });

  it("should return unchanged enriched when signing final URL fails", async () => {
    vi.mocked(storageService.getSignedDownloadUrl).mockRejectedValue(new Error("Signing failed"));
    const enriched = {
      ...makeProject({ finalVideoUrl: "user-456/proj-123/final.mp4" }),
      signedVideoUrl: null,
      signedThumbnailUrl: null,
      signedSongUrl: null,
      signedFinalVideoUrl: null as string | null,
    };

    const result = await enrichWithFinalVideoUrl(enriched as any);

    // Should gracefully return without signed URL
    expect(result.signedFinalVideoUrl).toBeNull();
  });

  it("should preserve other signed URLs when adding finalVideoUrl", async () => {
    vi.mocked(storageService.getSignedDownloadUrl).mockResolvedValue("https://signed.example.com/final");
    const enriched = {
      ...makeProject({ finalVideoUrl: "user-456/proj-123/final.mp4" }),
      signedVideoUrl: "https://signed.example.com/video",
      signedThumbnailUrl: "https://signed.example.com/thumb",
      signedSongUrl: "https://signed.example.com/song",
      signedFinalVideoUrl: null as string | null,
    };

    const result = await enrichWithFinalVideoUrl(enriched as any);

    expect(result.signedVideoUrl).toBe("https://signed.example.com/video");
    expect(result.signedThumbnailUrl).toBe("https://signed.example.com/thumb");
    expect(result.signedSongUrl).toBe("https://signed.example.com/song");
    expect(result.signedFinalVideoUrl).toBe("https://signed.example.com/final");
  });
});

// ──────────────────────────────────────
// updateProject — with finalVideoUrl
// ──────────────────────────────────────

describe("updateProject — finalVideoUrl support", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should update project with finalVideoUrl and status EXPORTED", async () => {
    vi.mocked(prisma.project.update).mockResolvedValue({ id: "proj-123" } as any);

    await updateProject("proj-123", {
      finalVideoUrl: "user/proj/final.mp4",
      status: "EXPORTED",
    });

    expect(prisma.project.update).toHaveBeenCalledWith({
      where: { id: "proj-123" },
      data: {
        finalVideoUrl: "user/proj/final.mp4",
        status: "EXPORTED",
      },
    });
  });

  it("should update project with only status", async () => {
    vi.mocked(prisma.project.update).mockResolvedValue({ id: "proj-123" } as any);

    await updateProject("proj-123", { status: "RENDERING" });

    expect(prisma.project.update).toHaveBeenCalledWith({
      where: { id: "proj-123" },
      data: { status: "RENDERING" },
    });
  });

  it("should update project with status reverting to DRAFT", async () => {
    vi.mocked(prisma.project.update).mockResolvedValue({ id: "proj-123" } as any);

    await updateProject("proj-123", { status: "DRAFT" });

    expect(prisma.project.update).toHaveBeenCalledWith({
      where: { id: "proj-123" },
      data: { status: "DRAFT" },
    });
  });

  it("should propagate DB errors", async () => {
    vi.mocked(prisma.project.update).mockRejectedValue(new Error("Record not found"));

    await expect(updateProject("nonexistent", { status: "DRAFT" })).rejects.toThrow("Record not found");
  });
});

import { prisma } from "../lib/prisma.js";
import type { ProjectStatus, Track } from "@prisma/client";
import * as storageService from "./storage.service.js";

/**
 * Create a new project for a user.
 */
export async function createProject(userId: string, title: string) {
  return prisma.project.create({
    data: {
      title,
      userId,
      status: "DRAFT",
    },
  });
}

/**
 * Get all projects for a user, ordered by newest first.
 */
export async function getProjectsByUser(userId: string) {
  return prisma.project.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      videoUrl: true,
      thumbnailUrl: true,
      duration: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

/**
 * Get a single project by ID — verifies ownership.
 */
export async function getProjectById(projectId: string, userId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      segments: { orderBy: { order: "asc" } },
      selectedSong: true,
    },
  });

  if (!project) return null;
  if (project.userId !== userId) return null;

  return project;
}

/**
 * Enrich project with signed download URLs for video, thumbnail, and song.
 */
export async function enrichWithSignedUrls(project: NonNullable<Awaited<ReturnType<typeof getProjectById>>>) {
  let signedVideoUrl: string | null = null;
  let signedThumbnailUrl: string | null = null;
  let signedSongUrl: string | null = null;

  try {
    if (project.videoUrl) {
      signedVideoUrl = await storageService.getSignedDownloadUrl("videos", project.videoUrl);
    }
  } catch (e) {
    console.error("[Project] Failed to sign video URL:", e);
  }

  try {
    if (project.thumbnailUrl) {
      signedThumbnailUrl = await storageService.getSignedDownloadUrl("thumbnails", project.thumbnailUrl);
    }
  } catch (e) {
    console.error("[Project] Failed to sign thumbnail URL:", e);
  }

  try {
    if (project.selectedSong?.fileUrl) {
      signedSongUrl = await storageService.getSignedDownloadUrl("songs", project.selectedSong.fileUrl);
    }
  } catch (e) {
    console.error("[Project] Failed to sign song URL:", e);
  }

  return {
    ...project,
    signedVideoUrl,
    signedThumbnailUrl,
    signedSongUrl,
    signedFinalVideoUrl: null as string | null,
  };
}

/**
 * Enrich project with signed final video URL from the exports bucket.
 */
export async function enrichWithFinalVideoUrl(
  enriched: Awaited<ReturnType<typeof enrichWithSignedUrls>>
) {
  if (!(enriched as any).finalVideoUrl) return enriched;

  try {
    const signedFinalVideoUrl = await storageService.getSignedDownloadUrl(
      "exports",
      (enriched as any).finalVideoUrl
    );
    return { ...enriched, signedFinalVideoUrl };
  } catch (e) {
    console.error("[Project] Failed to sign final video URL:", e);
    return enriched;
  }
}

/**
 * Link a song to a project.
 */
export async function selectSongForProject(projectId: string, songId: string, userId: string) {
  const project = await getProjectById(projectId, userId);
  if (!project) return null;

  // Verify song exists
  const song = await prisma.song.findUnique({ where: { id: songId } });
  if (!song) throw new Error("Song not found");

  return prisma.project.update({
    where: { id: projectId },
    data: { selectedSongId: songId },
    include: { selectedSong: true },
  });
}

/**
 * Partial update a project.
 */
export async function updateProject(
  projectId: string,
  data: {
    videoUrl?: string;
    thumbnailUrl?: string;
    finalVideoUrl?: string;
    duration?: number;
    status?: ProjectStatus;
    title?: string;
  }
) {
  return prisma.project.update({
    where: { id: projectId },
    data,
  });
}

// ─── Timeline Segments ───────────────────────────────────────

/**
 * Get all segments for a project, ordered by `order`.
 */
export async function getSegmentsByProject(projectId: string) {
  return prisma.timelineSegment.findMany({
    where: { projectId },
    orderBy: { order: "asc" },
  });
}

/**
 * Replace all segments for a project in a single transaction.
 * Deletes existing segments then creates the new ones.
 */
export async function syncSegments(
  projectId: string,
  segments: {
    start: number;
    end: number;
    track: Track;
    volume: number;
    order: number;
  }[]
) {
  return prisma.$transaction(async (tx) => {
    // Delete all existing segments for the project
    await tx.timelineSegment.deleteMany({ where: { projectId } });

    // Create all new segments
    if (segments.length > 0) {
      await tx.timelineSegment.createMany({
        data: segments.map((seg) => ({
          projectId,
          start: seg.start,
          end: seg.end,
          track: seg.track,
          volume: seg.volume,
          order: seg.order,
        })),
      });
    }

    // Return the newly created segments
    return tx.timelineSegment.findMany({
      where: { projectId },
      orderBy: { order: "asc" },
    });
  });
}

/**
 * Delete a project — verifies ownership first.
 */
export async function deleteProject(projectId: string, userId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) return null;
  if (project.userId !== userId) return null;

  await prisma.project.delete({ where: { id: projectId } });
  return project;
}

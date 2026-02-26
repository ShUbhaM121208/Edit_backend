import { prisma } from "../lib/prisma.js";
import type { ProjectStatus } from "@prisma/client";

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
  });

  if (!project) return null;
  if (project.userId !== userId) return null;

  return project;
}

/**
 * Partial update a project.
 */
export async function updateProject(
  projectId: string,
  data: {
    videoUrl?: string;
    thumbnailUrl?: string;
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

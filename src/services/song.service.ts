import { prisma } from "../lib/prisma.js";
import type { Mood } from "@prisma/client";
import * as storageService from "./storage.service.js";

/**
 * List all songs, optionally filtered by mood.
 * Returns songs enriched with signed audio URLs.
 */
export async function listSongs(mood?: Mood) {
  const where = mood ? { mood } : {};

  const songs = await prisma.song.findMany({
    where,
    orderBy: { title: "asc" },
  });

  // Enrich with signed download URLs
  const enriched = await Promise.all(
    songs.map(async (song) => {
      let signedAudioUrl: string | null = null;
      if (song.fileUrl) {
        try {
          signedAudioUrl = await storageService.getSignedDownloadUrl("songs", song.fileUrl);
        } catch (e) {
          console.error(`[Song] Failed to sign audio URL for ${song.id}:`, e);
        }
      }
      return { ...song, signedAudioUrl };
    })
  );

  return enriched;
}

/**
 * Get a single song by ID, enriched with signed audio URL.
 */
export async function getSongById(songId: string) {
  const song = await prisma.song.findUnique({ where: { id: songId } });
  if (!song) return null;

  let signedAudioUrl: string | null = null;
  if (song.fileUrl) {
    try {
      signedAudioUrl = await storageService.getSignedDownloadUrl("songs", song.fileUrl);
    } catch (e) {
      console.error(`[Song] Failed to sign audio URL for ${song.id}:`, e);
    }
  }

  return { ...song, signedAudioUrl };
}

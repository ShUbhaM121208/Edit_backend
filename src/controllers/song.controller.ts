import type { Request, Response, NextFunction } from "express";
import type { Mood } from "@prisma/client";
import * as songService from "../services/song.service.js";

const VALID_MOODS: Mood[] = ["CHILL", "ENERGETIC", "ROMANTIC", "DRAMATIC", "UPBEAT"];

/**
 * GET /api/songs — List all songs, optional ?mood=CHILL filter
 */
export async function handleListSongs(req: Request, res: Response, next: NextFunction) {
  try {
    const moodParam = (req.query.mood as string)?.toUpperCase();
    const mood = moodParam && VALID_MOODS.includes(moodParam as Mood) ? (moodParam as Mood) : undefined;

    const songs = await songService.listSongs(mood);

    res.json({ success: true, songs });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/songs/:id — Get a single song
 */
export async function handleGetSong(req: Request, res: Response, next: NextFunction) {
  try {
    const song = await songService.getSongById(req.params.id as string);

    if (!song) {
      res.status(404).json({ success: false, message: "Song not found" });
      return;
    }

    res.json({ success: true, song });
  } catch (error) {
    next(error);
  }
}

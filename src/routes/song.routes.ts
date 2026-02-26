import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { handleListSongs, handleGetSong } from "../controllers/song.controller.js";

const router = Router();

// All song routes require authentication
router.use(requireAuth);

router.get("/", handleListSongs);
router.get("/:id", handleGetSong);

export default router;

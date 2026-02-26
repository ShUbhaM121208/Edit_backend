import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import {
  handleCreateProject,
  handleGetProjects,
  handleGetProject,
  handleRequestUploadUrl,
  handleConfirmUpload,
  handleDeleteProject,
  handleGetSegments,
  handleSyncSegments,
  handleSelectSong,
} from "../controllers/project.controller.js";

const router = Router();

// All project routes require authentication
router.use(requireAuth);

router.post("/", handleCreateProject);
router.get("/", handleGetProjects);
router.get("/:id", handleGetProject);
router.post("/:id/upload-url", handleRequestUploadUrl);
router.post("/:id/upload-complete", handleConfirmUpload);
router.get("/:id/segments", handleGetSegments);
router.put("/:id/segments", handleSyncSegments);
router.put("/:id/song", handleSelectSong);
router.delete("/:id", handleDeleteProject);

export default router;

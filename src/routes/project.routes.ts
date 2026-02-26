import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import {
  handleCreateProject,
  handleGetProjects,
  handleGetProject,
  handleRequestUploadUrl,
  handleConfirmUpload,
  handleDeleteProject,
} from "../controllers/project.controller.js";

const router = Router();

// All project routes require authentication
router.use(requireAuth);

router.post("/", handleCreateProject);
router.get("/", handleGetProjects);
router.get("/:id", handleGetProject);
router.post("/:id/upload-url", handleRequestUploadUrl);
router.post("/:id/upload-complete", handleConfirmUpload);
router.delete("/:id", handleDeleteProject);

export default router;

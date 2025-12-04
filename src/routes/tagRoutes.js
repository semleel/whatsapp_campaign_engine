import express from "express";
import {
  listTags,
  getTag,
  createTag,
  updateTag,
  archiveTag,
  recoverTag,
  deleteTag,
} from "../controllers/tagController.js";

const router = express.Router();

// GET /api/tags?includeDeleted=true
router.get("/", listTags);

// GET /api/tags/:id
router.get("/:id", getTag);

// POST /api/tags
router.post("/", createTag);

// DELETE /api/tags/:id
router.delete("/:id", deleteTag);

// PUT /api/tags/:id  (rename or toggle isdeleted)
router.put("/:id", updateTag);

// POST /api/tags/:id/archive   (soft delete)
router.post("/:id/archive", archiveTag);

// POST /api/tags/:id/recover   (undo soft delete)
router.post("/:id/recover", recoverTag);

export default router;

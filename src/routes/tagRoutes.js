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
import authMiddleware from "../middleware/auth.js";
import { requirePrivilege } from "../middleware/permission.js";

const router = express.Router();

router.use(authMiddleware);

// GET /api/tags?includeDeleted=true
router.get("/", requirePrivilege("content", "view"), listTags);

// GET /api/tags/:id
router.get("/:id", requirePrivilege("content", "view"), getTag);

// POST /api/tags
router.post("/", requirePrivilege("content", "create"), createTag);

// DELETE /api/tags/:id
router.delete("/:id", requirePrivilege("content", "archive"), deleteTag);

// PUT /api/tags/:id  (rename or toggle isdeleted)
router.put("/:id", requirePrivilege("content", "update"), updateTag);

// POST /api/tags/:id/archive   (soft delete)
router.post("/:id/archive", requirePrivilege("content", "archive"), archiveTag);

// POST /api/tags/:id/recover   (undo soft delete)
router.post("/:id/recover", requirePrivilege("content", "update"), recoverTag);

export default router;

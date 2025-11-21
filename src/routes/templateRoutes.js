import express from "express";
import {
  createTemplate,
  getTemplate,
  listTemplates,
  updateTemplate,
  attachTagsToTemplate,
  setTemplateExpiry,
  softDeleteTemplate,
} from "../controllers/templateController.js";
import authMiddleware from "../middleware/auth.js";
import { requirePrivilege } from "../middleware/permission.js";

const router = express.Router();

router.use(authMiddleware);

router.post("/create", requirePrivilege("content", "create"), createTemplate);
router.get("/list", requirePrivilege("content", "view"), listTemplates);
router.get("/:id", requirePrivilege("content", "view"), getTemplate);
router.put("/:id", requirePrivilege("content", "update"), updateTemplate);

// Soft delete / archive endpoint used by the UI
router.post("/:id/delete", requirePrivilege("content", "archive"), softDeleteTemplate);

// Tag + expiry endpoints
router.post("/:id/tags", requirePrivilege("content", "update"), attachTagsToTemplate);
router.post("/:id/expire", requirePrivilege("content", "update"), setTemplateExpiry);

export default router;

import express from "express";
import {
  createTemplate,
  getTemplate,
  listTemplates,
  updateTemplate,
  setTemplateExpiry,
  softDeleteTemplate,
  deleteTemplate,
} from "../controllers/templateController.js";
import authMiddleware from "../middleware/auth.js";
import { requirePrivilege } from "../middleware/permission.js";

const router = express.Router();

router.use(authMiddleware);

router.post("/create", createTemplate);
router.get("/list", listTemplates);
router.get("/:id", getTemplate);
router.put("/:id", updateTemplate);
router.delete("/:id", deleteTemplate);

// Soft delete / archive endpoint used by the UI
router.post("/:id/delete", requirePrivilege("content", "archive"), softDeleteTemplate);

// Tag + expiry endpoints
router.post("/:id/expire", requirePrivilege("content", "update"), setTemplateExpiry);

export default router;

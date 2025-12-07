import express from "express";
import {
  createTemplate,
  getTemplate,
  listTemplates,
  updateTemplate,
  setTemplateExpiry,
  softDeleteTemplate,
  deleteTemplate,
  getTemplatesOverview,
} from "../controllers/templateController.js";
import authMiddleware from "../middleware/auth.js";
import { requirePrivilege } from "../middleware/permission.js";

const router = express.Router();

router.use(authMiddleware);

// RESTful endpoints
router.get("/", listTemplates);
router.post("/", createTemplate);
router.get("/overview", getTemplatesOverview);
router.get("/list", listTemplates);
router.post("/create", createTemplate);
router.post("/:id/archive", requirePrivilege("content", "archive"), softDeleteTemplate);
router.get("/:id", getTemplate);
router.put("/:id", updateTemplate);
router.delete("/:id", deleteTemplate);

// Legacy aliases (kept to avoid breaking existing callers)
router.post("/:id/delete", requirePrivilege("content", "archive"), softDeleteTemplate);

// Expiry endpoint
router.post("/:id/expire", requirePrivilege("content", "update"), setTemplateExpiry);

export default router;

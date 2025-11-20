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

const router = express.Router();

router.post("/create", createTemplate);
router.get("/list", listTemplates);
router.get("/:id", getTemplate);
router.put("/:id", updateTemplate);

// Soft delete / archive endpoint used by the UI
router.post("/:id/delete", softDeleteTemplate);

// Tag + expiry endpoints
router.post("/:id/tags", attachTagsToTemplate);
router.post("/:id/expire", setTemplateExpiry);

export default router;

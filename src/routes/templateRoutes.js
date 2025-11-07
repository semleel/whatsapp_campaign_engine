import express from "express";
import {
  addVariant,
  approveTemplate,
  createTemplate,
  createTemplateVersion,
  getTemplate,
  listApprovals,
  listTemplateVersions,
  listTemplates,
  listVariants,
  renderTemplate,
  setCurrentVersion,
  updateVariant,
} from "../controllers/templateController.js";

const router = express.Router();
router.post("/create", createTemplate);
router.get("/list", listTemplates);
router.get("/:id", getTemplate);
router.post("/:contentId/version", createTemplateVersion);
router.get("/:contentId/versions", listTemplateVersions);
router.post("/:contentId/version/current", setCurrentVersion);
router.post("/:contentId/variant", addVariant);
router.get("/:contentId/variants", listVariants);
router.put("/variant/:variantId", updateVariant);
router.post("/:contentId/approve", approveTemplate);
router.get("/:contentId/approvals", listApprovals);
router.get("/:contentId/render", renderTemplate);

export default router;
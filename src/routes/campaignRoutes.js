import express from "express";
import {
  archiveCampaign,
  createCampaign,
  getCampaignById,
  listArchivedCampaigns,
  listCampaigns,
  restoreCampaign,
  updateCampaign,
  hardDeleteArchivedCampaign,
  hardDeleteArchivedCampaigns,
  getCampaignWithSteps,
  upsertCampaignStep,
  deleteCampaignStep,
  saveStepChoices,
  saveCampaignStepsBulk,
} from "../controllers/campaignController.js";
import authMiddleware from "../middleware/auth.js";
import { requirePrivilege } from "../middleware/permission.js";

const router = express.Router();

router.use(authMiddleware);

router.post("/create", requirePrivilege("campaigns", "create"), createCampaign);
router.get("/list", requirePrivilege("campaigns", "view"), listCampaigns);
router.get("/archive", requirePrivilege("campaigns", "view"), listArchivedCampaigns);
router.get("/:id", requirePrivilege("campaigns", "view"), getCampaignById);
router.put("/update/:id", requirePrivilege("campaigns", "update"), updateCampaign);
router.put("/archive/:id", requirePrivilege("campaigns", "archive"), archiveCampaign);
router.put("/restore/:id", requirePrivilege("campaigns", "update"), restoreCampaign);
router.get("/:id/steps", requirePrivilege("campaigns", "view"), getCampaignWithSteps);
router.post("/:id/steps", requirePrivilege("campaigns", "update"), upsertCampaignStep);
router.post("/:id/steps/bulk", requirePrivilege("campaigns", "update"), saveCampaignStepsBulk);
router.delete("/:id/steps/:stepId", requirePrivilege("campaigns", "update"), deleteCampaignStep);
router.post("/:id/steps/:stepId/choices", requirePrivilege("campaigns", "update"), saveStepChoices);

export default router;

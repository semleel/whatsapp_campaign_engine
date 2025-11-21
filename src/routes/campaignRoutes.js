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
} from "../controllers/campaignController.js";

const router = express.Router();

router.post("/create", createCampaign);
router.get("/list", listCampaigns);
router.get("/archive", listArchivedCampaigns);
router.get("/:id", getCampaignById);
router.put("/update/:id", updateCampaign);
router.put("/archive/:id", archiveCampaign);
router.put("/restore/:id", restoreCampaign);
router.delete("/archive/:id", hardDeleteArchivedCampaign);
router.post("/archive/bulk-delete", hardDeleteArchivedCampaigns);

export default router;

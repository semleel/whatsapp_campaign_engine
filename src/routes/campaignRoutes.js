import express from "express";
import {
  archiveCampaign,
  createCampaign,
  getCampaignById,
  listArchivedCampaigns,
  listCampaigns,
  restoreCampaign,
  updateCampaign,
} from "../controllers/campaignController.js";

const router = express.Router();

router.post("/create", createCampaign);
router.get("/list", listCampaigns);
router.get("/archive", listArchivedCampaigns);
router.get("/:id", getCampaignById);
router.put("/update/:id", updateCampaign);
router.put("/archive/:id", archiveCampaign);
router.put("/restore/:id", restoreCampaign);

export default router;

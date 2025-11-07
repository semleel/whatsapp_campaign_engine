import express from "express";
import { getCampaignStatuses, getRegions, getUserFlows } from "../controllers/referenceController.js";

const router = express.Router();

router.get("/regions", getRegions);
router.get("/userflows", getUserFlows);
router.get("/campaignstatus", getCampaignStatuses);

export default router;

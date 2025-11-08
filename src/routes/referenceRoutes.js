import express from "express";
import { createRegion, createUserFlow, getCampaignStatuses, getRegions, getUserFlows } from "../controllers/referenceController.js";

const router = express.Router();

router.get("/regions", getRegions);
router.get("/userflows", getUserFlows);
router.get("/campaignstatus", getCampaignStatuses);
router.post("/regions", createRegion);
router.post("/userflows", createUserFlow);

export default router;

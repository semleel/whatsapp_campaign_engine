import express from "express";
import { createRegion, createUserFlow, getCampaignStatuses, getRegions, getUserFlows } from "../controllers/referenceController.js";
import authMiddleware from "../middleware/auth.js";
import { requirePrivilege } from "../middleware/permission.js";

const router = express.Router();

router.use(authMiddleware);
router.get("/regions", requirePrivilege("campaigns", "view"), getRegions);
router.get("/userflows", requirePrivilege("flows", "view"), getUserFlows);
router.get("/campaignstatus", requirePrivilege("campaigns", "view"), getCampaignStatuses);
router.post("/regions", requirePrivilege("campaigns", "create"), createRegion);
router.post("/userflows", requirePrivilege("flows", "create"), createUserFlow);

export default router;

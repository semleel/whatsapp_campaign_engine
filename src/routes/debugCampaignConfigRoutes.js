// src/routes/debugCampaignConfigRoutes.js
import express from "express";
import { debugCampaignConfig } from "../controllers/debugCampaignController.js";

const router = express.Router();

/**
 * GET /api/debug/campaign-config
 * Lists campaigns and whether they are launchable vs misconfigured.
 */
router.get("/campaign-config", debugCampaignConfig);

export default router;

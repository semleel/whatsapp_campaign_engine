// src/routes/index.js
import express from "express";

import campaignRoutes from "./campaignRoutes.js";
import regionRoutes from "./regionRoutes.js";
import whatsappRoutes from "./whatsappRoutes.js";
import templateRoutes from "./templateRoutes.js";
import integrationRoutes from "./integrationRoutes.js";
import debugRoutes from "./debugRoutes.js";
import systemRoutes from "./systemRoutes.js";
import keywordRoutes from "./keywordRoutes.js";
import sessionRoutes from "./sessionRoutes.js";
import debugCampaignConfigRoutes from "./debugCampaignConfigRoutes.js";
import reportRoutes from "./reportRoutes.js";
import conversationRoutes from "./conversationRoutes.js";
import authRoutes from "./authRoutes.js";
import adminRoutes from "./adminRoutes.js";
import privilegeRoutes from "./privilegeRoutes.js";

const router = express.Router();

router.use("/campaign", campaignRoutes);
router.use("/reference", regionRoutes);
router.use("/wa", whatsappRoutes);
router.use("/template", templateRoutes);
router.use("/integration", integrationRoutes);
router.use("/debug", debugRoutes);
router.use("/system", systemRoutes);
router.use("/keyword", keywordRoutes);
router.use("/session", sessionRoutes);
router.use("/debug", debugCampaignConfigRoutes);
router.use("/report", reportRoutes);
router.use("/conversation", conversationRoutes);
router.use("/auth", authRoutes);
router.use("/admin", adminRoutes);
router.use("/privilege", privilegeRoutes);

export default router;

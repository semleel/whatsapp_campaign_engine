import express from "express";

import campaignRoutes from "./campaignRoutes.js";
import referenceRoutes from "./referenceRoutes.js";
import whatsappRoutes from "./whatsappRoutes.js";
import templateRoutes from "./templateRoutes.js";
import integrationRoutes from "./integrationRoutes.js";
import debugRoutes from "./debugRoutes.js";
import systemRoutes from "./systemRoutes.js";
import keywordRoutes from "./keywordRoutes.js";
import flowRoutes from "./flowRoutes.js";
import sessionRoutes from "./sessionRoutes.js";

const router = express.Router();

router.use("/campaign", campaignRoutes);
router.use("/reference", referenceRoutes);
router.use("/wa", whatsappRoutes);
router.use("/template", templateRoutes);
router.use("/integration", integrationRoutes);
router.use("/debug", debugRoutes);
router.use("/system", systemRoutes);
router.use("/keyword", keywordRoutes);
router.use("/flow", flowRoutes);
router.use("/session", sessionRoutes);

export default router;

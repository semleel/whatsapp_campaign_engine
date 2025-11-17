import express from "express";
import {
  getWhatsAppConfig,
  upsertWhatsAppConfig,
} from "../controllers/systemController.js";

const router = express.Router();

// GET /api/system/whatsapp-config
router.get("/whatsapp-config", getWhatsAppConfig);

// PUT /api/system/whatsapp-config
router.put("/whatsapp-config", upsertWhatsAppConfig);

export default router;

import express from "express";
import {
  getWhatsAppConfig,
  upsertWhatsAppConfig,
  listTokens,
  listSecurityLogs,
} from "../controllers/systemController.js";
import authMiddleware, { requireRole } from "../middleware/auth.js";

const router = express.Router();

// Protect system endpoints
router.use(authMiddleware);
router.use(requireRole(["admin", "super"]));

// GET /api/system/whatsapp-config
router.get("/whatsapp-config", getWhatsAppConfig);

// PUT /api/system/whatsapp-config
router.put("/whatsapp-config", upsertWhatsAppConfig);

// GET /api/system/tokens
router.get("/tokens", listTokens);

// GET /api/system/security-logs
router.get("/security-logs", listSecurityLogs);

export default router;

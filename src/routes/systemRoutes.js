import express from "express";
import {
  getWhatsAppConfig,
  upsertWhatsAppConfig,
  listTokens,
  listSecurityLogs,
} from "../controllers/systemController.js";
import authMiddleware from "../middleware/auth.js";
import { requirePrivilege } from "../middleware/permission.js";

const router = express.Router();

// Protect system endpoints
router.use(authMiddleware);

// GET /api/system/whatsapp-config
router.get("/whatsapp-config", requirePrivilege("system", "view"), getWhatsAppConfig);

// PUT /api/system/whatsapp-config
router.put("/whatsapp-config", requirePrivilege("system", "update"), upsertWhatsAppConfig);

// GET /api/system/tokens
router.get("/tokens", requirePrivilege("system", "view"), listTokens);

// GET /api/system/security-logs
router.get("/security-logs", requirePrivilege("system", "view"), listSecurityLogs);

export default router;

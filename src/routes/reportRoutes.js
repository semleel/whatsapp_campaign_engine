import express from "express";
import {
  listDeliveryReport,
  listFlowStats,
  reportSummary,
} from "../controllers/reportController.js";
import authMiddleware, { requireRole } from "../middleware/auth.js";

const router = express.Router();

router.use(authMiddleware);
router.get("/delivery", requireRole(["admin", "super"]), listDeliveryReport);
router.get("/flow", requireRole(["admin", "super"]), listFlowStats);
router.get("/summary", requireRole(["admin", "super"]), reportSummary);

export default router;

import express from "express";
import {
  listDeliveryReport,
  listFlowStats,
  reportSummary,
} from "../controllers/reportController.js";
import authMiddleware from "../middleware/auth.js";
import { requirePrivilege } from "../middleware/permission.js";

const router = express.Router();

router.use(authMiddleware);
router.get("/delivery", requirePrivilege("reports", "view"), listDeliveryReport);
router.get("/flow", requirePrivilege("reports", "view"), listFlowStats);
router.get("/summary", requirePrivilege("reports", "view"), reportSummary);

export default router;

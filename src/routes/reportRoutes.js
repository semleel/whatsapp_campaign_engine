import express from "express";
import { listDeliveryReport } from "../controllers/reportController.js";
import authMiddleware, { requireRole } from "../middleware/auth.js";

const router = express.Router();

router.use(authMiddleware);
router.get("/delivery", requireRole(["admin", "super"]), listDeliveryReport);

export default router;

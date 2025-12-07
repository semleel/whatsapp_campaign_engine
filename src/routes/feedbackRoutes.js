import express from "express";
import authMiddleware from "../middleware/auth.js";
import { requirePrivilege } from "../middleware/permission.js";
import { listFeedback, createFeedback } from "../controllers/feedbackController.js";

const router = express.Router();

router.use(authMiddleware);

router.get("/", requirePrivilege("feedback", "view"), listFeedback);
router.post("/", requirePrivilege("feedback", "create"), createFeedback);

export default router;

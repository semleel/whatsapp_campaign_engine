import express from "express";
import { listConversations } from "../controllers/conversationController.js";
import authMiddleware from "../middleware/auth.js";
import { requirePrivilege } from "../middleware/permission.js";

const router = express.Router();

router.use(authMiddleware);
router.get("/list", requirePrivilege("conversations", "view"), listConversations);

export default router;

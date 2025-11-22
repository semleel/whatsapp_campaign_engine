import express from "express";
import { listConversations, sendConversationMessage } from "../controllers/conversationController.js";
import authMiddleware from "../middleware/auth.js";
import { requirePrivilege } from "../middleware/permission.js";

const router = express.Router();

router.use(authMiddleware);
router.get("/list", requirePrivilege("conversations", "view"), listConversations);
router.post(
  "/:id/send",
  requirePrivilege("conversations", "create"),
  sendConversationMessage
);

export default router;

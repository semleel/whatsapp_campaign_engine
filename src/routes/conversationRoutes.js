import express from "express";
import {
  listConversations,
  sendConversationMessage,
} from "../controllers/conversationController.js";

const router = express.Router();

router.get("/list", listConversations);
router.post("/:id/send", sendConversationMessage);

export default router;

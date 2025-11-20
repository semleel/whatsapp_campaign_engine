import express from "express";
import { listConversations } from "../controllers/conversationController.js";

const router = express.Router();

router.get("/list", listConversations);

export default router;

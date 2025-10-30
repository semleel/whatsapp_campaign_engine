import express from "express";
import { verifyWebhook, webhookHandler } from "../controllers/webhookController.js";

const router = express.Router();

router.get("/", verifyWebhook);
router.post("/", webhookHandler);

export default router;

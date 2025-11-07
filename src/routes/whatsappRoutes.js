import express from "express";
import { sendMessage } from "../controllers/whatsappController.js";

const router = express.Router();

router.post("/send", sendMessage);

export default router;

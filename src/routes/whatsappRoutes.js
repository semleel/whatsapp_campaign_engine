import express from "express";
import { sendMessage } from "../controllers/whatsappController.js";
import authMiddleware from "../middleware/auth.js";
import { requirePrivilege } from "../middleware/permission.js";

const router = express.Router();

router.use(authMiddleware);
router.post("/send", requirePrivilege("conversations", "update"), sendMessage);

export default router;

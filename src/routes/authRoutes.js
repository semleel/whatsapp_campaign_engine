import express from "express";
import { login, logout } from "../controllers/authController.js";
import authMiddleware from "../middleware/auth.js";

const router = express.Router();

router.post("/login", login);
router.post("/logout", authMiddleware, logout);

export default router;

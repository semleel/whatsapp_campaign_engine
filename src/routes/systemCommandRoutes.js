import express from "express";
import {
  listSystemCommands,
  updateSystemCommand,
} from "../controllers/systemCommandController.js";
import authMiddleware from "../middleware/auth.js";
import { requirePrivilege } from "../middleware/permission.js";

const router = express.Router();

// Protect system command endpoints (same "System" privilege group as other system settings)
router.use(authMiddleware);

// GET /api/system/commands
router.get("/", requirePrivilege("system", "view"), listSystemCommands);

// PATCH /api/system/commands/:command
router.patch("/:command", requirePrivilege("system", "update"), updateSystemCommand);

export default router;

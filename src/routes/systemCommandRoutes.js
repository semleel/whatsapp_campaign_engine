import express from "express";
import {
  listSystemCommands,
  updateSystemCommand,
} from "../controllers/systemCommandController.js";

const router = express.Router();

// GET /api/system/commands
router.get("/", listSystemCommands);

// PATCH /api/system/commands/:command
router.patch("/:command", updateSystemCommand);

export default router;

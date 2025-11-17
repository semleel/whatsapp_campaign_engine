import express from "express";
import {
    listSessions,
    getSession,
    createSession,
    pauseSession,
    resumeSession,
    cancelSession,
} from "../controllers/sessionController.js";

const router = express.Router();

router.get("/list", listSessions);
router.get("/:id", getSession);
router.post("/create", createSession);
router.post("/:id/pause", pauseSession);
router.post("/:id/resume", resumeSession);
router.post("/:id/cancel", cancelSession);

export default router;

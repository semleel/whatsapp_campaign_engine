import express from "express";
import {
    listSessions,
    getSession,
    createSession,
    pauseSession,
    resumeSession,
    cancelSession,
    listSessionsByContact,
} from "../controllers/sessionController.js";
import authMiddleware from "../middleware/auth.js";
import { requirePrivilege } from "../middleware/permission.js";

const router = express.Router();

router.use(authMiddleware);

router.get("/list", requirePrivilege("campaigns", "view"), listSessions);
router.get("/:id", requirePrivilege("campaigns", "view"), getSession);
router.post("/create", requirePrivilege("campaigns", "create"), createSession);
router.post("/:id/pause", requirePrivilege("campaigns", "update"), pauseSession);
router.post("/:id/resume", requirePrivilege("campaigns", "update"), resumeSession);
router.post("/:id/cancel", requirePrivilege("campaigns", "archive"), cancelSession);
router.get(
  "/by-contact/:contactId",
  requirePrivilege("campaigns", "view"),
  listSessionsByContact
);

export default router;

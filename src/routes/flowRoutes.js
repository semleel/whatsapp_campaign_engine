import express from "express";
import {
    listFlows,
    createFlowDefinition,
    getFlowDefinition,
    updateFlowDefinition,
    updateFlowStatus,
    deleteFlowDefinition,
} from "../controllers/flowController.js";
import authMiddleware from "../middleware/auth.js";
import { requirePrivilege } from "../middleware/permission.js";

const router = express.Router();

router.use(authMiddleware);

router.get("/list", requirePrivilege("flows", "view"), listFlows);
router.post("/create", requirePrivilege("flows", "create"), createFlowDefinition);
router.get("/:id", requirePrivilege("flows", "view"), getFlowDefinition);
router.put("/:id", requirePrivilege("flows", "update"), updateFlowDefinition);
router.patch("/:id/status", requirePrivilege("flows", "update"), updateFlowStatus);
router.delete("/:id", requirePrivilege("flows", "archive"), deleteFlowDefinition);

export default router;

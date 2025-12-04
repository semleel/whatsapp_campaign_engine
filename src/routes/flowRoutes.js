import express from "express";
import {
    listFlows,
    createFlowDefinition,
    getFlowDefinition,
    updateFlowDefinition,
    updateFlowStatus,
    deleteFlowDefinition,
} from "../controllers/flowController.js";

const router = express.Router();

router.get("/list", listFlows);
router.post("/create", createFlowDefinition);
router.get("/:id", getFlowDefinition);
router.put("/:id", updateFlowDefinition);
router.patch("/:id/status", updateFlowStatus);
router.delete("/:id", deleteFlowDefinition);

export default router;

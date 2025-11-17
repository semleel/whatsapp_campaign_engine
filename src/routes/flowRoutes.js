import express from "express";
import {
    listFlows,
    createFlowDefinition,
    getFlowDefinition,
    updateFlowDefinition,
} from "../controllers/flowController.js";

const router = express.Router();

router.get("/list", listFlows);
router.post("/create", createFlowDefinition);
router.get("/:id", getFlowDefinition);
router.put("/:id", updateFlowDefinition);

export default router;

// src/routes/systemFlowRoutes.js
import express from "express";
import {
    listSystemFlows,
    createSystemFlow,
    updateSystemFlow,
    deleteSystemFlow,
    getActiveSystemStartFlow,
    setActiveSystemStartFlow,
    getActiveSystemEndFlow,
    setActiveSystemEndFlow,
    listSystemKeywords,
    createSystemKeyword,
    updateSystemKeyword,
    deleteSystemKeyword,
} from "../controllers/systemFlowController.js";

const router = express.Router();

// system_flow
router.get("/start-flow", getActiveSystemStartFlow);
router.post("/start-flow", setActiveSystemStartFlow);
router.get("/end-flow", getActiveSystemEndFlow);
router.post("/end-flow", setActiveSystemEndFlow);
router.get("/flows", listSystemFlows);
router.post("/flows", createSystemFlow);
router.put("/flows/:id", updateSystemFlow);
router.delete("/flows/:id", deleteSystemFlow);

// system_keyword
router.get("/keywords", listSystemKeywords);
router.post("/keywords", createSystemKeyword);
router.put("/keywords/:keyword", updateSystemKeyword);
router.delete("/keywords/:keyword", deleteSystemKeyword);

export default router;

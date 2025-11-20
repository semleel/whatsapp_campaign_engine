import express from "express";
import { listDeliveryReport } from "../controllers/reportController.js";

const router = express.Router();

router.get("/delivery", listDeliveryReport);

export default router;

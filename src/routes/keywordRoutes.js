import express from "express";
import {
  listAllKeywords,
  listKeywordsByCampaign,
  createKeyword,
  deleteKeyword,
  checkKeywordAvailability,
} from "../controllers/keywordController.js";
import authMiddleware from "../middleware/auth.js";
import { requirePrivilege } from "../middleware/permission.js";

const router = express.Router();

router.use(authMiddleware);

// Global list (optional, for /campaign/keywords UI later)
router.get("/list", requirePrivilege("campaigns", "view"), listAllKeywords);

// Per-campaign keywords
router.get("/by-campaign/:campaignId", requirePrivilege("campaigns", "view"), listKeywordsByCampaign);

// Check keyword availability
router.get("/check", requirePrivilege("campaigns", "view"), checkKeywordAvailability);

// Create keyword
router.post("/create", requirePrivilege("campaigns", "create"), createKeyword);

// Delete keyword
router.delete("/:id", requirePrivilege("campaigns", "archive"), deleteKeyword);

export default router;

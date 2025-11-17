import express from "express";
import {
  listAllKeywords,
  listKeywordsByCampaign,
  createKeyword,
  deleteKeyword,
  checkKeywordAvailability,
} from "../controllers/keywordController.js";

const router = express.Router();

// Global list (optional, for /campaign/keywords UI later)
router.get("/list", listAllKeywords);

// Per-campaign keywords
router.get("/by-campaign/:campaignId", listKeywordsByCampaign);

// Check keyword availability
router.get("/check", checkKeywordAvailability);

// Create keyword
router.post("/create", createKeyword);

// Delete keyword
router.delete("/:id", deleteKeyword);

export default router;

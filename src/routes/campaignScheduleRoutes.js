import express from "express";
import {
  addSchedule,
  autoCheckCampaignStatuses,
  getSchedules,
  pauseCampaign,
  updateSchedule,
} from "../controllers/campaignScheduleController.js";

const router = express.Router();

router.get("/schedules", getSchedules);
router.post("/add", addSchedule);
router.put("/update/:id", updateSchedule);
router.put("/pause/:id", pauseCampaign);

export { autoCheckCampaignStatuses };
export default router;

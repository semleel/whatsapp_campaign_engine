import cron from "node-cron";
import { log } from "../utils/logger.js";
import { autoCheckCampaignStatuses } from "../controllers/campaignController.js";

export function startCampaignStatusJob() {
  cron.schedule("* * * * *", async () => {
    log("[CRON] Checking campaign statuses...");
    await autoCheckCampaignStatuses();
  });
  log("[CRON] Campaign status checker initialized (runs every minute)");
}

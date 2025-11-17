import { startCampaignStatusJob } from "./campaignStatusJob.js";
import { startSessionExpiryJob } from "./sessionExpiryJob.js";

export function startJobs() {
    startCampaignStatusJob();
    startSessionExpiryJob();
}

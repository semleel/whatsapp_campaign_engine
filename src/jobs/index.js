import { startCampaignStatusJob } from "./campaignStatusJob.js";
import { startSessionExpiryJob } from "./sessionExpiryJob.js";
import { startWhatsappRetryJob } from "./whatsappRetryJob.js";

export function startJobs() {
    startCampaignStatusJob();
    startSessionExpiryJob();
    startWhatsappRetryJob();
}

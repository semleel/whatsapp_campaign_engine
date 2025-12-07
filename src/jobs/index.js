import { startCampaignStatusJob } from "./campaignStatusJob.js";
import { startSessionExpiryJob } from "./sessionExpiryJob.js";
import { startWhatsappRetryJob } from "./whatsappRetryJob.js";
import { startFeedbackReminderJob } from "./feedbackReminderJob.js";

export function startJobs() {
    startCampaignStatusJob();
    startSessionExpiryJob();
    startWhatsappRetryJob();
    startFeedbackReminderJob();
}

import cron from "node-cron";
import { prisma } from "../config/prismaClient.js";
import { sendWhatsAppMessage } from "../services/whatsappService.js";
import { log } from "../utils/logger.js";

const IDLE_MINUTES = 60;
const PROMPT_DETAIL = "FEEDBACK_PROMPT_SENT";
const DISCARD_DETAIL = "FEEDBACK_PROMPT_DISCARDED";

export function startFeedbackReminderJob() {
  cron.schedule("*/15 * * * *", async () => {
    try {
      const now = new Date();
      const idleCutoff = new Date(now.getTime() - IDLE_MINUTES * 60 * 1000);
      const discardCutoff = new Date(now.getTime() - IDLE_MINUTES * 2 * 60 * 1000);

      // Find sessions idle > 60 min without prompt sent
      const idleSessions = await prisma.campaign_session.findMany({
        where: {
          session_status: "ACTIVE",
          last_active_at: { lt: idleCutoff },
        },
        take: 50,
        orderBy: { last_active_at: "asc" },
        include: {
          contact: { select: { phone_num: true } },
        },
      });

      for (const session of idleSessions) {
        const alreadyPrompted = await prisma.session_log.findFirst({
          where: {
            campaign_session_id: session.campaign_session_id,
            detail: PROMPT_DETAIL,
          },
        });
        if (alreadyPrompted) continue;
        if (!session.contact?.phone_num) continue;

        const text =
          "You have been idle for a while. Would you share a quick rating about our service? Reply with /feedback <1-5> and any comment.";

        const msgRecord = await prisma.message.create({
          data: {
            direction: "outbound",
            content_type: "text",
            message_content: text,
            sender_id: "system-feedback",
            receiver_id: session.contact.phone_num,
            provider_msg_id: null,
            message_status: "pending",
            payload_json: JSON.stringify({ type: "text", text: { body: text } }),
            contact_id: session.contact_id,
            campaign_session_id: session.campaign_session_id,
          },
        });

        // Fire and forget send
        sendWhatsAppMessage(session.contact.phone_num, { type: "text", text: { body: text } }, msgRecord).catch(
          () => {}
        );

        await prisma.session_log.create({
          data: {
            campaign_session_id: session.campaign_session_id,
            detail: PROMPT_DETAIL,
          },
        });
      }

      // Mark discarded prompts after another hour with no activity
      const discardRows = await (async () => {
        const toDiscard = await prisma.campaign_session.findMany({
          where: {
            session_status: "ACTIVE",
            last_active_at: { lt: discardCutoff },
            session_log: { some: { detail: PROMPT_DETAIL } },
          },
          select: { campaign_session_id: true },
          take: 50,
        });
        return toDiscard.map((s) => ({
          campaign_session_id: s.campaign_session_id,
          detail: DISCARD_DETAIL,
        }));
      })();

      if (discardRows.length) {
        await prisma.session_log.createMany({
          data: discardRows,
          skipDuplicates: true,
        });
      }
    } catch (err) {
      log(`[CRON] Feedback reminder error: ${err?.message || err}`);
    }
  });

  log("[CRON] Feedback reminder job initialized (every 15 min)");
}

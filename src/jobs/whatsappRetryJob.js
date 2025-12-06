import cron from "node-cron";
import prisma from "../config/prismaClient.js";
import { sendWhatsAppMessage } from "../services/whatsappService.js";
import { log, error } from "../utils/logger.js";

const MAX_RETRIES = Number(process.env.WHATSAPP_MAX_RETRIES || 5);
const BATCH_SIZE = Number(process.env.WHATSAPP_RETRY_BATCH_SIZE || 20);

function parsePayload(message) {
  if (!message) return null;
  // Prefer the raw payload we stored when the message was created.
  if (message.payload_json) {
    try {
      return JSON.parse(message.payload_json);
    } catch {
      // fall through
    }
  }
  if (message.content_type === "text" && message.message_content) {
    return { type: "text", text: { body: message.message_content, preview_url: true } };
  }
  return null;
}

export function startWhatsappRetryJob() {
  cron.schedule("*/2 * * * *", async () => {
    const now = new Date();
    try {
      const candidates = await prisma.delivery_log.findMany({
        where: {
          delivery_status: { in: ["failed", "pending"] },
          next_retry_at: { lte: now },
          retry_count: { lt: MAX_RETRIES },
        },
        orderBy: [{ next_retry_at: "asc" }, { delivery_id: "asc" }],
        take: BATCH_SIZE,
        include: {
          message: true,
        },
      });

      if (!candidates.length) return;

      log(`[WA retry] Found ${candidates.length} message(s) to retry`);

      for (const attempt of candidates) {
        const msg = attempt.message;
        if (!msg?.receiver_id) {
          await prisma.delivery_log.update({
            where: { delivery_id: attempt.delivery_id },
            data: {
              delivery_status: "dead",
              error_message: "Missing receiver phone number",
            },
          });
          continue;
        }

        const payload = parsePayload(msg);
        if (!payload) {
          await prisma.delivery_log.update({
            where: { delivery_id: attempt.delivery_id },
            data: {
              delivery_status: "dead",
              error_message: "No payload available for retry",
            },
          });
          continue;
        }

        // Mark as in-flight to avoid double processing if the job overlaps.
        await prisma.delivery_log.update({
          where: { delivery_id: attempt.delivery_id },
          data: {
            delivery_status: "retrying",
            last_attempt_at: new Date(),
            error_message: null,
          },
        });
        await prisma.message.update({
          where: { message_id: msg.message_id },
          data: { message_status: "pending", error_message: null },
        });

        try {
          await sendWhatsAppMessage(msg.receiver_id, payload, msg, attempt);
          log(
            `[WA retry] deliverid=${attempt.delivery_id} attempt=${
              (attempt.retry_count || 0) + 1
            }`
          );
        } catch (err) {
          error("[WA retry] send failed:", err?.response?.data || err?.message || err);
          // sendWhatsAppMessage already records failure/backoff.
        }
      }
    } catch (err) {
      error("[WA retry] job error:", err);
    }
  });

  log("[CRON] WhatsApp retry job initialized (every 2 min)");
}

// src/services/whatsappStatusService.js

// Service to build WhatsApp message status update handling
// Status callback → DB.
import { prisma } from "../config/prismaClient.js";
import { log } from "../utils/logger.js";

/**
 * Map WA status callbacks (sent/delivered/read) onto your message & deliverlog tables
 */
export const upsertStatus = async (statusPayload) => {
  const providerId = statusPayload?.id || "";
  if (!providerId) return;
  const tsIso = statusPayload?.timestamp
    ? new Date(parseInt(statusPayload.timestamp, 10) * 1000)
    : new Date();
  const statusName = (statusPayload?.status || "unknown").toLowerCase();
  const errorMsg = statusPayload?.errors?.[0]?.title || null;

  log(
    `[StatusService] Updating by provider_msg_id=${providerId}, status=${statusName}`
  );

  await Promise.all([
    prisma.message.updateMany({
      where: { provider_msg_id: providerId },
      data: {
        message_status: statusName,
        error_message: errorMsg,
      },
    }),
    prisma.delivery_log.updateMany({
      where: { provider_msg_id: providerId },
      data: {
        delivery_status: statusName,
        last_attempt_at: tsIso,
        error_message: errorMsg,
      },
    }),
  ]);
};

// src/services/whatsappStatusService.js

// Service to build WhatsApp message status update handling
// Status callback → DB.
import { prisma } from "../config/prismaClient.js";

/**
 * Map WA status callbacks (sent/delivered/read) onto your message & deliverlog tables
 */
export const upsertStatus = async (statusPayload) => {
    const providerId = statusPayload?.id || "";
    if (!providerId) return;
    const tsIso = statusPayload?.timestamp
        ? new Date(parseInt(statusPayload.timestamp, 10) * 1000)
        : new Date();
    const status = (statusPayload?.status || "unknown").toLowerCase();
    const errorMsg = statusPayload?.errors?.[0]?.title || null;

    await Promise.all([
        prisma.message.updateMany({
            where: { provider_msg_id: providerId },
            data: {
                message_status: status,
                timestamp: tsIso,
                error_message: errorMsg,
            },
        }),
        prisma.deliverlog.updateMany({
            where: { provider_msg_id: providerId },
            data: {
                deliverstatus: status,
                lastattemptat: tsIso,
                error_message: errorMsg,
            },
        }),
    ]);
};

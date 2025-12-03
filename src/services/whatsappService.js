// src/services/whatsappService.js

import axios from "axios";
import config from "../config/index.js";
import { prisma } from "../config/prismaClient.js";
import { log, error } from "../utils/logger.js";

const BASE_BACKOFF_MINUTES = Number(process.env.WHATSAPP_RETRY_BASE_MINUTES || 5);
const MAX_BACKOFF_MINUTES = Number(process.env.WHATSAPP_RETRY_MAX_MINUTES || 60);

function calcNextRetryAt(currentRetryCount = 0) {
  const minutes = Math.min(
    BASE_BACKOFF_MINUTES * Math.pow(2, Math.max(currentRetryCount, 0)),
    MAX_BACKOFF_MINUTES
  );
  return new Date(Date.now() + minutes * 60 * 1000);
}

// Delivery logging helpers
async function createDeliveryAttempt(messageid) {
  if (!messageid) return null;
  return prisma.deliverlog.create({
    data: {
      messageid,
      deliverstatus: "pending",
      retrycount: 0,
      lastattemptat: new Date(),
    },
  });
}

async function markDeliverySuccess(deliverid, providerId) {
  if (!deliverid) return;
  await prisma.deliverlog.update({
    where: { deliverid },
    data: {
      deliverstatus: "sent",
      provider_msg_id: providerId ?? null,
      error_message: null,
      nextretryat: null,
      lastattemptat: new Date(),
    },
  });
}

async function markDeliveryFailure(deliverAttempt, err) {
  if (!deliverAttempt?.deliverid) return;
  const currentCount = deliverAttempt.retrycount ?? 0;
  await prisma.deliverlog.update({
    where: { deliverid: deliverAttempt.deliverid },
    data: {
      deliverstatus: "failed",
      error_message: (err?.message || "").slice(0, 500),
      retrycount: currentCount + 1,
      nextretryat: calcNextRetryAt(currentCount),
      lastattemptat: new Date(),
    },
  });
}

/**
 * Send a WhatsApp message.
 * If `messageRecord` is provided, also create/update deliverlog and message status.
 * Optionally pass an existing deliverLog row to reuse its retry counters.
 */
export async function sendWhatsAppMessage(to, messageObj, messageRecord = null, deliverLog = null) {
  let deliverAttempt = deliverLog || null;
  try {
    if (!to || !messageObj) throw new Error("Invalid message payload");

    let normalized;
    if (typeof messageObj === "string") {
      normalized = {
        type: "text",
        text: {
          body: messageObj,
          preview_url: true
        }
      };
    } else if (typeof messageObj === "object" && messageObj.type) {
      if (messageObj.type === "text") {
        messageObj.text.preview_url = messageObj.text.preview_url ?? true;
      }
      normalized = messageObj;
    } else {
      throw new Error("Invalid message payload");
    }

    const payload = {
      messaging_product: "whatsapp",
      to,
      ...normalized,
    };

    // Only create a new delivery attempt for the first send; retries reuse the existing row.
    if (!deliverAttempt && messageRecord) {
      deliverAttempt = await createDeliveryAttempt(messageRecord.messageid);
    }

    const res = await axios.post(
      `https://graph.facebook.com/v19.0/${config.whatsapp.phoneNumberId}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${config.whatsapp.token}`,
          "Content-Type": "application/json",
        },
      }
    );

    const providerId = res.data?.messages?.[0]?.id ?? null;

    if (deliverAttempt) {
      await markDeliverySuccess(deliverAttempt.deliverid, providerId);
    }
    if (messageRecord?.messageid) {
      await prisma.message.update({
        where: { messageid: messageRecord.messageid },
        data: {
          provider_msg_id: providerId,
          message_status: "sent",
          error_message: null,
        },
      });
    }

    log(`Message sent to ${to} (${normalized.type})`);
    return res.data;
  } catch (err) {
    // Log failure into deliverlog + message table if we started an attempt
    if (messageRecord?.messageid) {
      if (deliverAttempt) {
        await markDeliveryFailure(deliverAttempt, err);
      }
      await prisma.message.update({
        where: { messageid: messageRecord.messageid },
        data: {
          message_status: "error",
          error_message: (err?.message || "").slice(0, 500),
        },
      });
    }

    const status = err.response?.status;
    const data = err.response?.data;
    const msg = data?.error?.message || err.message || "Unknown error";

    error("WhatsApp send error:", status, data || err.message);

    const text = msg.toLowerCase();
    const isRestricted =
      text.includes("restricted") ||
      text.includes("suspended") ||
      text.includes("violated") ||
      text.includes("blocked");

    if (isRestricted) {
      const restrictedErr = new Error("WhatsApp account is restricted");
      restrictedErr.name = "WhatsAppRestrictedError";
      restrictedErr.status = status;
      restrictedErr.meta = data;
      throw restrictedErr;
    }

    throw err;
  }
}

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
async function createDeliveryAttempt(messageId) {
  if (!messageId) return null;
  return prisma.delivery_log.create({
    data: {
      message_id: messageId,
      delivery_status: "pending",
      retry_count: 0,
      last_attempt_at: new Date(),
    },
  });
}

async function markDeliverySuccess(deliveryId, providerId) {
  if (!deliveryId) return;
  await prisma.delivery_log.update({
    where: { delivery_id: deliveryId },
    data: {
      delivery_status: "sent",
      provider_msg_id: providerId ?? null,
      error_message: null,
      next_retry_at: null,
      last_attempt_at: new Date(),
    },
  });
}

async function markDeliveryFailure(deliverAttempt, err) {
  if (!deliverAttempt?.delivery_id) return;
  const currentCount = deliverAttempt.retry_count ?? 0;
  await prisma.delivery_log.update({
    where: { delivery_id: deliverAttempt.delivery_id },
    data: {
      delivery_status: "failed",
      error_message: (err?.message || "").slice(0, 500),
      retry_count: currentCount + 1,
      next_retry_at: calcNextRetryAt(currentCount),
      last_attempt_at: new Date(),
    },
  });
}

function extractImageFromText(body = "") {
  if (!body || typeof body !== "string") return null;

  const urlMatch = body.match(/https?:\/\/\S+/i);
  if (!urlMatch) return null;

  let url = urlMatch[0];
  url = url.replace(/[),.;!?]+$/, "");

  if (!/\.(jpe?g|png|gif|webp)$/i.test(url)) return null;

  const caption = body.replace(urlMatch[0], "").trim();
  return { url, caption: caption || null };
}

function buildInteractivePayload({ text, items = [], type = "buttons" }) {
  if (!Array.isArray(items) || items.length === 0) return null;

  // Buttons (max 3)
  if (type === "buttons") {
    return {
      type: "interactive",
      interactive: {
        type: "button",
        body: { text },
        action: {
          buttons: items.slice(0, 3).map((item, idx) => ({
            type: "reply",
            reply: {
              id: String(item.value ?? idx + 1),
              title: String(item.title).slice(0, 20),
            },
          })),
        },
      },
    };
  }

  // List menu (max 10)
  return {
    type: "interactive",
    interactive: {
      type: "list",
      body: { text },
      action: {
        button: "Select",
        sections: [
          {
            title: "Options",
            rows: items.slice(0, 10).map((item, idx) => ({
              id: String(item.value ?? idx + 1),
              title: String(item.title).slice(0, 24),
            })),
          },
        ],
      },
    },
  };
}

/**
 * Send a WhatsApp message.
 * If `messageRecord` is provided, also create/update deliverlog and message status.
 * Optionally pass an existing deliverLog row to reuse its retry counters.
 */
export async function sendWhatsAppMessage(to, messageObj, messageRecord = null, deliverLog = null) {
  let deliverAttempt = deliverLog || null;
  // Track if we've attempted a text-only fallback for a media payload
  let triedTextFallback = false;
  try {
    if (!to || !messageObj) throw new Error("Invalid message payload");

    let normalized;
    // ✅ INTERACTIVE MESSAGE SUPPORT
    if (
      typeof messageObj === "object" &&
      messageObj.interactionItems &&
      Array.isArray(messageObj.interactionItems)
    ) {
      const interactive = buildInteractivePayload({
        text:
          messageObj.text?.body ||
          messageObj.text ||
          messageObj.body ||
          "Please choose an option",
        items: messageObj.interactionItems,
        type: messageObj.interactionType || "buttons",
      });

      if (!interactive) {
        throw new Error("Invalid interactive payload");
      }

      normalized = interactive;
    } else if (typeof messageObj === "string") {
      const img = extractImageFromText(messageObj);
      if (img) {
        normalized = {
          type: "image",
          image: {
            link: img.url,
            ...(img.caption ? { caption: img.caption } : {}),
          },
        };
      } else {
        normalized = {
          type: "text",
          text: {
            body: messageObj,
            preview_url: true,
          },
        };
      }
    } else if (typeof messageObj === "object" && messageObj.type) {
      if (messageObj.type === "text" && messageObj.text?.body) {
        const img = extractImageFromText(messageObj.text.body);
        if (img) {
          normalized = {
            type: "image",
            image: {
              link: img.url,
              ...(img.caption ? { caption: img.caption } : {}),
            },
          };
        } else {
          messageObj.text = messageObj.text || {};
          messageObj.text.preview_url = messageObj.text.preview_url ?? true;
          normalized = messageObj;
        }
      } else {
        normalized = messageObj;
      }
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
      deliverAttempt = await createDeliveryAttempt(messageRecord.message_id);
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
      await markDeliverySuccess(deliverAttempt.delivery_id, providerId);
    }
    if (messageRecord?.message_id) {
      await prisma.message.update({
        where: { message_id: messageRecord.message_id },
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
    if (messageRecord?.message_id) {
      if (deliverAttempt) {
        await markDeliveryFailure(deliverAttempt, err);
      }
      await prisma.message.update({
        where: { message_id: messageRecord.message_id },
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

    // If media upload failed, try a text-only fallback so users aren't blocked
    const payloadType = (messageObj && typeof messageObj === "object" && messageObj.type) || null;
    const isMediaPayload = ["image", "video", "audio", "document"].includes(payloadType);
    if (isMediaPayload && messageRecord?.message_content && !triedTextFallback) {
      triedTextFallback = true;
      log("Sending text-only fallback after media send failure");
      try {
        await sendWhatsAppMessage(to, messageRecord.message_content, null, null);
      } catch (fallbackErr) {
        error("Fallback text send also failed:", fallbackErr?.message || fallbackErr);
      }
    }

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

// src/controllers/webhookController.js
import { whatsappWebhookSchema } from "../validators/webhookValidator.js";
import { prisma } from "../config/prismaClient.js";
import { sendWhatsAppMessage } from "../services/whatsappService.js";
import { handleIncomingMessage } from "../services/campaignEngine.js";
import { log, error } from "../utils/logger.js";
import { upsertStatus } from "../services/whatsappStatusService.js";

/**
 * Convert raw WA message into a simple display text for logging/DB
 */
function buildDisplayText(message) {
  switch (message.type) {
    case "text":
      return message.text?.body?.trim() || "";
    case "image":
      return `[Image received: ${message.image?.caption || "no caption"}]`;
    case "interactive":
      if (message.interactive?.type === "button_reply") {
        return `[Button reply: ${message.interactive.button_reply?.title}]`;
      }
      if (message.interactive?.type === "list_reply") {
        return `[List reply: ${message.interactive.list_reply?.title}]`;
      }
      return "[Interactive message]";
    case "location": {
      const lat = message.location?.latitude;
      const lng = message.location?.longitude;
      if (typeof lat === "number" && typeof lng === "number") {
        return `[Location: ${lat}, ${lng}]`;
      }
      return "[Location]";
    }
    case "sticker":
      return "[Sticker]";
    default:
      return "[Unsupported message type]";
  }
}

// NOTE: this is what the campaign engine sees
function mapToEnginePayload(message) {
  // Buttons
  if (message.type === "interactive" && message.interactive?.type === "button_reply") {
    return {
      text: message.interactive.button_reply?.title || "",
      type: "button",
    };
  }

  // List
  if (message.type === "interactive" && message.interactive?.type === "list_reply") {
    return {
      text: message.interactive.list_reply?.title || "",
      type: "list",
    };
  }

  // Location
  if (message.type === "location") {
    const lat = message.location?.latitude;
    const lng = message.location?.longitude;
    const hasCoords = typeof lat === "number" && typeof lng === "number";

    return {
      text: hasCoords ? `${lat},${lng}` : "",
      type: "location",
    };
  }

  // Plain text (default)
  if (message.type === "text") {
    return {
      text: message.text?.body?.trim() || "",
      type: "text",
    };
  }

  // Fallback
  return { text: "", type: "text" };
}

export async function verifyWebhook(req, res) {
  const mode = req.query["hub.mode"];
  const challenge = req.query["hub.challenge"];
  const token = req.query["hub.verify_token"];

  if (mode && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    log("Webhook verified successfully");
    return res.status(200).send(challenge);
  }
  error("Webhook verification failed");
  return res.sendStatus(403);
}

export async function webhookHandler(req, res) {
  const parseResult = whatsappWebhookSchema.safeParse(req.body);
  if (!parseResult.success) {
    error("Invalid webhook payload:", parseResult.error.format());
    return res.status(400).json({ error: "Invalid payload structure" });
  }
  const validData = parseResult.data;

  try {
    const entry = validData.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    const waDisplayPhone = value?.metadata?.display_phone_number || null;
    const waPhoneNumberId = value?.metadata?.phone_number_id || null;
    const waProfileName = value?.contacts?.[0]?.profile?.name || null;

    // STATUS RECEIPTS
    const statuses = value?.statuses || [];
    if (statuses.length) {
      for (const st of statuses) {
        const statusName = (st?.status || "").toLowerCase();
        if (statusName === "sent") log("Status: Sent");
        else if (statusName === "delivered") log("Status: Delivered");
        else if (statusName === "read") log("Status: Read");
        await upsertStatus(st);
      }
      return res.sendStatus(200);
    }

    const messages = value?.messages || [];
    if (!messages.length) {
      log("Webhook received non-message event (ignored).");
      return res.sendStatus(200);
    }

    const activeWaConfig = await prisma.whatsapp_config.findFirst({
      where: { is_active: true },
      orderBy: { id: "desc" },
      select: { phone_number: true, phone_number_id: true },
    });

    for (const message of messages) {
      const from = message?.from;
      if (!from) {
        error("Incoming message missing 'from':", JSON.stringify(message, null, 2));
        continue;
      }

      // Dedup inbound
      if (message.id) {
        const duplicate = await prisma.message.findFirst({
          where: { provider_msg_id: message.id },
        });
        if (duplicate) {
          log(`Duplicate inbound (ignored): ${message.id}`);
          continue;
        }
      }

      // Upsert contact + store WA profile name if available
      let contact = null;
      try {
        contact = await prisma.contact.upsert({
          where: { phone_num: from },
          update: waProfileName ? { name: waProfileName } : {},
          create: { phone_num: from, name: waProfileName || null },
        });
      } catch (contactErr) {
        error("Failed to upsert contact:", contactErr);
      }

      const rawText = buildDisplayText(message);
      log(`Message received: "${rawText}"`);
      log(`From ${from} (to ${waDisplayPhone || "unknown"} [id ${waPhoneNumberId || "unknown"}])`);

      // Store inbound
      await prisma.message.create({
        data: {
          direction: "inbound",
          content_type: message.type || "text",
          message_content: rawText,
          sender_id: from,
          receiver_id: waDisplayPhone,
          provider_msg_id: message.id ?? null,
          created_at: new Date(),
          message_status: "received",
          contact_id: contact?.contact_id ?? null,
          payload_json: JSON.stringify(message),
        },
      });

      const enginePayload = mapToEnginePayload(message);
      const result = await handleIncomingMessage({
        fromPhone: from,
        text: enginePayload.text,
        type: enginePayload.type,
        payload: req.body,
        enginePayload,
      });

      if (!result?.outbound?.length) continue;

      for (const outbound of result.outbound) {
        const to = outbound.to || from;
        const content = outbound.content || "";
        const stepContext = outbound.stepContext || {};
        const waPayload =
          outbound.waPayload ||
          ({
            type: "text",
            text: { body: content || "..." },
          });
        const senderId =
          activeWaConfig?.phone_number_id ||
          activeWaConfig?.phone_number ||
          waPhoneNumberId ||
          waDisplayPhone ||
          "server-api";
        const receiverId = to;
        const contentType = outbound.contentType || waPayload.type || "text";

        let messageRecord = null;
        try {
          messageRecord = await prisma.message.create({
            data: {
              campaign_id: stepContext.campaign_id ?? null,
              campaign_session_id: stepContext.campaign_session_id ?? null,
              contact_id: stepContext.contact_id ?? contact?.contact_id ?? null,
              direction: "outbound",
              content_type: contentType,
              message_content:
                content ||
                (waPayload.type === "text"
                  ? waPayload.text?.body ?? ""
                  : "[interactive message]"),
              sender_id: senderId,
              receiver_id: receiverId,
              payload_json: JSON.stringify(waPayload),
              message_status: "pending",
            },
          });
        } catch (createErr) {
          error("Failed to persist outbound message record:", createErr);
        }

        let providerId = null;
        try {
          const sendRes = await sendWhatsAppMessage(receiverId, waPayload, messageRecord);
          providerId = sendRes?.messages?.[0]?.id ?? null;
          log(`Reply sent to: ${receiverId}`);
        } catch (sendErr) {
          error(
            "WhatsApp send error (webhook reply):",
            sendErr?.response?.data || sendErr?.message || sendErr
          );
        }

        if (!messageRecord) {
          await prisma.message.create({
            data: {
              campaign_id: stepContext.campaign_id ?? null,
              campaign_session_id: stepContext.campaign_session_id ?? null,
              contact_id: stepContext.contact_id ?? contact?.contact_id ?? null,
              direction: "outbound",
              content_type: contentType,
              message_content:
                content ||
                (waPayload.type === "text"
                  ? waPayload.text?.body ?? ""
                  : "[interactive message]"),
              sender_id: senderId,
              receiver_id: receiverId,
              provider_msg_id: providerId,
              created_at: new Date(),
              message_status: providerId ? "sent" : "error",
              payload_json: JSON.stringify(waPayload),
            },
          });
        }
      }
    }

    return res.sendStatus(200);
  } catch (err) {
    error("Error in webhook handler:", err);
    return res.sendStatus(500);
  }
}

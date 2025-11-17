import { whatsappWebhookSchema } from "../validators/webhookValidator.js";
import prisma from "../config/prismaClient.js";
import { sendWhatsAppMessage } from "../services/whatsappService.js";
import { log, error } from "../utils/logger.js";

const KEYWORD_FALLBACK_MESSAGE =
  process.env.KEYWORD_FALLBACK_MESSAGE ||
  process.env.NEXT_PUBLIC_KEYWORD_FALLBACK_MESSAGE ||
  "Sorry, I didn't understand that. Type MENU to see available campaigns.";

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

const buildDisplayText = (message) => {
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
    case "sticker":
      return "[Sticker]";
    default:
      return "[Unsupported message type]";
  }
};

const upsertStatus = async (statusPayload) => {
  const providerId = statusPayload?.id || "";
  if (!providerId) return;
  const tsIso = statusPayload?.timestamp
    ? new Date(parseInt(statusPayload.timestamp, 10) * 1000)
    : new Date();
  await prisma.message.updateMany({
    where: { provider_msg_id: providerId },
    data: {
      message_status: (statusPayload?.status || "unknown").toLowerCase(),
      timestamp: tsIso,
    },
  });
};

const keywordReply = async (text) => {
  if (!text) return null;
  const keyword = await prisma.keyword.findFirst({
    where: { value: text.toLowerCase() },
  });
  if (!keyword) return null;

  const campaign = await prisma.campaign.findUnique({
    where: { campaignid: keyword.campaignid },
    select: { campaignname: true, objective: true },
  });

  if (!campaign) {
    return `Campaign (ID: ${keyword.campaignid}) found, but no detailed record available.`;
  }

  return `Campaign: ${campaign.campaignname}\n\nObjective: ${campaign.objective || "N/A"}\n\nType 'JOIN' to participate or 'MENU' for other campaigns.`;
};

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

    for (const message of messages) {
      const from = message?.from;
      if (!from) {
        error("Incoming message missing 'from':", JSON.stringify(message, null, 2));
        continue;
      }

      if (message.id) {
        const duplicate = await prisma.message.findFirst({
          where: { provider_msg_id: message.id },
        });
        if (duplicate) {
          log(`Duplicate inbound (ignored): ${message.id}`);
          continue;
        }
      }

      const rawText = buildDisplayText(message);
      log(`Message received: "${rawText}"`);
      log(`From ${from} (to ${waDisplayPhone || "unknown"} [id ${waPhoneNumberId || "unknown"}])`);

      await prisma.message.create({
        data: {
          direction: "inbound",
          content_type: message.type || "text",
          message_content: rawText,
          senderid: from,
          receiverid: waDisplayPhone,
          provider_msg_id: message.id ?? null,
          timestamp: new Date(),
          message_status: "received",
        },
      });

      let replyText;
      const isText = message.type === "text";
      const normalizedText = (message.text?.body || "").trim().toLowerCase();

      if (isText && normalizedText === "join") {
        replyText =
          "You have successfully joined the campaign. Please wait for further updates.";
      } else if (isText) {
        const keywordResponse = await keywordReply(normalizedText);
        replyText = keywordResponse || KEYWORD_FALLBACK_MESSAGE;
      } else if (message.type === "image") {
        replyText =
          "Nice image! For campaigns, please send a keyword (e.g. CNY) or type 'MENU'.";
      } else if (message.type === "interactive") {
        replyText =
          "Thanks for your selection! You can also type a campaign keyword or 'MENU'.";
      } else if (message.type === "sticker") {
        replyText =
          "Nice sticker! To join a campaign, send a keyword or type 'MENU'.";
      } else {
        replyText =
          "I received your message. Please send a campaign keyword or type 'MENU'.";
      }

      const replyMessageObj = { type: "text", text: { body: replyText } };

      let providerId = null;
      try {
        const sendRes = await sendWhatsAppMessage(from, replyMessageObj);
        providerId = sendRes?.messages?.[0]?.id ?? null;
        log(`Reply sent to: ${from}`);
      } catch (sendErr) {
        error("WhatsApp send error (webhook reply):", sendErr?.response?.data || sendErr?.message || sendErr);
      }

      await prisma.message.create({
        data: {
          direction: "outbound",
          content_type: "text",
          message_content: replyText,
          senderid: waDisplayPhone,
          receiverid: from,
          provider_msg_id: providerId,
          timestamp: new Date(),
          message_status: providerId ? "sent" : "error",
        },
      });

      log(`Reply recorded for: ${from}`);
    }

    return res.sendStatus(200);
  } catch (err) {
    error("Error in webhook handler:", err);
    return res.sendStatus(500);
  }
}

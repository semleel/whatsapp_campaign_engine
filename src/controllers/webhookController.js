// src/controllers/webhookController.js
import { whatsappWebhookSchema } from "../validators/webhookValidator.js";
import prisma from "../config/prismaClient.js";
import { sendWhatsAppMessage } from "../services/whatsappService.js";
import { log, error } from "../utils/logger.js";
import { findOrCreateSession } from "../services/flowEngine.js";
import { upsertStatus } from "../services/whatsappStatusService.js";
import {
  handleFlowOrKeyword,
  handleButtonReply,
} from "../services/whatsappFlowHandler.js";
import {
  buildGlobalFallbackBundle,
} from "../services/whatsappFallbackService.js";
import {
  buildWhatsappMessageFromContent,
} from "../services/whatsappContentService.js";

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

/**
 * Convert raw WA message into a simple display text for logging/DB
 */
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

    for (const message of messages) {
      const from = message?.from;
      if (!from) {
        error(
          "Incoming message missing 'from':",
          JSON.stringify(message, null, 2)
        );
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
          where: { phonenum: from },
          update: waProfileName ? { name: waProfileName } : {},
          create: { phonenum: from, name: waProfileName || null },
        });
      } catch (contactErr) {
        error("Failed to upsert contact:", contactErr);
      }

      const rawText = buildDisplayText(message);
      log(`Message received: "${rawText}"`);
      log(
        `From ${from} (to ${waDisplayPhone || "unknown"
        } [id ${waPhoneNumberId || "unknown"}])`
      );

      // Store inbound
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
          contactid: contact?.contactid ?? null,
        },
      });

      let mainReplyText = null;
      let mainReplyMessageObj = null;
      let mainContentKeyId = null;
      let extraReplies = [];
      let linkSessionId = null;
      let linkCampaignId = null;

      // Decide reply based on message type
      if (message.type === "text") {
        const textBody = message.text?.body || "";
        const {
          replyText,
          replyMessageObj,
          sessionid,
          campaignid,
          contentkeyid,
          extraReplies: extra,
        } = await handleFlowOrKeyword({ from, text: textBody, contact });

        mainReplyText = replyText;
        mainReplyMessageObj = replyMessageObj;
        mainContentKeyId = contentkeyid || null;
        extraReplies = extra || [];
        linkSessionId = sessionid || null;
        linkCampaignId = campaignid || null;
      } else if (
        message.type === "interactive" &&
        message.interactive?.type === "list_reply"
      ) {
        // Handle campaign selection from LIST
        const list = message.interactive.list_reply;
        const rowId = list?.id || "";

        let campaignId = null;
        if (rowId.startsWith("campaign_")) {
          const idStr = rowId.replace("campaign_", "");
          const parsed = parseInt(idStr, 10);
          campaignId = Number.isNaN(parsed) ? null : parsed;
        }

        if (!campaignId) {
          const { main, extras } = await buildGlobalFallbackBundle(contact);
          mainReplyText = main.replyText;
          mainReplyMessageObj = main.replyMessageObj;
          mainContentKeyId = main.contentkeyid || null;
          extraReplies = extras;
        } else {
          // Load campaign
          const campaign = await prisma.campaign.findUnique({
            where: { campaignid: campaignId },
          });

          if (
            !campaign ||
            campaign.status !== "Active" ||
            !campaign.entry_contentkeyid ||   // ✅ admin defines entry in DB
            !campaign.userflowid
          ) {
            const { main, extras } = await buildGlobalFallbackBundle(contact);
            mainReplyText = main.replyText;
            mainReplyMessageObj = main.replyMessageObj;
            mainContentKeyId = main.contentkeyid || null;
            extraReplies = extras;
          } else {
            // New signature: (contactid, { campaign, userflowid })
            const session = await findOrCreateSession(contact.contactid, {
              campaign,
              userflowid: campaign.userflowid,
            });

            const entryKey = session.checkpoint || campaign.entry_contentkeyid;

            // ensure entry content exists
            const km = await prisma.keymapping.findFirst({
              where: { contentkeyid: entryKey },
              include: { content: true },
            });

            if (!km?.content || km.content.isdeleted) {
              const { main, extras } = await buildGlobalFallbackBundle(contact);
              mainReplyText = main.replyText;
              mainReplyMessageObj = main.replyMessageObj;
              mainContentKeyId = main.contentkeyid || null;
              extraReplies = extras;
            } else {
              const ctx = {
                contact_name: contact?.name || contact?.phonenum || "there",
                phone: contact?.phonenum || "",
              };
              const built = buildWhatsappMessageFromContent(km.content, ctx);

              // ✅ keep session consistent (so next user msg continues flow)
              await prisma.campaignsession.update({
                where: { campaignsessionid: session.campaignsessionid },
                data: {
                  checkpoint: entryKey,
                  lastactiveat: new Date(),
                  sessionstatus: "ACTIVE",
                  current_userflowid: campaign.userflowid,
                },
              });

              mainReplyText = built.replyText;
              mainReplyMessageObj = built.message;
              mainContentKeyId = entryKey;
              linkSessionId = session.campaignsessionid;
              linkCampaignId = campaign.campaignid;
              extraReplies = [];
            }
          }
        }
      }
      else if (
        message.type === "interactive" &&
        message.interactive?.type === "button_reply"
      ) {
        const btn = message.interactive.button_reply;
        const btnId = btn?.id || "";

        const {
          replyText,
          replyMessageObj,
          contentkeyid,
          extraReplies: extra,
        } = await handleButtonReply({ id: btnId, contact, from });

        mainReplyText = replyText;
        mainReplyMessageObj = replyMessageObj;
        mainContentKeyId = contentkeyid || null;
        extraReplies = extra || [];
      } else if (
        message.type === "image" ||
        message.type === "sticker" ||
        message.type === "audio" ||
        message.type === "video" ||
        message.type === "document"
      ) {
        // Treat all non-text inputs as "I don't understand" → global fallback bundle
        const { main, extras } = await buildGlobalFallbackBundle(contact);
        mainReplyText = main.replyText;
        mainReplyMessageObj = main.replyMessageObj;
        mainContentKeyId = main.contentkeyid || null;
        extraReplies = extras;
      } else {
        // Unknown / unsupported type → global fallback bundle
        const { main, extras } = await buildGlobalFallbackBundle(contact);
        mainReplyText = main.replyText;
        mainReplyMessageObj = main.replyMessageObj;
        mainContentKeyId = main.contentkeyid || null;
        extraReplies = extras;
      }

      // Safety: main payload
      if (!mainReplyMessageObj) {
        const { main, extras } = await buildGlobalFallbackBundle(contact);
        mainReplyText = main.replyText;
        mainReplyMessageObj = main.replyMessageObj;
        mainContentKeyId = main.contentkeyid || null;
        if (!extraReplies || !extraReplies.length) {
          extraReplies = extras;
        }
      }

      // ALL replies in correct order: main first, then extras
      const allReplies = [
        {
          replyText: mainReplyText,
          replyMessageObj: mainReplyMessageObj,
          contentkeyid: mainContentKeyId,
        },
        ...(extraReplies || []),
      ].filter((r) => r.replyMessageObj);

      for (const item of allReplies) {
        let providerId = null;
        const finalText =
          item.replyText ??
          (item.replyMessageObj.type === "text"
            ? item.replyMessageObj.text?.body ?? ""
            : "[interactive message]");

        try {
          const sendRes = await sendWhatsAppMessage(from, item.replyMessageObj);
          providerId = sendRes?.messages?.[0]?.id ?? null;
          log(`Reply sent to: ${from}`);
        } catch (sendErr) {
          if (sendErr.name === "WhatsAppRestrictedError") {
            error("WA auto-reply blocked because account is restricted.");
          } else {
            error(
              "WhatsApp send error (webhook reply):",
              sendErr?.response?.data || sendErr?.message || sendErr
            );
          }
        }

        await prisma.message.create({
          data: {
            direction: "outbound",
            content_type: item.replyMessageObj.type,
            message_content: finalText,
            senderid: waDisplayPhone,
            receiverid: from,
            provider_msg_id: providerId,
            timestamp: new Date(),
            message_status: providerId ? "sent" : "error",
            contactid: contact?.contactid ?? null,
            campaignsessionid: linkSessionId,
            campaignid: linkCampaignId,
            contentkeyid: item.contentkeyid || null,
          },
        });

        log(`Reply recorded for: ${from}`);
      }
    }

    return res.sendStatus(200);
  } catch (err) {
    error("Error in webhook handler:", err);
    return res.sendStatus(500);
  }
}




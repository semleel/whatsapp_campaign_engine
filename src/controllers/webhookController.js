// src/controllers/webhookController.js
import { whatsappWebhookSchema } from "../validators/webhookValidator.js";
import { prisma } from "../config/prismaClient.js";
import { sendWhatsAppMessage } from "../services/whatsappService.js";
import { log, error } from "../utils/logger.js";
import {
  getActiveSessionForContact,
  getOrCreateGlobalMenuSession,
  startCampaignFromMenuSelection,
  SESSION_STATUS,
  runSystemStartFlow,
} from "../services/flowEngine.js";
import { SESSION_EXPIRY_MINUTES } from "../config/index.js";
import { upsertStatus } from "../services/whatsappStatusService.js";
import { handleFlowOrKeyword } from "../services/whatsappFlowHandler.js";
import {
  buildGlobalFallbackBundle,
} from "../services/whatsappFallbackService.js";
import {
  buildWhatsappMessageFromContent,
} from "../services/whatsappContentService.js";

// Normalise incoming WhatsApp text / button title into a single string
function extractUserText(incoming) {
  const msg = incoming?.messages?.[0];
  if (!msg) return { text: "", raw: null };

  if (msg.type === "interactive" && msg.interactive?.type === "button_reply") {
    const title = msg.interactive.button_reply?.title || "";
    return { text: title.trim(), raw: msg };
  }

  if (msg.type === "interactive" && msg.interactive?.type === "list_reply") {
    const title = msg.interactive.list_reply?.title || "";
    return { text: title.trim(), raw: msg };
  }

  if (msg.type === "text" && msg.text?.body) {
    return { text: msg.text.body.trim(), raw: msg };
  }

  return { text: "", raw: msg };
}

async function enforceSessionExpiry(contact) {
  if (!contact?.contactid) return null;
  const session = await getActiveSessionForContact(contact.contactid);
  if (!session) return null;

  const last = session.lastactiveat || session.createdat;
  const diffMs = Date.now() - new Date(last || Date.now()).getTime();
  const diffMin = diffMs / (60 * 1000);

  if (diffMin > SESSION_EXPIRY_MINUTES) {
    await prisma.campaignsession.update({
      where: { campaignsessionid: session.campaignsessionid },
      data: { sessionstatus: SESSION_STATUS.EXPIRED },
    });
    return null;
  }

  return session;
}

async function buildActiveCampaignList() {
  const campaigns = await prisma.campaign.findMany({
    where: { status: "Active" },
    orderBy: { campaignid: "asc" },
    select: {
      campaignid: true,
      campaignname: true,
      objective: true,
    },
  });

  if (!campaigns.length) return null;

  return {
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: "Please choose a campaign to join:" },
      action: {
        button: "View campaigns",
        sections: [
          {
            title: "Available campaigns",
            rows: campaigns.map((c) => ({
              id: `campaign:${c.campaignid}`,
              title: c.campaignname,
              description: c.objective || "",
            })),
          },
        ],
      },
    },
  };
}

async function sendActiveCampaignList(contact, session) {
  const payload = await buildActiveCampaignList();
  if (!payload) {
    await sendWhatsAppMessage(contact.phonenum, {
      type: "text",
      text: { body: "No active campaigns at the moment." },
    });
    if (session) {
      await prisma.campaignsession.update({
        where: { campaignsessionid: session.campaignsessionid },
        data: { lastactiveat: new Date() },
      });
    }
    return;
  }

  const msgRecord = await prisma.message.create({
    data: {
      direction: "outbound",
      content_type: payload.type || "interactive",
      message_content: "[interactive:list]",
      senderid: "whatsapp-engine",
      receiverid: contact.phonenum,
      provider_msg_id: null,
      timestamp: new Date(),
      message_status: "pending",
      payload_json: JSON.stringify(payload),
      contactid: contact.contactid,
      campaignsessionid: session?.campaignsessionid || null,
      campaignid: session?.campaignid || null,
      contentkeyid: null,
    },
  });

  const res = await sendWhatsAppMessage(contact.phonenum, payload, msgRecord);
  const providerId = res?.messages?.[0]?.id ?? null;
  if (providerId) {
    await prisma.message.update({
      where: { messageid: msgRecord.messageid },
      data: { provider_msg_id: providerId, message_status: "sent" },
    });
  }

  if (session) {
    await prisma.campaignsession.update({
      where: { campaignsessionid: session.campaignsessionid },
      data: { lastactiveat: new Date() },
    });
  }
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

      const { text: userText } = extractUserText({ messages: [message] });
      const lower = (userText || "").trim().toLowerCase();
      const activeSession = await enforceSessionExpiry(contact);

      // --- Global commands ---
      if (lower === "/reset") {
        if (contact?.contactid) {
          await prisma.campaignsession.updateMany({
            where: {
              contactid: contact.contactid,
              sessionstatus: SESSION_STATUS.ACTIVE,
            },
            data: {
              sessionstatus: SESSION_STATUS.COMPLETED,
              lastactiveat: new Date(),
            },
          });
          await runSystemStartFlow({
            contact,
            triggerReason: "manual_reset",
          });
        }
        continue;
      }

      if (lower === "/start") {
        if (contact?.contactid) {
          await prisma.campaignsession.updateMany({
            where: {
              contactid: contact.contactid,
              sessionstatus: SESSION_STATUS.ACTIVE,
            },
            data: {
              sessionstatus: SESSION_STATUS.COMPLETED,
              lastactiveat: new Date(),
            },
          });
          await runSystemStartFlow({
            contact,
            triggerReason: "user_start",
          });
        }
        continue;
      }

      const session = activeSession;

      // Join campaign button => send dynamic list of active campaigns
      if (
        (message.type === "interactive" &&
          message.interactive?.type === "button_reply" &&
          lower.includes("join campaign")) ||
        (message.type === "text" && lower.includes("join campaign"))
      ) {
        const sessionForMenu =
          session ||
          (contact?.contactid
            ? await getOrCreateGlobalMenuSession(contact.contactid)
            : null);
        await sendActiveCampaignList(contact, sessionForMenu);
        continue;
      }

      // If no active session (first chat or expired) -> show main menu
      if (!session) {
        await runSystemStartFlow({
          contact,
          triggerReason: "first_message",
        });
        continue;
      }

      let mainReplyText = null;
      let mainReplyMessageObj = null;
      let mainContentKeyId = null;
      let extraReplies = [];
      let linkSessionId = null;
      let linkCampaignId = null;

      // Decide reply based on message type
      if (
        message.type === "text" ||
        (message.type === "interactive" &&
          message.interactive?.type === "button_reply")
      ) {
        const textBody = userText || "";
        const flowResult = await handleFlowOrKeyword({
          from,
          text: textBody,
          contact,
        });

        if (flowResult?.skipSend) {
          linkSessionId = flowResult.sessionid || null;
          linkCampaignId = flowResult.campaignid || null;
          continue;
        }

        mainReplyText = flowResult.replyText;
        mainReplyMessageObj = flowResult.replyMessageObj;
        mainContentKeyId = flowResult.contentkeyid || null;
        extraReplies = flowResult.extraReplies || [];
        linkSessionId = flowResult.sessionid || null;
        linkCampaignId = flowResult.campaignid || null;
      } else if (
        message.type === "interactive" &&
        message.interactive?.type === "list_reply"
      ) {
        const rowId = message.interactive.list_reply?.id || "";
        if (rowId.startsWith("campaign:")) {
          const parsedId = parseInt(rowId.split(":")[1], 10);
          if (!Number.isNaN(parsedId)) {
            await startCampaignFromMenuSelection({
              contact,
              campaignId: parsedId,
            });
            continue;
          }
        }

        const { main, extras } = await buildGlobalFallbackBundle(contact);
        mainReplyText = main.replyText;
        mainReplyMessageObj = main.replyMessageObj;
        mainContentKeyId = main.contentkeyid || null;
        extraReplies = extras;
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








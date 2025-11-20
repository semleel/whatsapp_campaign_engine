import { whatsappWebhookSchema } from "../validators/webhookValidator.js";
import prisma from "../config/prismaClient.js";
import { sendWhatsAppMessage } from "../services/whatsappService.js";
import { log, error } from "../utils/logger.js";
import {
  processIncomingMessage,
  findOrCreateContactByPhone,
  findCommandContentKeyForCampaign,
  SESSION_STATUS,
} from "../services/flowEngine.js";

const KEYWORD_FALLBACK_MESSAGE =
  process.env.KEYWORD_FALLBACK_MESSAGE ||
  process.env.NEXT_PUBLIC_KEYWORD_FALLBACK_MESSAGE ||
  "Sorry, I didn't understand that. Type MENU to see available campaigns.";

/**
 * Build WhatsApp LIST message showing active campaigns + their keywords
 */
const buildWhatsappMenuList = async () => {
  const campaigns = await prisma.campaign.findMany({
    where: { status: "Active" },
    select: {
      campaignid: true,
      campaignname: true,
      objective: true,
      keyword: {
        take: 1, // only 1 keyword per campaign
        orderBy: { keywordid: "asc" },
        select: { value: true },
      },
    },
    orderBy: { campaignid: "asc" },
  });

  // Filter out campaigns that have NO keywords
  const validCampaigns = campaigns.filter((c) => c.keyword.length > 0);

  if (!validCampaigns.length) {
    return {
      type: "text",
      text: { body: "There are no available keywords at the moment." },
    };
  }

  const rows = validCampaigns.slice(0, 10).map((c) => {
    const keyword = c.keyword[0].value;
    return {
      id: `keyword_${keyword}`,
      title: c.campaignname.slice(0, 24), // shown to user
      // description: (c.objective || "").slice(0, 72),
    };
  });

  return {
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: "Available Campaigns:" },
      footer: { text: "Choose one to view campaign details." },
      action: {
        button: "View Campaigns", // must be ≤ 20 chars
        sections: [
          {
            title: "Campaign List",
            rows,
          },
        ],
      },
    },
  };
};

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

async function handleJoinCommand(from) {
  const phonenum = (from || "").trim();
  if (!phonenum) {
    const replyText = KEYWORD_FALLBACK_MESSAGE;
    return {
      replyText,
      replyMessageObj: { type: "text", text: { body: replyText } },
      sessionid: null,
      campaignid: null,
      contentkeyid: null,
    };
  }

  const contact = await findOrCreateContactByPhone(phonenum);

  const session = await prisma.campaignsession.findFirst({
    where: {
      contactid: Number(contact.contactid),
      sessionstatus: { not: SESSION_STATUS.CANCELLED },
    },
    include: { campaign: true },
    orderBy: [
      { lastactiveat: "desc" },
      { createdat: "desc" },
    ],
  });

  if (!session) {
    const replyText =
      "We couldn't find an active campaign. Please send a campaign keyword to start first.";
    return {
      replyText,
      replyMessageObj: { type: "text", text: { body: replyText } },
      sessionid: null,
      campaignid: null,
      contentkeyid: null,
    };
  }

  const joinKey = session.campaign
    ? await findCommandContentKeyForCampaign(session.campaign, "join")
    : null;

  let replyText =
    "You have successfully joined the campaign. Please wait for further updates.";
  let replyMessageObj = { type: "text", text: { body: replyText } };
  let contentkeyid = null;

  if (joinKey) {
    const km = await prisma.keymapping.findUnique({
      where: { contentkeyid: joinKey },
      include: { content: true },
    });
    if (km?.content) {
      const built = buildWhatsappMessageFromContent(km.content);
      replyText = built.replyText;
      replyMessageObj = built.message;
    }
    contentkeyid = joinKey;
  }

  const updated = await prisma.campaignsession.update({
    where: { campaignsessionid: session.campaignsessionid },
    data: {
      checkpoint: joinKey ?? session.checkpoint,
      sessionstatus: SESSION_STATUS.ACTIVE,
      lastactiveat: new Date(),
    },
  });

  await prisma.sessionlog.create({
    data: {
      campaignsessionid: session.campaignsessionid,
      contentkeyid: joinKey ?? session.checkpoint ?? null,
      detail: joinKey
        ? `JOIN command routed to ${joinKey}`
        : "JOIN command received (no command key configured).",
    },
  });

  return {
    replyText,
    replyMessageObj,
    sessionid: updated.campaignsessionid,
    campaignid: updated.campaignid,
    contentkeyid,
  };
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

/**
 * Build a WhatsApp message object from a `content` row.
 * Supports text / image / video / document / interactive buttons / list.
 */
function buildWhatsappMessageFromContent(content) {
  const type = (content.type || "text").toLowerCase();
  const baseText =
    content.body ||
    content.description ||
    content.title ||
    "Thank you, we have moved you to the next step of the campaign.";

  // Default: plain text
  const asText = {
    replyText: baseText,
    message: { type: "text", text: { body: baseText } },
  };

  // TEXT
  if (!type || type === "text") {
    return asText;
  }

  // IMAGE
  if (type === "image") {
    if (!content.mediaurl) return asText;

    return {
      replyText: baseText,
      message: {
        type: "image",
        image: {
          link: content.mediaurl,
          caption: baseText,
        },
      },
    };
  }

  // VIDEO
  if (type === "video") {
    if (!content.mediaurl) return asText;

    return {
      replyText: baseText,
      message: {
        type: "video",
        video: {
          link: content.mediaurl,
          caption: baseText,
        },
      },
    };
  }

  // DOCUMENT / FILE
  if (type === "document" || type === "file") {
    if (!content.mediaurl) return asText;

    return {
      replyText: baseText,
      message: {
        type: "document",
        document: {
          link: content.mediaurl,
          caption: baseText,
        },
      },
    };
  }

  // BUTTONS (interactive)
  if (type === "interactive_buttons") {
    let buttons = [];
    try {
      const ph = content.placeholders;
      if (ph && typeof ph === "object" && Array.isArray(ph.buttons)) {
        buttons = ph.buttons;
      }
    } catch (e) {
      // ignore malformed placeholders
    }

    if (!buttons.length) return asText;

    return {
      replyText: baseText,
      message: {
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: baseText },
          action: {
            buttons: buttons.slice(0, 3).map((b, idx) => ({
              type: "reply",
              reply: {
                id: b.id || `btn_${idx + 1}`,
                title: b.title || `Option ${idx + 1}`,
              },
            })),
          },
        },
      },
    };
  }

  // LIST (interactive)
  if (type === "interactive_list") {
    // expects placeholders.sections = [{ title, rows: [{ id, title, description }] }]
    let sections = [];
    try {
      const ph = content.placeholders;
      if (ph && typeof ph === "object" && Array.isArray(ph.sections)) {
        sections = ph.sections;
      }
    } catch (e) {
      // ignore malformed placeholders
    }

    if (!sections.length) return asText;

    return {
      replyText: baseText,
      message: {
        type: "interactive",
        interactive: {
          type: "list",
          body: { text: baseText },
          footer: { text: content.description || "" },
          action: {
            button: "Select", // you can customize with placeholders later
            sections: sections,
          },
        },
      },
    };
  }

  // Fallback = text
  return asText;
}

/**
 * Map WA status callbacks (sent/delivered/read) onto your message table
 */
const upsertStatus = async (statusPayload) => {
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

/**
 * Helper: handle text/keyword via flow engine + MENU / JOIN specials.
 *
 * Returns:
 *  - replyText: string | null
 *  - replyMessageObj: full WA message payload
 *  - sessionid: campaignsessionid | null
 *  - campaignid: campaignid | null
 *  - contentkeyid: contentkeyid | null
 */
async function handleFlowOrKeyword({ from, text }) {
  const normalizedOriginal = (text || "").trim();
  const normalizedLower = normalizedOriginal.toLowerCase();

  // OPTION A: "hi" always restarts conversation
  if (normalizedLower === "hi") {
    const replyText =
      "Welcome! Please choose a campaign keyword to begin, or type MENU to see available options.";
    return {
      replyText,
      replyMessageObj: { type: "text", text: { body: replyText } },
      sessionid: null,
      campaignid: null,
      contentkeyid: null,
    };
  }

  // Special command: MENU -> show list of campaigns/keywords
  if (normalizedLower === "menu") {
    const menuMessage = await buildWhatsappMenuList();
    return {
      replyText: null,
      replyMessageObj: menuMessage,
      sessionid: null,
      campaignid: null,
      contentkeyid: null,
    };
  }

  if (normalizedLower === "join") {
    return handleJoinCommand(from);
  }

  // Hand off to flow engine
  try {
    const flow = await processIncomingMessage({ from, text: normalizedOriginal });

    if (!flow || !flow.action) {
      const replyText = KEYWORD_FALLBACK_MESSAGE;
      return {
        replyText,
        replyMessageObj: { type: "text", text: { body: replyText } },
        sessionid: null,
        campaignid: null,
        contentkeyid: null,
      };
    }

    // No campaign matched this keyword
    if (flow.action === "no_campaign") {
      const replyText = KEYWORD_FALLBACK_MESSAGE;
      return {
        replyText,
        replyMessageObj: { type: "text", text: { body: replyText } },
        sessionid: null,
        campaignid: null,
        contentkeyid: null,
      };
    }

    // Session exists but is paused or completed
    if (flow.action === "paused" || flow.action === "completed") {
      const replyText = flow.reply || KEYWORD_FALLBACK_MESSAGE;
      return {
        replyText,
        replyMessageObj: { type: "text", text: { body: replyText } },
        sessionid: flow.sessionid || null,
        campaignid: flow.campaignid || null,
        contentkeyid: null,
      };
    }

    // Session moved to next checkpoint
    if (flow.action === "moved") {
      const sessionid = flow.sessionid || null;
      const campaignid = flow.campaignid || null;
      const contentkeyid = flow.nextKey || null;

      // Case 1: we have a nextKey => use content
      if (flow.nextKey) {
        const km = await prisma.keymapping.findUnique({
          where: { contentkeyid: flow.nextKey },
          include: { content: true },
        });

        const content = km?.content || null;
        if (content) {
          const built = buildWhatsappMessageFromContent(content);
          return {
            replyText: built.replyText,
            replyMessageObj: built.message,
            sessionid,
            campaignid,
            contentkeyid,
          };
        }

        // no content found for that key
        const replyText =
          "We couldn't find the next step in this flow. Please type MENU to start again.";
        return {
          replyText,
          replyMessageObj: { type: "text", text: { body: replyText } },
          sessionid,
          campaignid,
          contentkeyid,
        };
      }

      // Case 2: no nextKey => fallback to campaign intro (your old keywordReply behaviour)
      if (campaignid) {
        const campaign = await prisma.campaign.findUnique({
          where: { campaignid },
          select: { campaignname: true, objective: true },
        });

        if (campaign) {
          const replyText =
            `Campaign: *${campaign.campaignname}*\n\n` +
            `${campaign.objective || "N/A"}\n\n` +
            `Type 'JOIN' to participate or 'MENU' for other campaigns.`;

          return {
            replyText,
            replyMessageObj: { type: "text", text: { body: replyText } },
            sessionid,
            campaignid,
            contentkeyid: null,
          };
        }
      }

      // If still nothing, show generic error
      const replyText =
        "We couldn't find the next step in this flow. Please type MENU to start again.";
      return {
        replyText,
        replyMessageObj: { type: "text", text: { body: replyText } },
        sessionid,
        campaignid,
        contentkeyid: null,
      };
    }

    // Unknown action => fallback
    const replyText = KEYWORD_FALLBACK_MESSAGE;
    return {
      replyText,
      replyMessageObj: { type: "text", text: { body: replyText } },
      sessionid: null,
      campaignid: null,
      contentkeyid: null,
    };
  } catch (err) {
    error("Error in processIncomingMessage:", err);
    const replyText = KEYWORD_FALLBACK_MESSAGE;
    return {
      replyText,
      replyMessageObj: { type: "text", text: { body: replyText } },
      sessionid: null,
      campaignid: null,
      contentkeyid: null,
    };
  }
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

      // Dedup inbound by provider message ID
      if (message.id) {
        const duplicate = await prisma.message.findFirst({
          where: { provider_msg_id: message.id },
        });
        if (duplicate) {
          log(`Duplicate inbound (ignored): ${message.id}`);
          continue;
        }
      }

      // Ensure contact exists for this phone number
      let contact = null;
      try {
        contact = await prisma.contact.upsert({
          where: { phonenum: from },
          update: {},
          create: { phonenum: from },
        });
      } catch (contactErr) {
        error("Failed to upsert contact:", contactErr);
      }

      const rawText = buildDisplayText(message);
      log(`Message received: "${rawText}"`);
      log(
        `From ${from} (to ${waDisplayPhone || "unknown"} [id ${waPhoneNumberId || "unknown"
        }])`
      );

      // Store inbound message
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

      let replyText = null;
      let replyMessageObj = null;
      let linkSessionId = null;
      let linkCampaignId = null;
      let linkContentKeyId = null;

      // -----------------------------
      // Decide reply based on type
      // -----------------------------
      if (message.type === "text") {
        const textBody = message.text?.body || "";
        const {
          replyText: rText,
          replyMessageObj: rMsg,
          sessionid,
          campaignid,
          contentkeyid,
        } = await handleFlowOrKeyword({ from, text: textBody });

        replyText = rText;
        replyMessageObj = rMsg;
        linkSessionId = sessionid;
        linkCampaignId = campaignid;
        linkContentKeyId = contentkeyid;
      } else if (
        message.type === "interactive" &&
        message.interactive?.type === "list_reply"
      ) {
        const list = message.interactive.list_reply;
        const id = list?.id || ""; // e.g. "keyword_cny"
        let keywordValue = null;

        if (id.startsWith("keyword_")) {
          keywordValue = id.replace("keyword_", "");
        }

        const {
          replyText: rText,
          replyMessageObj: rMsg,
          sessionid,
          campaignid,
          contentkeyid,
        } = await handleFlowOrKeyword({
          from,
          text: keywordValue || "",
        });

        replyText = rText;
        replyMessageObj = rMsg;
        linkSessionId = sessionid;
        linkCampaignId = campaignid;
        linkContentKeyId = contentkeyid;
      } else if (message.type === "image") {
        replyText =
          "Nice image! For campaigns, please send a keyword (e.g. CNY) or type 'MENU'.";
        replyMessageObj = { type: "text", text: { body: replyText } };
      } else if (message.type === "sticker") {
        replyText =
          "Nice sticker! To join a campaign, send a keyword (e.g. CNY) or type 'MENU'.";
        replyMessageObj = { type: "text", text: { body: replyText } };
      } else {
        replyText =
          "I received your message. Please send a campaign keyword (e.g. CNY) or type 'MENU'.";
        replyMessageObj = { type: "text", text: { body: replyText } };
      }

      // Safety: if for some reason handler didn't produce a WA payload
      if (!replyMessageObj) {
        const fallback = replyText || KEYWORD_FALLBACK_MESSAGE;
        replyText = fallback;
        replyMessageObj = { type: "text", text: { body: fallback } };
      }

      // -----------------------------
      // Record outbound reply + send via WhatsApp API
      // -----------------------------
      let outboundMessage = null;
      try {
        outboundMessage = await prisma.message.create({
          data: {
            direction: "outbound",
            content_type: replyMessageObj.type,
            message_content: replyText ?? "[interactive message]",
            senderid: waDisplayPhone,
            receiverid: from,
            provider_msg_id: null,
            timestamp: new Date(),
            message_status: "pending",
            contactid: contact?.contactid ?? null,
            campaignsessionid: linkSessionId,
            campaignid: linkCampaignId,
            contentkeyid: linkContentKeyId,
            payload_json: JSON.stringify(replyMessageObj),
          },
        });

        await sendWhatsAppMessage(from, replyMessageObj, outboundMessage);
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

      log(`Reply recorded for: ${from}`);
    }

    return res.sendStatus(200);
  } catch (err) {
    error("Error in webhook handler:", err);
    return res.sendStatus(500);
  }
}

// src/controllers/webhookController.js
import { whatsappWebhookSchema } from "../validators/webhookValidator.js";
import prisma from "../config/prismaClient.js";
import { sendWhatsAppMessage } from "../services/whatsappService.js";
import { log, error } from "../utils/logger.js";
import {
  processIncomingMessage,
  findOrCreateSession,
} from "../services/flowEngine.js";

/**
 * Build WhatsApp LIST message showing active, launchable campaigns
 */
const buildWhatsappMenuList = async () => {
  const campaigns = await prisma.campaign.findMany({
    where: {
      status: "Active",
      keyword: { some: {} },       // at least 1 keyword
      contentkeyid: { not: null }, // has an entry content key
    },
    select: {
      campaignid: true,
      campaignname: true,
      contentkeyid: true,
      keymapping: {
        select: {
          content: {
            select: {
              contentid: true,
              status: true,
              isdeleted: true,
              title: true,
            },
          },
        },
      },
    },
    orderBy: { campaignid: "asc" },
  });

  // Filter to only those where the entry content really exists & is not deleted
  const launchableCampaigns = campaigns.filter((c) => {
    const content = c.keymapping?.content;
    if (!content) return false;
    if (content.isdeleted) return false;
    // Optional: filter out Draft content
    // if ((content.status || "").toLowerCase() === "draft") return false;
    return true;
  });

  if (!launchableCampaigns.length) {
    return {
      type: "text",
      text: {
        body:
          "There are no campaigns fully configured with intro content. Please contact our customer support.",
      },
    };
  }

  const rows = launchableCampaigns.map((c) => ({
    id: `campaign_${c.campaignid}`, // used in list_reply handler
    title: c.campaignname.slice(0, 24),
  }));

  return {
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: "Available Campaigns:" },
      footer: { text: "Choose one to start the campaign." },
      action: {
        button: "View Campaigns",
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

/**
 * JOIN_CAMPAIGN_INSTRUCTION from content table
 */
async function buildKeywordHintText(contact = null) {
  const content = await loadContentByKey("JOIN_CAMPAIGN_INSTRUCTION", contact);

  if (!content) {
    throw new Error("Missing JOIN_CAMPAIGN_INSTRUCTION content in DB");
  }

  // shape: { replyText, replyMessageObj, contentkeyid }
  return content;
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

/**
 * Very small template renderer:
 *   - {{contact_name}}
 *   - {{phone}}
 */
function renderTextTemplate(text, ctx = {}) {
  if (!text) return "";
  let out = text;

  if (ctx.contact_name != null) {
    out = out.replace(/{{\s*contact_name\s*}}/gi, ctx.contact_name);
  }
  if (ctx.phone != null) {
    out = out.replace(/{{\s*phone\s*}}/gi, ctx.phone);
  }

  return out.trim();
}

/**
 * Build a WhatsApp message object from a `content` row.
 * Supports text / image / video / document / interactive buttons / list.
 */
function buildWhatsappMessageFromContent(content, templateCtx = {}) {
  const render = (s) => renderTextTemplate(s, templateCtx);

  const type = (content.type || "text").toLowerCase();
  const baseText =
    render(content.body) ||
    render(content.description) ||
    render(content.title) ||
    "Thank you, we have moved you to the next step of the campaign.";

  const asText = {
    replyText: baseText,
    message: { type: "text", text: { body: baseText } },
  };

  if (!type || type === "text") return asText;

  if (type === "image") {
    if (!content.mediaurl) return asText;
    return {
      replyText: baseText,
      message: {
        type: "image",
        image: { link: content.mediaurl, caption: baseText },
      },
    };
  }

  if (type === "video") {
    if (!content.mediaurl) return asText;
    return {
      replyText: baseText,
      message: {
        type: "video",
        video: { link: content.mediaurl, caption: baseText },
      },
    };
  }

  if (type === "document" || type === "file") {
    if (!content.mediaurl) return asText;
    return {
      replyText: baseText,
      message: {
        type: "document",
        document: { link: content.mediaurl, caption: baseText },
      },
    };
  }

  if (type === "interactive_buttons") {
    let buttons = [];
    try {
      const ph = content.placeholders;
      if (ph && typeof ph === "object" && Array.isArray(ph.buttons)) {
        buttons = ph.buttons;
      }
    } catch {
      // ignore
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

  if (type === "interactive_list") {
    let sections = [];
    try {
      const ph = content.placeholders;
      if (ph && typeof ph === "object" && Array.isArray(ph.sections)) {
        sections = ph.sections;
      }
    } catch {
      // ignore
    }
    if (!sections.length) return asText;

    return {
      replyText: baseText,
      message: {
        type: "interactive",
        interactive: {
          type: "list",
          body: { text: baseText },
          footer: { text: render(content.description || "") },
          action: {
            button: "Select",
            sections,
          },
        },
      },
    };
  }

  return asText;
}

/**
 * Load a content by contentkeyid and build WA message
 */
async function loadContentByKey(contentKey, contact) {
  const km = await prisma.keymapping.findUnique({
    where: { contentkeyid: contentKey },
    include: { content: true },
  });

  if (!km?.content) {
    // Force misconfig to surface for special keys
    if (
      contentKey.startsWith("ONBOARD_") ||
      contentKey === "ONBOARD_SELECT_OPTION" ||
      contentKey === "JOIN_CAMPAIGN_INSTRUCTION" ||
      contentKey === "GLOBAL_FALLBACK"
    ) {
      throw new Error(`Missing ${contentKey} content in DB`);
    }
    return null;
  }

  const ctx = {
    contact_name: contact?.name || contact?.phonenum || "there",
    phone: contact?.phonenum || "",
  };

  const built = buildWhatsappMessageFromContent(km.content, ctx);
  return {
    replyText: built.replyText,
    replyMessageObj: built.message,
    contentkeyid: contentKey,
  };
}

/**
 * Helper: build a sequence of content messages by keys
 */
async function buildContentSequence(contentKeys, contact) {
  const results = [];
  for (const key of contentKeys) {
    const res = await loadContentByKey(key, contact);
    if (res) results.push(res);
  }
  return results;
}

/**
 * Load GLOBAL_FALLBACK from DB (must exist)
 */
async function loadGlobalFallbackMessage(contact) {
  const res = await loadContentByKey("GLOBAL_FALLBACK", contact); // throws if missing
  return res; // { replyText, replyMessageObj, contentkeyid }
}

/**
 * Global fallback bundle:
 *  - GLOBAL_FALLBACK
 *  - JOIN_CAMPAIGN_INSTRUCTION
 *  - Campaign menu list
 *  - Start over button
 */
async function buildGlobalFallbackBundle(contact) {
  // Main GLOBAL_FALLBACK
  const main = await loadGlobalFallbackMessage(contact);

  // Join campaign instruction
  const joinInstruction = await buildKeywordHintText(contact);

  // Campaign menu
  const menuMessage = await buildWhatsappMenuList();
  const menuReply = {
    replyText: null,
    replyMessageObj: menuMessage,
    contentkeyid: null,
  };

  // Start over button
  const startOverText = "Or you can start a new conversation.";
  const startOverMessageObj = {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: startOverText },
      action: {
        buttons: [
          {
            type: "reply",
            reply: {
              id: "GLOBAL_START_OVER",
              title: "Start Over",
            },
          },
        ],
      },
    },
  };

  const startOver = {
    replyText: startOverText,
    replyMessageObj: startOverMessageObj,
    contentkeyid: null,
  };

  return {
    main,
    extras: [joinInstruction, menuReply, startOver],
  };
}

/**
 * Map WA status callbacks (sent/delivered/read) onto your message & deliverlog tables
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
 * Normalize result + support extraReplies for multi-message flows
 */
function makeResult({
  replyText,
  replyMessageObj,
  sessionid = null,
  campaignid = null,
  contentkeyid = null,
  extraReplies = [],
}) {
  return {
    replyText,
    replyMessageObj,
    sessionid,
    campaignid,
    contentkeyid,
    extraReplies,
  };
}

/**
 * Handle text commands + keyword flow
 */
async function handleFlowOrKeyword({ from, text, contact }) {
  const normalizedOriginal = (text || "").trim();
  const normalizedLower = normalizedOriginal.toLowerCase();

  // --- Last outbound content key (to know if we are waiting for a button) ---
  let lastOutboundKey = null;
  if (contact?.contactid) {
    const lastOutbound = await prisma.message.findFirst({
      where: { contactid: contact.contactid, direction: "outbound" },
      orderBy: { timestamp: "desc" },
      select: { contentkeyid: true },
    });
    lastOutboundKey = lastOutbound?.contentkeyid || null;
  }

  const BUTTON_ONLY_KEYS = new Set([
    "ONBOARD_LANGUAGE",
    "ONBOARD_TOS_CONFIRM",
    "ONBOARD_MAIN_MENU",
  ]);

  // If we are expecting a button tap, do NOT accept random text
  if (
    BUTTON_ONLY_KEYS.has(lastOutboundKey) &&
    normalizedLower &&
    normalizedLower !== "/start-over"
  ) {
    const selectContent = await loadContentByKey(
      "ONBOARD_SELECT_OPTION",
      contact
    ); // throws if missing
    return makeResult({
      replyText: selectContent.replyText,
      replyMessageObj: selectContent.replyMessageObj,
      contentkeyid: selectContent.contentkeyid,
    });
  }

  // --- Admin reset: cancel sessions + reset TOS/lang, then show reminder only ---
  if (normalizedLower === "/start-over") {
    if (contact?.contactid) {
      await prisma.campaignsession.updateMany({
        where: { contactid: contact.contactid },
        data: { sessionstatus: "CANCELLED", checkpoint: null },
      });
      await prisma.contact.update({
        where: { contactid: contact.contactid },
        data: { tos_accepted: false, lang: null },
      });
      contact.tos_accepted = false;
      contact.lang = null;
    }

    const reminderText =
      "Session has been reset.\n\nPlease type any word to start.";
    return makeResult({
      replyText: reminderText,
      replyMessageObj: { type: "text", text: { body: reminderText } },
    });
  }

  // --- If TOS not accepted yet: ANY word starts onboarding (first-time or after reset) ---
  if (!contact?.tos_accepted) {
    const seq = await buildContentSequence(
      ["ONBOARD_WELCOME", "ONBOARD_LANGUAGE"],
      contact
    );
    if (seq.length) {
      const [first, ...rest] = seq;
      return makeResult({
        replyText: first.replyText,
        replyMessageObj: first.replyMessageObj,
        contentkeyid: first.contentkeyid,
        extraReplies: rest,
      });
    }
    throw new Error("Missing ONBOARD_WELCOME / ONBOARD_LANGUAGE content in DB");
  }

  // From here, TOS already accepted

  // "start" → go straight to main menu
  if (normalizedLower === "start") {
    const mainMenu = await loadContentByKey("ONBOARD_MAIN_MENU", contact);
    if (!mainMenu) {
      throw new Error("Missing ONBOARD_MAIN_MENU content in DB");
    }
    return makeResult({
      replyText: mainMenu.replyText,
      replyMessageObj: mainMenu.replyMessageObj,
      contentkeyid: mainMenu.contentkeyid,
    });
  }

  // MENU → list of active campaigns
  if (normalizedLower === "menu") {
    const menuMessage = await buildWhatsappMenuList();
    return makeResult({
      replyText: null,
      replyMessageObj: menuMessage,
    });
  }

  // JOIN → simple confirmation (placeholder for later flow)
  if (normalizedLower === "join") {
    const replyText =
      "You have successfully joined the campaign. Please wait for further updates.";
    return makeResult({
      replyText,
      replyMessageObj: { type: "text", text: { body: replyText } },
    });
  }

  // Keyword-driven campaign flow
  try {
    const flow = await processIncomingMessage({ from, text: normalizedOriginal });

    if (!flow || !flow.action) {
      const { main, extras } = await buildGlobalFallbackBundle(contact);
      return makeResult({
        replyText: main.replyText,
        replyMessageObj: main.replyMessageObj,
        contentkeyid: main.contentkeyid || null,
        extraReplies: extras,
      });
    }

    if (flow.action === "no_campaign") {
      const { main, extras } = await buildGlobalFallbackBundle(contact);
      return makeResult({
        replyText: main.replyText,
        replyMessageObj: main.replyMessageObj,
        contentkeyid: main.contentkeyid || null,
        extraReplies: extras,
      });
    }

    if (flow.action === "paused" || flow.action === "completed") {
      let replyText = flow.reply;
      if (!replyText) {
        const gf = await loadGlobalFallbackMessage(contact);
        replyText = gf.replyText;
      }
      return makeResult({
        replyText,
        replyMessageObj: { type: "text", text: { body: replyText } },
        sessionid: flow.sessionid || null,
        campaignid: flow.campaignid || null,
      });
    }

    if (flow.action === "expired") {
      const replyText = flow.reply;
      return makeResult({
        replyText,
        replyMessageObj: { type: "text", text: { body: replyText } },
        sessionid: flow.sessionid,
        campaignid: flow.campaignid,
      });
    }

    if (flow.action === "moved") {
      const sessionid = flow.sessionid || null;
      const campaignid = flow.campaignid || null;
      const contentkeyid = flow.nextKey || null;

      if (flow.nextKey) {
        const km = await prisma.keymapping.findUnique({
          where: { contentkeyid: flow.nextKey },
          include: { content: true },
        });

        const content = km?.content || null;
        if (content) {
          const ctx = {
            contact_name: contact?.name || contact?.phonenum || "there",
            phone: contact?.phonenum || "",
          };
          const built = buildWhatsappMessageFromContent(content, ctx);
          return makeResult({
            replyText: built.replyText,
            replyMessageObj: built.message,
            sessionid,
            campaignid,
            contentkeyid,
          });
        }

        // Flow says "moved" but there is no content for this key → config error
        throw new Error(
          `Missing content for flow.nextKey=${flow.nextKey} (campaignid=${campaignid || "null"
          })`
        );
      }

      // flow.action === "moved" but no nextKey → should not happen in correct config
      if (campaignid) {
        throw new Error(
          `Flow returned action="moved" with no nextKey for campaignid=${campaignid}`
        );
      }

      const { main, extras } = await buildGlobalFallbackBundle(contact);
      return makeResult({
        replyText: main.replyText,
        replyMessageObj: main.replyMessageObj,
        contentkeyid: main.contentkeyid || null,
        extraReplies: extras,
        sessionid,
        campaignid,
      });
    }

    const { main, extras } = await buildGlobalFallbackBundle(contact);
    return makeResult({
      replyText: main.replyText,
      replyMessageObj: main.replyMessageObj,
      contentkeyid: main.contentkeyid || null,
      extraReplies: extras,
    });
  } catch (err) {
    error("Error in processIncomingMessage:", err);
    const { main, extras } = await buildGlobalFallbackBundle(contact);
    return makeResult({
      replyText: main.replyText,
      replyMessageObj: main.replyMessageObj,
      contentkeyid: main.contentkeyid || null,
      extraReplies: extras,
    });
  }
}

/**
 * Handle onboarding + menu button replies
 */
async function handleButtonReply({ id, contact }) {
  // Normalize ID just in case
  const btnId = (id || "").trim();

  // LANG_EN / LANG_MS → store language
  if (btnId === "LANG_EN" || btnId === "LANG_MS") {
    const langCode = btnId === "LANG_EN" ? "en" : "ms";

    if (contact?.contactid) {
      await prisma.contact.update({
        where: { contactid: contact.contactid },
        data: { lang: langCode },
      });
      contact.lang = langCode;
    }

    // If TOS *not* accepted yet → show TOS + confirm
    if (!contact?.tos_accepted) {
      const seq = await buildContentSequence(
        ["ONBOARD_TOS", "ONBOARD_TOS_CONFIRM"],
        contact
      );
      if (seq.length) {
        const [first, ...rest] = seq;
        return makeResult({
          replyText: first.replyText,
          replyMessageObj: first.replyMessageObj,
          contentkeyid: first.contentkeyid,
          extraReplies: rest,
        });
      }

      throw new Error("Missing ONBOARD_TOS / ONBOARD_TOS_CONFIRM content in DB");
    }

    // TOS already accepted → go straight back to main menu (no more TOS)
    const mainMenu = await loadContentByKey("ONBOARD_MAIN_MENU", contact);
    if (!mainMenu) {
      throw new Error("Missing ONBOARD_MAIN_MENU content in DB");
    }

    return makeResult({
      replyText: mainMenu.replyText,
      replyMessageObj: mainMenu.replyMessageObj,
      contentkeyid: mainMenu.contentkeyid,
    });
  }

  // TOS_YES → Thank you + Main Menu
  if (btnId === "TOS_YES") {
    if (contact?.contactid) {
      await prisma.contact.update({
        where: { contactid: contact.contactid },
        data: { tos_accepted: true },
      });
      contact.tos_accepted = true;
    }

    const seq = await buildContentSequence(
      ["ONBOARD_THANK_YOU", "ONBOARD_MAIN_MENU"],
      contact
    );
    if (seq.length) {
      const [first, ...rest] = seq;
      return makeResult({
        replyText: first.replyText,
        replyMessageObj: first.replyMessageObj,
        contentkeyid: first.contentkeyid,
        extraReplies: rest,
      });
    }

    throw new Error("Missing ONBOARD_THANK_YOU / ONBOARD_MAIN_MENU content in DB");
  }

  // TOS_NO → Abort message (ONBOARD_ABORT)
  if (btnId === "TOS_NO") {
    const abortContent = await loadContentByKey("ONBOARD_ABORT", contact);
    if (abortContent) {
      return makeResult({
        replyText: abortContent.replyText,
        replyMessageObj: abortContent.replyMessageObj,
        contentkeyid: abortContent.contentkeyid,
      });
    }

    throw new Error("Missing ONBOARD_ABORT content in DB");
  }

  // JOIN_CAMPAIGN (from ONBOARD_MAIN_MENU)
  // → show JOIN_CAMPAIGN_INSTRUCTION text + campaign LIST
  if (btnId === "JOIN_CAMPAIGN") {
    const intro = await buildKeywordHintText(contact); // content row
    const menuMessage = await buildWhatsappMenuList();

    return makeResult({
      replyText: intro.replyText,
      replyMessageObj: intro.replyMessageObj,
      contentkeyid: intro.contentkeyid,
      extraReplies: [
        {
          replyText: null,
          replyMessageObj: menuMessage,
          contentkeyid: null,
        },
      ],
    });
  }

  // CHANGE_LANG → show language selection again (buttons)
  if (btnId === "CHANGE_LANG") {
    const langContent = await loadContentByKey("ONBOARD_LANGUAGE", contact);
    if (langContent) {
      return makeResult({
        replyText: langContent.replyText,
        replyMessageObj: langContent.replyMessageObj,
        contentkeyid: langContent.contentkeyid,
      });
    }
    throw new Error("Missing ONBOARD_LANGUAGE content in DB");
  }

  // GLOBAL_START_OVER → behave like "start" command (no TOS reset)
  if (btnId === "GLOBAL_START_OVER") {
    if (contact?.tos_accepted) {
      const mainMenu = await loadContentByKey("ONBOARD_MAIN_MENU", contact);
      if (!mainMenu) {
        throw new Error("Missing ONBOARD_MAIN_MENU content in DB");
      }
      return makeResult({
        replyText: mainMenu.replyText,
        replyMessageObj: mainMenu.replyMessageObj,
        contentkeyid: mainMenu.contentkeyid,
      });
    } else {
      const seq = await buildContentSequence(
        ["ONBOARD_WELCOME", "ONBOARD_LANGUAGE"],
        contact
      );
      if (seq.length) {
        const [first, ...rest] = seq;
        return makeResult({
          replyText: first.replyText,
          replyMessageObj: first.replyMessageObj,
          contentkeyid: first.contentkeyid,
          extraReplies: rest,
        });
      }
      throw new Error(
        "Missing ONBOARD_WELCOME / ONBOARD_LANGUAGE content in DB"
      );
    }
  }

  // From campaign detail card: JOIN button (for later real flow)
  if (btnId.startsWith("CAMPAIGN_JOIN_")) {
    const campaignIdStr = btnId.replace("CAMPAIGN_JOIN_", "");
    const campaignId = parseInt(campaignIdStr, 10);

    const replyText =
      "You have successfully joined this campaign. You will receive updates soon.";
    return makeResult({
      replyText,
      replyMessageObj: { type: "text", text: { body: replyText } },
      campaignid: Number.isNaN(campaignId) ? null : campaignId,
    });
  }

  // From campaign detail card: MENU button (list campaigns)
  if (btnId === "BACK_TO_MENU") {
    const menuMessage = await buildWhatsappMenuList();
    return makeResult({
      replyText: null,
      replyMessageObj: menuMessage,
    });
  }

  // Unknown button → GLOBAL fallback bundle
  const { main, extras } = await buildGlobalFallbackBundle(contact);
  return makeResult({
    replyText: main.replyText,
    replyMessageObj: main.replyMessageObj,
    contentkeyid: main.contentkeyid || null,
    extraReplies: extras,
  });
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
        const list = message.interactive.list_reply;
        const rowId = list?.id || "";

        let campaignId = null;
        if (rowId.startsWith("campaign_")) {
          const idStr = rowId.replace("campaign_", "");
          const parsed = parseInt(idStr, 10);
          campaignId = Number.isNaN(parsed) ? null : parsed;
        }

        if (!campaignId) {
          // Fallback for misconfigured menus
          const { main, extras } = await buildGlobalFallbackBundle(contact);
          mainReplyText = main.replyText;
          mainReplyMessageObj = main.replyMessageObj;
          mainContentKeyId = main.contentkeyid || null;
          extraReplies = extras;
        } else {
          // Load campaign with its entry key content
          const campaign = await prisma.campaign.findUnique({
            where: { campaignid: campaignId },
            include: {
              keymapping: {
                include: { content: true },
              },
            },
          });

          const entryContent = campaign?.keymapping?.content;

          if (
            !campaign ||
            campaign.status !== "Active" ||
            !campaign.contentkeyid ||
            !entryContent ||
            entryContent.isdeleted
          ) {
            // Not launchable → show global fallback
            const { main, extras } = await buildGlobalFallbackBundle(contact);
            mainReplyText = main.replyText;
            mainReplyMessageObj = main.replyMessageObj;
            mainContentKeyId = main.contentkeyid || null;
            extraReplies = extras;
          } else {
            // Start or reuse session for this campaign
            const session = await findOrCreateSession(
              contact.contactid,
              campaign
            );

            // Use the session checkpoint if it exists, otherwise fall back to campaign.contentkeyid
            const entryKey = session.checkpoint || campaign.contentkeyid;

            const km = await prisma.keymapping.findUnique({
              where: { contentkeyid: entryKey },
              include: { content: true },
            });

            if (!km?.content) {
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

              mainReplyText = built.replyText;
              mainReplyMessageObj = built.message;
              mainContentKeyId = entryKey;
              linkSessionId = session.campaignsessionid;
              linkCampaignId = campaign.campaignid;
              extraReplies = [];
            }
          }
        }
      } else if (
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
        } = await handleButtonReply({ id: btnId, contact });

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

/**
 * Admin helper: list campaigns with launchability info
 *   - launchable: Active + has keyword + has entry content (via campaign.contentkeyid)
 */
export async function debugCampaignConfig(req, res) {
  try {
    const campaigns = await prisma.campaign.findMany({
      select: {
        campaignid: true,
        campaignname: true,
        status: true,
        contentkeyid: true,
        keyword: {
          select: { value: true },
        },
        keymapping: {
          select: {
            content: {
              select: {
                contentid: true,
                title: true,
                status: true,
                isdeleted: true,
              },
            },
          },
        },
      },
      orderBy: { campaignid: "asc" },
    });

    const result = campaigns.map((c) => {
      const content = c.keymapping?.content || null;
      const issues = [];

      if (!c.keyword || c.keyword.length === 0) {
        issues.push("MISSING_KEYWORD");
      }
      if (!c.contentkeyid) {
        issues.push("MISSING_ENTRY_KEY");
      }
      if (!content) {
        issues.push("MISSING_ENTRY_CONTENT");
      }
      if (content?.isdeleted) {
        issues.push("ENTRY_CONTENT_DELETED");
      }

      const contentStatus = (content?.status || "").toLowerCase();
      if (contentStatus === "draft") {
        issues.push("ENTRY_CONTENT_DRAFT");
      }

      const isLaunchable =
        c.status === "Active" &&
        (!issues.includes("MISSING_KEYWORD")) &&
        (!issues.includes("MISSING_ENTRY_KEY")) &&
        (!issues.includes("MISSING_ENTRY_CONTENT")) &&
        (!issues.includes("ENTRY_CONTENT_DELETED"));

      return {
        id: c.campaignid,
        name: c.campaignname,
        status: c.status,
        contentkeyid: c.contentkeyid,
        keywords: c.keyword.map((k) => k.value),
        entryContent: content
          ? {
            contentid: content.contentid,
            title: content.title,
            status: content.status,
            isdeleted: content.isdeleted,
          }
          : null,
        launchable: isLaunchable,
        issues,
      };
    });

    const summary = {
      total: result.length,
      active: result.filter((c) => c.status === "Active").length,
      launchable: result.filter((c) => c.launchable).length,
      misconfigured: result.filter((c) => !c.launchable).length,
    };

    return res.status(200).json({ summary, campaigns: result });
  } catch (err) {
    error("debugCampaignConfig error:", err);
    return res
      .status(500)
      .json({ error: "Failed to load campaign config for debug" });
  }
}

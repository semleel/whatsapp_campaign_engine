// src/services/campaignEngine/commands.js

import prisma from "../../config/prismaClient.js";
import { findActiveSession, resetSessionForRestart } from "./session.js";

const START_PROMPT = "Type any campaign keyword to start, or use `/menu` to view campaigns.";
const WELCOME_MESSAGE =
  "Welcome to the campaign platform! We'll guide you through the onboarding before you jump into a campaign.";
const EXIT_HINT =
  "You may type `/exit` to exit or `/start` to restart the campaign at any time.";
const LETS_CONTINUE = "Let's continue from where we left off.";

const COMMAND_SECTION_HEADER = "Available commands:\n";
const COMMAND_DESCRIPTION_FALLBACK = "No description available.";
const MENU_SECTION_TITLE = "Available campaigns";
const MENU_BUTTON_LABEL = "View campaigns";
const CAMPAIGN_MENU_LIMIT = 10;

const FEEDBACK_OPTIONS = [
  { id: "good", title: "😊 Good" },
  { id: "neutral", title: "😑 Neutral" },
  { id: "bad", title: "😞 Bad" },
];

const DESTRUCTIVE_COMMANDS = new Set(["/reset", "/menu", "/feedback"]);

const getEnabledSystemCommands = () =>
  prisma.system_command.findMany({
    where: { is_enabled: true },
    orderBy: { command: "asc" },
  });

const formatCommandDescription = (cmd) =>
  `\`${cmd.command}\` - ${cmd.description?.trim() || COMMAND_DESCRIPTION_FALLBACK}`;

async function buildHelpMessage(contact) {
  const commands = await getEnabledSystemCommands();
  const lines = commands.map(formatCommandDescription);
  const payload = lines.length
    ? `${COMMAND_SECTION_HEADER}\n${lines.join("\n")}`
    : "No commands are enabled at the moment.";
  return {
    to: contact.phone_num,
    content: payload,
  };
}

export const buildStartMessage = (contact) => ({
  to: contact.phone_num,
  content: START_PROMPT,
});

const buildWelcomeMessage = (contact) => ({
  to: contact.phone_num,
  content: WELCOME_MESSAGE,
});

export const buildLetContinueMessage = (contact) => ({
  to: contact.phone_num,
  content: LETS_CONTINUE,
});

export const buildExitHintMessage = (contact) => ({
  to: contact.phone_num,
  content: EXIT_HINT,
});

const fetchActiveCampaigns = (now = new Date()) =>
  prisma.campaign.findMany({
    where: {
      status: { in: ["On Going", "Upcoming", "Active"] },
      is_active: { not: false },

      AND: [
        { OR: [{ is_deleted: false }, { is_deleted: null }] },
        { OR: [{ start_at: null }, { start_at: { lte: now } }] },
        { OR: [{ end_at: null }, { end_at: { gte: now } }] },
      ],
    },
    include: { campaign_keyword: true },
    orderBy: [{ updated_at: "desc" }],
    take: CAMPAIGN_MENU_LIMIT,
  });


const formatCampaignRow = (campaign) => {
  const keyword =
    campaign.campaign_keyword?.[0]?.value?.trim();
  const rawTitle = (campaign.campaign_name || "Campaign").trim();
  const safeTitle = rawTitle.slice(0, 24) || "Campaign";

  if (!keyword) {
    return {
      id: `campaign_${campaign.campaign_id}`,
      title: safeTitle,
      description: "Keyword not configured",
    };
  }

  return {
    id: keyword.toLowerCase(), // ? what engine receives
    title: safeTitle, // UI only
    description: null, // ? remove noise
  };
};

const buildCampaignMenuMessage = (campaigns, contact, prefix = "") => {
  if (!campaigns.length) {
    return {
      to: contact.phone_num,
      content: `${prefix}No active campaigns at the moment.`,
    };
  }

  const rows = campaigns.map(formatCampaignRow);
  const cleanPrefix = prefix ? `${prefix.trim()}\n\n` : "";
  const bodyText = `${cleanPrefix}Select a campaign from the list below.`;
  return {
    to: contact.phone_num,
    content: bodyText,
    waPayload: {
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: bodyText },
        action: {
          button: MENU_BUTTON_LABEL,
          sections: [
            {
              title: MENU_SECTION_TITLE,
              rows,
            },
          ],
        },
      },
    },
  };
};

export async function showMainMenu(contact, opts = {}) {
  const prefix =
    opts?.reason === "no_keyword_match" && opts.attemptedKeyword
      ? `I couldn't find a campaign for keyword "${opts.attemptedKeyword}".\n\n`
      : "";
  const campaigns = await fetchActiveCampaigns();
  return { outbound: [buildCampaignMenuMessage(campaigns, contact, prefix)] };
}

export async function showMainMenuWithUnknownKeyword(contact, attemptedKeyword) {
  return showMainMenu(contact, {
    reason: "no_keyword_match",
    attemptedKeyword,
  });
}

const buildFeedbackButtonMessage = (contact) => {
  const bodyText = "How was your experience?";
  const buttons = FEEDBACK_OPTIONS.map((opt) => {
    const truncatedTitle = opt.title.length > 20 ? opt.title.slice(0, 20) : opt.title;
    return {
      type: "reply",
      reply: {
        id: opt.id,
        title: truncatedTitle,
      },
    };
  });

  return {
    to: contact.phone_num,
    content: bodyText,
    waPayload: {
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: bodyText },
        action: {
          buttons,
        },
      },
    },
  };
};

// ✅ Create a lightweight ACTIVE session when user uses /feedback without an existing campaign.
async function getOrCreateFeedbackSession(contactId) {
  let session = await findActiveSession(contactId);
  if (session) return session;

  session = await prisma.campaign_session.create({
    data: {
      contact_id: contactId,
      campaign_id: null,
      session_status: "ACTIVE",
      created_at: new Date(),
      last_active_at: new Date(),
      last_payload_json: { feedback_mode: true, awaiting_feedback_rating: true },
      last_payload_type: "system_feedback",
    },
  });
  return session;
}

const cancelActiveSession = async (session) => {
  if (!session?.campaign_session_id) return;

  await prisma.campaign_session.update({
    where: { campaign_session_id: session.campaign_session_id },
    data: {
      session_status: "CANCELLED",
      current_step_id: null,
      last_payload_json: null,   // ✅ CLEAR FEEDBACK STATE
      last_payload_type: null,   // ✅ CLEAR SYSTEM MODE
      last_active_at: new Date(),
    },
  });
};

const expireActiveSession = async (session) => {
  if (!session?.campaign_session_id) return;

  await prisma.campaign_session.update({
    where: { campaign_session_id: session.campaign_session_id },
    data: {
      session_status: "EXPIRED",
      last_active_at: new Date(),
    },
  });
};

export async function handleFeedbackCommand(contact, text, session = null) {
  const parts = (text || "").trim().split(/\s+/).slice(1);
  const ratingRaw = (parts[0] || "").toLowerCase().trim();
  const allowed = new Set(["good", "neutral", "bad"]);
  const hasValidRating = allowed.has(ratingRaw);

  if (hasValidRating) {
    const targetSession =
      session || (await getOrCreateFeedbackSession(contact.contact_id));
    if (targetSession) {
      const existingPayload =
        targetSession.last_payload_json &&
          typeof targetSession.last_payload_json === "object"
          ? { ...targetSession.last_payload_json }
          : {};
      const updatedPayload = {
        ...existingPayload,
        feedback_rating: ratingRaw,
        awaiting_feedback_comment: true,
        awaiting_feedback_rating: false,
        feedback_mode: true,
      };

      await prisma.campaign_session.update({
        where: { campaign_session_id: targetSession.campaign_session_id },
        data: {
          last_payload_json: updatedPayload,
          last_active_at: new Date(),
          session_status: "ACTIVE",
        },
      });
    }

    return {
      outbound: [
        {
          to: contact.phone_num,
          content: "Please enter a comment, or type 'skip' to skip.",
        },
      ],
    };
  }

  return {
    outbound: [
      {
        to: contact.phone_num,
        content: "Please pick a feedback option below.",
        waPayload: buildFeedbackButtonMessage(contact).waPayload,
      },
    ],
  };
}

export async function handleSystemCommand({ contact, command, rawText, session }) {
  const normalized = command.toLowerCase();

  // ✅ /start must NOT cancel the session — it restarts the same campaign
  if (normalized === "/start") {
    if (!session?.campaign_id) {
      return {
        outbound: [
          {
            to: contact.phone_num,
            content: "You are not in a campaign. Type a campaign keyword to start.",
          },
        ],
        shouldResume: false,
        sessionEnded: false,
      };
    }

    const restartedSession = await resetSessionForRestart(session);
    return {
      outbound: [
        {
          to: contact.phone_num,
          content: "Restarting the campaign from the beginning.",
        },
      ],
      shouldResume: false,
      sessionEnded: false,
      restartedSession,
    };
  }

  const cmdRow = await prisma.system_command.findUnique({
    where: { command: normalized },
  });

  if (!cmdRow || !cmdRow.is_enabled) {
    return {
      outbound: [
        {
          to: contact.phone_num,
          content: "Unknown command. Type `/help` to see available commands.",
        },
      ],
      shouldResume: false,
      sessionEnded: false,
    };
  }

  if (normalized === "/exit") {
    await expireActiveSession(session);
  } else if (DESTRUCTIVE_COMMANDS.has(normalized)) {
    await cancelActiveSession(session);
  }

  switch (normalized) {
    case "/reset":
      return {
        outbound: [buildWelcomeMessage(contact), buildStartMessage(contact)],
        shouldResume: false,
        sessionEnded: true,
      };
    case "/exit":
      return {
        outbound: [
          {
            to: contact.phone_num,
            content: "You have exited the current campaign. Thanks!",
          },
          buildStartMessage(contact),
        ],
        shouldResume: false,
        sessionEnded: true,
      };
    case "/menu": {
      const menuPayload = await showMainMenu(contact);
      return {
        ...menuPayload,
        shouldResume: false,
        sessionEnded: true,
      };
    }
    case "/feedback": {
      const hasValue = (rawText || "").trim().split(/\s+/).length > 1;
      const targetSession = await getOrCreateFeedbackSession(contact.contact_id);

      if (hasValue) {
        return {
          ...(await handleFeedbackCommand(contact, rawText, targetSession)),
          shouldResume: false,
          sessionEnded: true,
        };
      }

      await prisma.campaign_session.update({
        where: { campaign_session_id: targetSession.campaign_session_id },
        data: {
          last_payload_json: {
            feedback_mode: true,
            awaiting_feedback_rating: true,
          },
          last_payload_type: "system_feedback",
          last_active_at: new Date(),
        },
      });

      return {
        outbound: [buildFeedbackButtonMessage(contact)],
        shouldResume: false,
        sessionEnded: true,
      };
    }
    case "/help":
      return {
        outbound: [await buildHelpMessage(contact)],
        shouldResume: !!session,
        sessionEnded: false,
      };
    default:
      return {
        outbound: [
          {
            to: contact.phone_num,
            content: "Unknown command. Type `/help` to see available commands.",
          },
        ],
        shouldResume: false,
        sessionEnded: false,
      };
  }
}

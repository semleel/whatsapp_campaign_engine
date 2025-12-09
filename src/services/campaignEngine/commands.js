import prisma from "../../config/prismaClient.js";

const START_PROMPT = "Type any campaign keyword to start.";
const WELCOME_MESSAGE =
  "Welcome to the campaign platform! We'll guide you through the onboarding before you jump into a campaign.";
const EXIT_HINT = "You may exit the campaign at any time by typing '/exit'.";
const LETS_CONTINUE = "Let's continue from where we left off.";

const COMMAND_SECTION_HEADER = "Available commands:";
const COMMAND_DESCRIPTION_FALLBACK = "No description available.";
const MENU_SECTION_TITLE = "Available campaigns";
const MENU_BUTTON_LABEL = "View campaigns";
const FEEDBACK_SECTION_TITLE = "Share your rating";
const FEEDBACK_BUTTON_LABEL = "Rate service";
const LANG_BUTTON_TEXT = "Select language";
const CAMPAIGN_MENU_LIMIT = 10;

const FEEDBACK_OPTIONS = [
  { rating: 1, label: "1 Star", description: "Poor experience" },
  { rating: 2, label: "2 Stars", description: "Could be better" },
  { rating: 3, label: "3 Stars", description: "Okay" },
  { rating: 4, label: "4 Stars", description: "Good" },
  { rating: 5, label: "5 Stars", description: "Excellent" },
];

const LANG_OPTIONS = [
  { code: "EN", title: "English" },
  { code: "MY", title: "Bahasa Malaysia" },
  { code: "CN", title: "Chinese (Mandarin)" },
];

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

const buildStartMessage = (contact) => ({
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
      status: { in: ["On Going", "Upcoming"] },
      is_active: true,
      OR: [{ is_deleted: false }, { is_deleted: null }],
      OR: [{ start_at: null }, { start_at: { lte: now } }],
      AND: [{ end_at: null }, { end_at: { gte: now } }],
    },
    include: { campaign_keyword: true },
    orderBy: [{ updated_at: "desc" }],
    take: CAMPAIGN_MENU_LIMIT,
  });

const formatCampaignRow = (campaign) => {
  const keywords = (campaign.campaign_keyword || [])
    .map((kw) => (kw?.value || "").trim())
    .filter(Boolean);
  const primaryKeyword = keywords[0] || null;
  const id = primaryKeyword ? primaryKeyword : `campaign_${campaign.campaign_id}`;
  const description = keywords.length
    ? `keywords: ${keywords.join(", ")}`
    : "Keyword not configured yet.";
  return {
    id,
    title: campaign.campaign_name || "Campaign",
    description,
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

const buildFeedbackListMessage = (contact) => {
  const rows = FEEDBACK_OPTIONS.map((option) => ({
    id: `/feedback ${option.rating}`,
    title: option.label,
    description: option.description,
  }));
  const bodyText = "Rate our service from 1 to 5 stars.";
  return {
    to: contact.phone_num,
    content: bodyText,
    waPayload: {
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: bodyText },
        action: {
          button: FEEDBACK_BUTTON_LABEL,
          sections: [
            {
              title: FEEDBACK_SECTION_TITLE,
              rows,
            },
          ],
        },
      },
    },
  };
};

const buildFeedbackCommentPrompt = (contact) => ({
  to: contact.phone_num,
  content:
    "Would you like to add an optional comment? Reply with `/feedback <rating> <comment>` (e.g. `/feedback 5 Great service!`).",
});

export async function startFeedbackFlow(contact) {
  return {
    outbound: [buildFeedbackListMessage(contact)],
  };
}

const buildLangButtonMessage = (contact) => ({
  to: contact.phone_num,
  content: "Change language for this session.",
  waPayload: {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: "Select a language." },
      action: {
        button: LANG_BUTTON_TEXT,
        buttons: LANG_OPTIONS.map((option) => ({
          type: "reply",
          reply: {
            id: `/lang ${option.code}`,
            title: option.title,
          },
        })),
      },
    },
  },
});

const cancelActiveSession = async (session) => {
  if (!session?.campaign_session_id) return;
  await prisma.campaign_session.update({
    where: { campaign_session_id: session.campaign_session_id },
    data: {
      session_status: "CANCELLED",
      current_step_id: null,
      last_active_at: new Date(),
    },
  });
};

export async function handleFeedbackCommand(contact, text) {
  const parts = (text || "").trim().split(/\s+/).slice(1);
  const ratingRaw = parts[0];
  const rating = ratingRaw ? Number(ratingRaw) : NaN;
  const hasValidRating = !Number.isNaN(rating) && rating >= 1 && rating <= 5;
  const comment = hasValidRating ? parts.slice(1).join(" ").trim() || null : null;

  if (hasValidRating) {
    const latestSession = await prisma.campaign_session.findFirst({
      where: { contact_id: contact.contact_id },
      orderBy: [{ last_active_at: "desc" }, { created_at: "desc" }],
      select: { campaign_session_id: true },
    });

    await prisma.service_feedback.create({
      data: {
        contact_id: contact.contact_id,
        campaign_session_id: latestSession?.campaign_session_id ?? null,
        rating,
        comment,
      },
    });

    const outbound = [
      {
        to: contact.phone_num,
        content: "Thanks for your feedback! We appreciate your rating.",
      },
    ];

    if (!comment) {
      outbound.push(buildFeedbackCommentPrompt(contact));
    }

    return { outbound };
  }

  return {
    outbound: [
      {
        to: contact.phone_num,
        content:
          "Please rate our service by picking 1 to 5 stars. Send /feedback <rating> <optional comment> or tap the rating list again.",
      },
    ],
  };
}

export async function handleSystemCommand({ contact, command, rawText, session }) {
  const normalized = command.toLowerCase();

  const cmdRow = await prisma.system_command.findUnique({
    where: { command: normalized },
  });

  if (!cmdRow || !cmdRow.is_enabled) {
    return {
      outbound: [
        {
          to: contact.phone_num,
          content: "Unknown command. Type /help to see available commands.",
        },
      ],
      shouldResume: false,
      sessionEnded: false,
    };
  }

  const shouldCancel = ["/exit", "/reset", "/start"].includes(normalized);
  if (shouldCancel) {
    await cancelActiveSession(session);
  }

  switch (normalized) {
    case "/start":
      return {
        outbound: [buildStartMessage(contact)],
        shouldResume: false,
        sessionEnded: true,
      };
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
        shouldResume: !!session,
        sessionEnded: false,
      };
    }
    case "/lang":
      return {
        outbound: [buildLangButtonMessage(contact)],
        shouldResume: !!session,
        sessionEnded: false,
      };
    case "/feedback": {
      const hasRating = (rawText || "").trim().split(/\s+/).length > 1;
      if (hasRating) {
        return {
          ...(await handleFeedbackCommand(contact, rawText)),
          shouldResume: !!session,
          sessionEnded: false,
        };
      }
      return {
        outbound: [buildFeedbackListMessage(contact)],
        shouldResume: !!session,
        sessionEnded: false,
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
            content: "Unknown command. Type /help to see available commands.",
          },
        ],
        shouldResume: false,
        sessionEnded: false,
      };
  }
}

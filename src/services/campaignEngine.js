import prisma from "../config/prismaClient.js";

/** @typedef {"text" | "button" | "list"} EngineMessageType */
/** @typedef {"message" | "choice" | "input" | "api" | "end"} ActionType */
/** @typedef {"none" | "choice" | "text" | "number" | "email"} ExpectedInput */

const SESSION_EXPIRY_MINUTES = 30; // global idle timeout

export async function handleIncomingMessage(args) {
  const { fromPhone, text, type, payload } = args;
  const contact = await findOrCreateContact(fromPhone);
  const normalizedText = (text || "").trim();

  if (normalizedText.startsWith("/")) {
    return handleSystemCommand({ contact, command: normalizedText });
  }

  const campaignFromKeyword = await findCampaignByKeyword(normalizedText);

  if (campaignFromKeyword) {
    await prisma.campaign_session.updateMany({
      where: {
        contact_id: contact.contact_id,
        campaign_id: campaignFromKeyword.campaign_id,
        session_status: "ACTIVE",
      },
      data: { session_status: "CANCELLED" },
    });

    const newSession = await createSessionForCampaign(
      contact.contact_id,
      campaignFromKeyword.campaign_id
    );
    return startCampaignAtFirstStep({ contact, session: newSession });
  }

  const session = await findActiveSession(contact.contact_id);

  if (session) {
    return continueCampaignSession({
      contact,
      session,
      incomingText: normalizedText,
      type,
      payload,
    });
  }

  return showMainMenuWithUnknownKeyword(contact, normalizedText);
}

async function findOrCreateContact(phone) {
  let contact = await prisma.contact.findUnique({
    where: { phone_num: phone },
  });

  if (!contact) {
    contact = await prisma.contact.create({
      data: { phone_num: phone },
    });
  }

  return contact;
}

async function findActiveSession(contactId) {
  const cutoff = new Date(Date.now() - SESSION_EXPIRY_MINUTES * 60_000);

  return prisma.campaign_session.findFirst({
    where: {
      contact_id: contactId,
      session_status: "ACTIVE",
      last_active_at: { gte: cutoff },
    },
    include: { campaign: true },
  });
}

export async function markExpiredSessions() {
  const cutoff = new Date(Date.now() - SESSION_EXPIRY_MINUTES * 60_000);
  await prisma.campaign_session.updateMany({
    where: {
      session_status: "ACTIVE",
      last_active_at: { lt: cutoff },
    },
    data: { session_status: "EXPIRED" },
  });
}

async function handleSystemCommand({ contact, command }) {
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
    };
  }

  if (["/exit", "/reset", "/start", "/menu", "/feedback"].includes(normalized)) {
    await prisma.campaign_session.updateMany({
      where: { contact_id: contact.contact_id, session_status: "ACTIVE" },
      data: { session_status: "CANCELLED" },
    });
  }

  switch (normalized) {
    case "/exit":
      return {
        outbound: [
          {
            to: contact.phone_num,
            content: "You have exited the current session. Thanks!",
          },
        ],
      };
    case "/reset":
    case "/start":
    case "/menu":
      return showMainMenu(contact);
    case "/help":
      return {
        outbound: [
          {
            to: contact.phone_num,
            content:
              "Available commands:\n/start - main menu\n/menu - list campaigns\n/exit - leave current flow\n/feedback - share your feedback",
          },
        ],
      };
    case "/feedback":
      return startFeedbackFlow(contact);
    default:
      return {
        outbound: [
          {
            to: contact.phone_num,
            content: "Unknown command. Type /help to see available commands.",
          },
        ],
      };
  }
}

async function findCampaignByKeyword(text) {
  if (!text) return null;
  const normalized = text.toLowerCase();

  return prisma.campaign.findFirst({
    where: {
      status: "Active",
      campaign_keyword: {
        some: { value: normalized },
      },
    },
  });
}

async function createSessionForCampaign(contactId, campaignId) {
  const session = await prisma.campaign_session.create({
    data: {
      contact_id: contactId,
      campaign_id: campaignId,
      session_status: "ACTIVE",
      created_at: new Date(),
      last_active_at: new Date(),
    },
  });
  return session;
}

async function startCampaignAtFirstStep({ contact, session }) {
  const firstStep = await prisma.campaign_step.findFirst({
    where: { campaign_id: session.campaign_id },
    orderBy: { step_number: "asc" },
  });
  console.log(
    "[ENGINE] Starting campaign",
    session.campaign_id,
    "at step",
    firstStep?.step_id,
    "number",
    firstStep?.step_number
  );

  if (!firstStep) {
    return {
      outbound: [
        {
          to: contact.phone_num,
          content: "This campaign is not configured yet.",
        },
      ],
    };
  }

  await prisma.campaign_session.update({
    where: { campaign_session_id: session.campaign_session_id },
    data: { current_step_id: firstStep.step_id, last_active_at: new Date() },
  });

  return runStepAndReturnMessages({ contact, session, step: firstStep });
}

async function continueCampaignSession({
  contact,
  session,
  incomingText,
  type,
  payload,
}) {
  const step = await prisma.campaign_step.findUnique({
    where: { step_id: session.current_step_id },
  });

  if (!step) {
    await prisma.campaign_session.update({
      where: { campaign_session_id: session.campaign_session_id },
      data: { session_status: "CANCELLED" },
    });
    return {
      outbound: [
        {
          to: contact.phone_num,
          content: "Sorry, this flow is misconfigured. Please try again later.",
        },
      ],
    };
  }

  const actionType = step.action_type;

  switch (actionType) {
    case "choice":
      return runChoiceStep({ contact, session, step, incomingText, type, payload });
    case "input":
      return runInputStep({ contact, session, step, incomingText });
    case "api": {
      const apiResult = await runApiStep({ contact, session, step });
      if (!apiResult.nextStepId) {
        await prisma.campaign_session.update({
          where: { campaign_session_id: session.campaign_session_id },
          data: { session_status: "COMPLETED", current_step_id: null, last_active_at: new Date() },
        });
        return { outbound: apiResult.outbound };
      }
      const nextStep = await prisma.campaign_step.findUnique({ where: { step_id: apiResult.nextStepId } });
      await prisma.campaign_session.update({
        where: { campaign_session_id: session.campaign_session_id },
        data: { current_step_id: apiResult.nextStepId, last_active_at: new Date() },
      });
      return runStepAndReturnMessages({ contact, session, step: nextStep });
    }
    case "message":
    default:
      return runStepAndReturnMessages({ contact, session, step });
  }
}

async function runChoiceStep({
  contact,
  session,
  step,
  incomingText,
  type,
  payload,
}) {
  const choices = await prisma.campaign_step_choice.findMany({
    where: { step_id: step.step_id },
    orderBy: { choice_id: "asc" },
  });

  let matchedChoice = null;

  if (type === "button" || type === "list") {
    const selectedCode = extractChoiceCodeFromPayload(payload);
    if (selectedCode) {
      matchedChoice = choices.find(
        (c) => (c.choice_code || "").toLowerCase() === selectedCode.toLowerCase()
      );
    }
  } else {
    const text = (incomingText || "").toLowerCase();
    matchedChoice =
      choices.find((c) => (c.choice_code || "").toLowerCase() === text) ||
      choices.find((c) => (c.label || "").trim().toLowerCase() === text);
  }

  const isValid = !!matchedChoice;

  await prisma.campaign_response.create({
    data: {
      session_id: session.campaign_session_id,
      campaign_id: session.campaign_id,
      step_id: step.step_id,
      choice_id: matchedChoice ? matchedChoice.choice_id : null,
      user_input_raw: incomingText,
      is_valid: isValid,
    },
  });

  if (!isValid) {
    const msg =
      step.error_message ||
      "Sorry, I didn't get that. Please choose one of the options below.";
    const rePrompt = buildChoiceMessage(contact, step.prompt_text, choices);
    await prisma.campaign_session.update({
      where: { campaign_session_id: session.campaign_session_id },
      data: { current_step_id: step.step_id, last_active_at: new Date() },
    });
    return {
      outbound: [
        { to: contact.phone_num, content: msg },
        rePrompt,
      ],
    };
  }

  const nextStepId = matchedChoice.next_step_id || step.next_step_id;
  // For choices we now only respect the specific button's next_step_id
  // (do not fall back to the step-level next_step_id).
  const targetStepId = matchedChoice.next_step_id;

  if (!targetStepId) {
    await prisma.campaign_session.update({
      where: { campaign_session_id: session.campaign_session_id },
      data: { session_status: "COMPLETED", current_step_id: null, last_active_at: new Date() },
    });
    return {
      outbound: [
        { to: contact.phone_num, content: "Thanks for participating!" },
      ],
    };
  }

  const nextStep = await prisma.campaign_step.findUnique({
    where: { step_id: targetStepId },
  });

  await prisma.campaign_session.update({
    where: { campaign_session_id: session.campaign_session_id },
    data: { current_step_id: targetStepId, last_active_at: new Date() },
  });

  return runStepAndReturnMessages({ contact, session, step: nextStep });
}

async function runInputStep({ contact, session, step, incomingText }) {
  const value = incomingText.trim();
  let isValid = true;

  switch (step.expected_input) {
    case "number":
      isValid = value !== "" && /^-?\d+(\.\d+)?$/.test(value);
      break;
    case "email":
      isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      break;
    case "text":
    default:
      isValid = value.length > 0;
      break;
  }

  await prisma.campaign_response.create({
    data: {
      session_id: session.campaign_session_id,
      campaign_id: session.campaign_id,
      step_id: step.step_id,
      choice_id: null,
      user_input_raw: value,
      is_valid: isValid,
    },
  });

  if (!isValid) {
    const errorText = step.error_message || "Invalid input. Please try again.";
    await prisma.campaign_session.update({
      where: { campaign_session_id: session.campaign_session_id },
      data: { current_step_id: step.step_id, last_active_at: new Date() },
    });
    return {
      outbound: [
        {
          to: contact.phone_num,
          content: errorText,
        },
      ],
    };
  }

  const nextStepId = step.next_step_id;

  if (!nextStepId || step.is_end_step) {
    await prisma.campaign_session.update({
      where: { campaign_session_id: session.campaign_session_id },
      data: { session_status: "COMPLETED", current_step_id: null, last_active_at: new Date() },
    });
    return {
      outbound: [
        {
          to: contact.phone_num,
          content: "Thanks for your response!",
        },
      ],
    };
  }

  const nextStep = await prisma.campaign_step.findUnique({
    where: { step_id: nextStepId },
  });

  await prisma.campaign_session.update({
    where: { campaign_session_id: session.campaign_session_id },
    data: { current_step_id: nextStepId, last_active_at: new Date() },
  });

  return runStepAndReturnMessages({ contact, session, step: nextStep });
}

async function runApiStep({ contact, session, step }) {
  if (!step.api_id) {
    return { outbound: [], nextStepId: step.next_step_id };
  }

  const api = await prisma.api.findUnique({
    where: { api_id: step.api_id },
  });
  const params = await prisma.api_parameter.findMany({
    where: { api_id: step.api_id },
  });

  if (!api) {
    return { outbound: [], nextStepId: step.next_step_id };
  }

  // TODO: build URL, headers, body from api + params + contact/campaign/session context
  // TODO: perform HTTP request (using fetch/axios) and log into api_log
  // For now, simulate success:
  const isSuccess = true;

  const targetStepId = isSuccess ? step.next_step_id : step.failure_step_id;
  const outbound = [];
  if (step.prompt_text || step.media_url) {
    const msg = { to: contact.phone_num, content: step.prompt_text || "" };
    const mediaPayload = buildMediaWaPayload(step);
    if (mediaPayload) {
      msg.waPayload = mediaPayload;
    }
    outbound.push(msg);
  }
  return { outbound, nextStepId: targetStepId };
}

async function runEndStep({ contact, session, step }) {
  await prisma.campaign_session.update({
    where: { campaign_session_id: session.campaign_session_id },
    data: { session_status: "COMPLETED", current_step_id: null, last_active_at: new Date() },
  });

  return {
    outbound: [
      { to: contact.phone_num, content: step.prompt_text || "Thank you!" },
    ],
  };
}

async function runStepAndReturnMessages({ contact, session, step }) {
  const outbound = [];
  let current = step;

  while (current) {
    const expectsInput =
      current.action_type === "choice" || current.action_type === "input";
    const isEnd = current.is_end_step || current.next_step_id == null;

    if (current.action_type === "api") {
      const apiResult = await runApiStep({ contact, session, step: current });
      outbound.push(...apiResult.outbound);

      if (!apiResult.nextStepId) {
        await prisma.campaign_session.update({
          where: { campaign_session_id: session.campaign_session_id },
          data: { session_status: "COMPLETED", current_step_id: null, last_active_at: new Date() },
        });
        return { outbound };
      }

      const nextStep = await prisma.campaign_step.findUnique({
        where: { step_id: apiResult.nextStepId },
      });
      if (!nextStep) {
        await prisma.campaign_session.update({
          where: { campaign_session_id: session.campaign_session_id },
          data: { session_status: "COMPLETED", current_step_id: null, last_active_at: new Date() },
        });
        return { outbound };
      }
      current = nextStep;
      continue;
    }

    if (expectsInput) {
      await prisma.campaign_session.update({
        where: { campaign_session_id: session.campaign_session_id },
        data: { current_step_id: current.step_id, last_active_at: new Date() },
      });

      if (current.action_type === "choice") {
        const choices = await prisma.campaign_step_choice.findMany({
          where: { step_id: current.step_id },
          orderBy: { choice_id: "asc" },
        });
        const listMessage = buildChoiceMessage(contact, current.prompt_text, choices);
        outbound.push(listMessage);
        return { outbound };
      }

      if (current.prompt_text || current.media_url) {
        const msg = {
          to: contact.phone_num,
          content: current.prompt_text || "",
        };
        const mediaPayload = buildMediaWaPayload(current);
        if (mediaPayload) {
          msg.waPayload = mediaPayload;
        }
        outbound.push(msg);
      }
      return { outbound };
    }

    if (current.prompt_text || current.media_url) {
      const msg = { to: contact.phone_num, content: current.prompt_text || "" };
      const mediaPayload = buildMediaWaPayload(current);
      if (mediaPayload) {
        msg.waPayload = mediaPayload;
      }
      outbound.push(msg);
    }

    if (isEnd) {
      await prisma.campaign_session.update({
        where: { campaign_session_id: session.campaign_session_id },
        data: { session_status: "COMPLETED", current_step_id: null, last_active_at: new Date() },
      });
      return { outbound };
    }

    const nextStep = await prisma.campaign_step.findUnique({
      where: { step_id: current.next_step_id },
    });
    if (!nextStep) {
      await prisma.campaign_session.update({
        where: { campaign_session_id: session.campaign_session_id },
        data: { session_status: "COMPLETED", current_step_id: null, last_active_at: new Date() },
      });
      return { outbound };
    }
    current = nextStep;
  }

  return { outbound };
}

// Build media WA payload from step.media_* fields
function buildMediaWaPayload(step) {
  if (!step || !step.media_url) return null;
  const type = step.media_type || "image";
  const caption = step.media_caption || step.prompt_text || undefined;

  if (type === "image") {
    return {
      type: "image",
      image: {
        link: step.media_url,
        ...(caption ? { caption } : {}),
      },
    };
  }
  if (type === "video") {
    return {
      type: "video",
      video: {
        link: step.media_url,
        ...(caption ? { caption } : {}),
      },
    };
  }
  if (type === "audio") {
    return {
      type: "audio",
      audio: {
        link: step.media_url,
      },
    };
  }
  if (type === "document") {
    return {
      type: "document",
      document: {
        link: step.media_url,
        ...(caption ? { caption } : {}),
      },
    };
  }
  return null;
}

function buildChoiceMessage(contact, prompt, choices) {
  const safePrompt = prompt || "Please choose an option:";
  const optionsText = choices
    .map((c, idx) => `${idx + 1}. ${c.label || c.choice_code || "Option"}`)
    .join("\n");
  const fallbackText = `${safePrompt}\n\n${optionsText}`;

  let waPayload = null;

  if (!choices || !choices.length) {
    // Just plain text if no choices configured
    return {
      to: contact.phone_num,
      content: fallbackText,
    };
  }

  if (choices.length <= 3) {
    // Use interactive BUTTONS (max 3)
    const buttons = choices.slice(0, 3).map((c, idx) => ({
      type: "reply",
      reply: {
        id: c.choice_code || String(c.choice_id || idx + 1),
        title: c.label || c.choice_code || `Option ${idx + 1}`,
      },
    }));

    waPayload = {
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: safePrompt },
        action: { buttons },
      },
    };
  } else {
    // Use interactive LIST when > 3 choices
    const rows = choices.map((c, idx) => ({
      id: c.choice_code || String(c.choice_id || idx + 1),
      title: c.label || c.choice_code || `Option ${idx + 1}`,
      description: c.description || "",
    }));

    waPayload = {
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: safePrompt },
        action: {
          button: "View options", // must be short, WhatsApp validates this
          sections: [
            {
              title: "Options",
              rows,
            },
          ],
        },
      },
    };
  }

  return {
    to: contact.phone_num,
    content: fallbackText,
    waPayload,
  };
}

function extractChoiceCodeFromPayload(payload) {
  try {
    const entry = payload?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const msg = value?.messages?.[0];
    if (!msg || msg.type !== "interactive") return null;
    const interactive = msg.interactive;
    if (interactive?.type === "button_reply") {
      return interactive.button_reply?.id || null;
    }
    if (interactive?.type === "list_reply") {
      return interactive.list_reply?.id || null;
    }
    return null;
  } catch (e) {
    console.error("[ENGINE] extractChoiceCodeFromPayload error", e);
    return null;
  }
}

async function showMainMenu(contact, opts = {}) {
  const prefix =
    opts?.reason === "no_keyword_match" && opts.attemptedKeyword
      ? `I couldn't find a campaign for keyword "${opts.attemptedKeyword}".\n\n`
      : "";
  const now = new Date();
  const campaigns = await prisma.campaign.findMany({
    where: {
      status: "Active",
      OR: [{ start_at: null }, { start_at: { lte: now } }],
      AND: [{ end_at: null }, { end_at: { gte: now } }],
    },
    include: { campaign_keyword: true },
  });

  if (!campaigns.length) {
    return {
      outbound: [
        {
          to: contact.phone_num,
          content: `${prefix}No active campaigns at the moment.`,
        },
      ],
    };
  }

  const lines = campaigns.map((c) => {
    const kws = c.campaign_keyword.map((k) => k.value).join(", ");
    return `- ${c.campaign_name} (keywords: ${kws})`;
  });

  return {
    outbound: [
      {
        to: contact.phone_num,
        content:
          `${prefix}Available campaigns:\n` +
          lines.join("\n") +
          "\n\nSend a keyword to join.",
      },
    ],
  };
}

async function showMainMenuWithUnknownKeyword(contact, attemptedKeyword) {
  const base = await showMainMenu(contact);
  if (!base?.outbound?.length) return base;
  const first = base.outbound[0] || {};
  const prefix = "That keyword didn't match any campaign.\n\n";
  const updated = { ...first, content: `${prefix}${first.content || ""}` };
  return { ...base, outbound: [updated, ...base.outbound.slice(1)] };
}

async function startFeedbackFlow(contact) {
  return {
    outbound: [
      {
        to: contact.phone_num,
        content: "Please rate our service from 1 to 5.",
      },
    ],
  };
}


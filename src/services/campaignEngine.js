// services/campaignEngine.js

import prisma from "../config/prismaClient.js";
import { dispatchEndpoint } from "./integrationService.js";
import { getStepContentForSession } from "./contentLocalizationService.js";

/** @typedef {"text" | "button" | "list" | "location"} EngineMessageType */
/** @typedef {"message" | "choice" | "input" | "api" | "end"} ActionType */
/** @typedef {"none" | "choice" | "text" | "number" | "email" | "location"} ExpectedInput */

const SESSION_EXPIRY_MINUTES = 30; // global idle timeout
const GENERIC_CONTENT_FALLBACK = {
  contentId: null,
  lang: "EN",
  title: "Fallback",
  body: "Sorry, this content is not available at the moment.",
  mediaUrl: null,
};
const SUPPORTED_LANG_CODES = ["EN", "MY", "CN"];

const ensureSessionStep = async (session, stepId) => {
  if (!session?.campaign_session_id || session.current_step_id === stepId) return;
  try {
    await prisma.campaign_session.update({
      where: { campaign_session_id: session.campaign_session_id },
      data: { current_step_id: stepId, last_active_at: new Date() },
    });
    session.current_step_id = stepId;
  } catch (err) {
    console.error("[ENGINE] Failed to sync current_step_id", err);
  }
};

const resolveStepContent = async (session, step) => {
  if (!step?.template_source_id) return null;
  if (!session?.campaign_session_id) return null;
  const localized = await getStepContentForSession(session.campaign_session_id);
  return localized || GENERIC_CONTENT_FALLBACK;
};

const isLanguageSelectorStep = (step, choices = []) => {
  if (!step) return false;
  const stepCode = (step.step_code || "").toString().toUpperCase();
  if (stepCode === "LANG_SELECTOR" && step.action_type === "choice") return true;

  if (!choices.length) return false;
  const codes = choices
    .map((c) => (c.choice_code || "").trim().toUpperCase())
    .filter(Boolean);
  if (!codes.length) return false;
  const allLangChoices = codes.every((c) => SUPPORTED_LANG_CODES.includes(c));
  return step.action_type === "choice" && allLangChoices;
};

const updateContactLanguageForSession = async (sessionId, langCode) => {
  const code = (langCode || "").trim();
  if (!sessionId || !code) return;
  try {
    await prisma.campaign_session.update({
      where: { campaign_session_id: sessionId },
      data: { contact: { update: { lang: code } } },
    });
  } catch (err) {
    console.error("[ENGINE] Failed to update contact language", { sessionId, langCode: code }, err);
  }
};

export async function handleIncomingMessage(args) {
  const { fromPhone, text, type, payload, enginePayload } = args;
  const contact = await findOrCreateContact(fromPhone);
  const keywordTextTypes = ["text", "button", "list"];
  const incomingTextValue = text || "";
  const normalizedText =
    keywordTextTypes.includes(type) && text
      ? text.trim()
      : "";

  if (normalizedText.startsWith("/")) {
    return handleSystemCommand({ contact, command: normalizedText, rawText: text || "" });
  }

  const campaignFromKeyword = await findCampaignByKeyword(normalizedText);

  if (campaignFromKeyword) {
    // If there is an active session for a different campaign, block switching
    const activeAny = await findActiveSession(contact.contact_id);
    if (
      activeAny &&
      activeAny.campaign_id &&
      activeAny.campaign_id !== campaignFromKeyword.campaign_id
    ) {
      return {
        outbound: [
          {
            to: contact.phone_num,
            content:
              `You have an active session for "${activeAny.campaign?.campaign_name ?? "another campaign"}". ` +
              "Please finish it or /exit.",
          },
        ],
      };
    }

    // If the keyword matches a campaign, try to reuse any existing session for that campaign
    const activeForCampaign = await findActiveSession(
      contact.contact_id,
      campaignFromKeyword.campaign_id
    );
    if (activeForCampaign) {
      return continueCampaignSession({
        contact,
        session: activeForCampaign,
        incomingText: incomingTextValue,
        type,
        payload,
        enginePayload,
      });
    }

    // Revive the latest expired session for this campaign instead of cancelling it
    const expiredForCampaign = await findExpiredSession(
      contact.contact_id,
      campaignFromKeyword.campaign_id
    );
    if (expiredForCampaign) {
      const revived = await prisma.campaign_session.update({
        where: { campaign_session_id: expiredForCampaign.campaign_session_id },
        data: { session_status: "ACTIVE", last_active_at: new Date() },
        include: { campaign: true },
      });

      const resumeNotice = {
        to: contact.phone_num,
        content: "Please Continu the camapaign ,Curently is your Last Checkpoint",
      };

      const result = await continueCampaignSession({
        contact,
        session: revived,
        incomingText: incomingTextValue,
        type,
        payload,
        enginePayload,
      });

      return { outbound: [resumeNotice, ...(result?.outbound || [])] };
    }

    // No existing session, start a new one
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
      incomingText: incomingTextValue,
      type,
      payload,
      enginePayload,
    });
  }

  // If there is an expired session, revive it and continue from last checkpoint.
  const expiredSession = await findExpiredSession(contact.contact_id);
  if (expiredSession) {
    const revived = await prisma.campaign_session.update({
      where: { campaign_session_id: expiredSession.campaign_session_id },
      data: { session_status: "ACTIVE", last_active_at: new Date() },
      include: { campaign: true },
    });

    const resumeNotice = {
      to: contact.phone_num,
      content: "Please Continu the camapaign ,Curently is your Last Checkpoint",
    };

    const result = await continueCampaignSession({
      contact,
      session: revived,
      incomingText: incomingTextValue,
      type,
      payload,
      enginePayload,
    });

    return { outbound: [resumeNotice, ...(result?.outbound || [])] };
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

async function findActiveSession(contactId, campaignId) {
  const cutoff = new Date(Date.now() - SESSION_EXPIRY_MINUTES * 60_000);

  return prisma.campaign_session.findFirst({
    where: {
      contact_id: contactId,
      ...(campaignId ? { campaign_id: campaignId } : {}),
      session_status: "ACTIVE",
      last_active_at: { gte: cutoff },
    },
    include: { campaign: true },
  });
}

async function findExpiredSession(contactId, campaignId) {
  return prisma.campaign_session.findFirst({
    where: {
      contact_id: contactId,
      ...(campaignId ? { campaign_id: campaignId } : {}),
      session_status: "EXPIRED",
    },
    orderBy: [{ last_active_at: "desc" }, { created_at: "desc" }],
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

async function handleSystemCommand({ contact, command, rawText }) {
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
      return handleFeedbackCommand(contact, rawText || command);
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
  const now = new Date();
  const allowedStatuses = ["Active", "On Going"];

  return prisma.campaign.findFirst({
    where: {
      // Keep only active/ongoing campaigns (respect status)
      status: { in: allowedStatuses },
      // allow null or true; explicitly false means off
      is_active: { not: false },
      OR: [{ is_deleted: false }, { is_deleted: null }],
      // Ensure we are within the schedule window if set
      AND: [
        { OR: [{ start_at: null }, { start_at: { lte: now } }] },
        { OR: [{ end_at: null }, { end_at: { gte: now } }] },
      ],
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
  enginePayload,
}) {
  let stepId = session.current_step_id;

  // If session has no current step (e.g., expired/resumed), try to recover last checkpoint
  if (!stepId) {
    const lastResponse = await prisma.campaign_response.findFirst({
      where: { session_id: session.campaign_session_id },
      orderBy: { created_at: "desc" },
      select: { step_id: true },
    });
    if (lastResponse?.step_id) {
      stepId = lastResponse.step_id;
    }
  }

  // If still none, jump to first step
  if (!stepId) {
    const firstStep = await prisma.campaign_step.findFirst({
      where: { campaign_id: session.campaign_id },
      orderBy: { step_number: "asc" },
    });
    if (!firstStep) {
      await prisma.campaign_session.update({
        where: { campaign_session_id: session.campaign_session_id },
        data: { session_status: "CANCELLED", current_step_id: null, last_active_at: new Date() },
      });
      return {
        outbound: [
          { to: contact.phone_num, content: "This campaign has no steps configured." },
        ],
      };
    }
    stepId = firstStep.step_id;
  }

  // Ensure DB reflects the recovered step
  if (stepId !== session.current_step_id) {
    await prisma.campaign_session.update({
      where: { campaign_session_id: session.campaign_session_id },
      data: { current_step_id: stepId, last_active_at: new Date() },
    });
  }

  const step = await prisma.campaign_step.findUnique({
    where: { step_id: stepId },
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
      return runInputStep({ contact, session, step, incomingText, type, payload });
    case "api": {
      const contentContext = step.template_source_id
        ? await resolveStepContent(session, step)
        : null;
      const apiResult = await runApiStep({
        contact,
        session,
        step,
        lastAnswer: null,
        contentContext,
      });
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
  await ensureSessionStep(session, step.step_id);
  const contentContext = await resolveStepContent(session, step);
  const promptText = contentContext?.body ?? step.prompt_text;

  const choices = await prisma.campaign_step_choice.findMany({
    where: { step_id: step.step_id },
    orderBy: { choice_id: "asc" },
  });

  let matchedChoice = null;
  let selectedCode = null;

  if (type === "button" || type === "list") {
    selectedCode = extractChoiceCodeFromPayload(payload);
    if (selectedCode) {
      const lc = selectedCode.toLowerCase();
      matchedChoice =
        choices.find((c) => (c.choice_code || "").toLowerCase() === lc) ||
        choices.find((c) => (c.label || "").trim().toLowerCase() === lc) ||
        choices.find((c) => String(c.choice_id || "").toLowerCase() === lc);
      if (!matchedChoice) {
        console.warn("[ENGINE] No matching choice for interactive reply", {
          selectedCode: lc,
          available: choices.map((c) => ({
            id: c.choice_id,
            code: c.choice_code,
            label: c.label,
            next_step_id: c.next_step_id,
          })),
        });
      }
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

  console.log("[ENGINE] Choice reply processed", {
    step_id: step.step_id,
    selectedCode,
    incomingText,
    matchedChoice: matchedChoice
      ? {
          id: matchedChoice.choice_id,
          code: matchedChoice.choice_code,
          label: matchedChoice.label,
          next_step_id: matchedChoice.next_step_id,
        }
      : null,
  });

  if (!isValid) {
    const msg =
      step.error_message ||
      "Sorry, I didn't get that. Please choose one of the options below.";
    const rePrompt = withStepContext({
      base: buildChoiceMessage(contact, promptText, choices),
      step,
      session,
      contact,
      contentContext,
    });
    await prisma.campaign_session.update({
      where: { campaign_session_id: session.campaign_session_id },
      data: { current_step_id: step.step_id, last_active_at: new Date() },
    });
    return {
      outbound: [
        withStepContext({
          base: { to: contact.phone_num, content: msg },
          step,
          session,
          contact,
          contentContext,
        }),
        rePrompt,
      ],
    };
  }

  const isLanguageSelector = isLanguageSelectorStep(step, choices);

  if (isLanguageSelector && matchedChoice) {
    const langCodeRaw = matchedChoice.choice_code || "";
    const langCode = langCodeRaw.trim().toUpperCase();
    const effectiveLangCode = langCode
      ? SUPPORTED_LANG_CODES.includes(langCode)
        ? langCode
        : "EN"
      : null;

    if (effectiveLangCode) {
      await updateContactLanguageForSession(session.campaign_session_id, effectiveLangCode);
      contact.lang = effectiveLangCode;
    }
  }

  // For choices we only respect the specific button's next_step_id
  const targetStepId = matchedChoice.next_step_id;

  console.log("[ENGINE] Choice routing", {
    step_id: step.step_id,
    targetStepId,
    is_end: step.is_end_step,
  });

  if (!targetStepId) {
    await prisma.campaign_session.update({
      where: { campaign_session_id: session.campaign_session_id },
      data: { session_status: "COMPLETED", current_step_id: null, last_active_at: new Date() },
    });
    return {
      outbound: [
        withStepContext({
          base: { to: contact.phone_num, content: "Thanks for participating!" },
          step,
          session,
          contact,
        }),
      ],
    };
  }

  const nextStep = await prisma.campaign_step.findUnique({
    where: { step_id: targetStepId },
  });

  if (!nextStep) {
    console.error("[ENGINE] Target step not found for choice", {
      targetStepId,
      step_id: step.step_id,
      campaign_id: step.campaign_id,
    });
  }

  await prisma.campaign_session.update({
    where: { campaign_session_id: session.campaign_session_id },
    data: { current_step_id: targetStepId, last_active_at: new Date() },
  });

  return runStepAndReturnMessages({ contact, session, step: nextStep });
}

async function runInputStep({ contact, session, step, incomingText, type, payload }) {
  let value = (incomingText || "").trim();
  let isValid = true;

  switch (step.expected_input) {
    case "number":
      isValid = value !== "" && /^-?\d+(\.\d+)?$/.test(value);
      break;
    case "email":
      isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      break;
    case "location": {
      const loc = extractLocationFromPayload(payload);
      if (loc) {
        // Store as JSON so integrationService can parse and use it
        value = JSON.stringify({
          latitude: loc.latitude,
          longitude: loc.longitude,
        });
        isValid = true;
      } else {
        isValid = false;
      }
      break;
    }
    case "text":
    default:
      // Require non-empty and not purely numeric for "text" input
      isValid = value.length > 0 && !/^\d+$/.test(value);
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
    const errorText =
      step.error_message ||
      "Invalid input. Please try again.";
    await prisma.campaign_session.update({
      where: { campaign_session_id: session.campaign_session_id },
      data: { current_step_id: step.step_id, last_active_at: new Date() },
    });
    return {
      outbound: [
        withStepContext({
          base: {
            to: contact.phone_num,
            content: errorText,
          },
          step,
          session,
          contact,
        }),
      ],
    };
  }

  const nextStepId = step.next_step_id;

  if (!nextStepId || step.is_end_step) {
    await prisma.campaign_session.update({
      where: { campaign_session_id: session.campaign_session_id },
      data: {
        session_status: "COMPLETED",
        current_step_id: null,
        last_active_at: new Date(),
      },
    });
    return {
      outbound: [
        withStepContext({
          base: {
            to: contact.phone_num,
            content: "Thanks for your response!",
          },
          step,
          session,
          contact,
        }),
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

async function runApiStep({ contact, session, step, lastAnswer, contentContext = null }) {
  await ensureSessionStep(session, step.step_id);
  if (!step.api_id) {
    console.warn("[flowEngine] API step has no api_id", { stepId: step.step_id });
    return { outbound: [], nextStepId: step.next_step_id };
  }

  // If lastAnswer is not provided, look up the last valid response in this session
  let effectiveLastAnswer = lastAnswer || null;
  if (!effectiveLastAnswer && session?.campaign_session_id) {
    effectiveLastAnswer = await prisma.campaign_response.findFirst({
      where: {
        session_id: session.campaign_session_id,
        is_valid: true,
      },
      orderBy: { created_at: "desc" },
    });
  }

  const vars = {
    contact,
    campaign: session?.campaign || { campaign_id: session.campaign_id },
    session,
    lastAnswer: effectiveLastAnswer,
  };

  let result = null;
  let ok = false;
  let status = 500;
  let apiPayload;
  let apiError;

  try {
    // Note: we tag the source so integrationService can log into api_log
    result = await dispatchEndpoint(step.api_id, vars, {
      source: "campaign_step",
    });
    ok = !!result?.ok;
    status = result?.status ?? status;
    apiPayload = result?.payload;
  } catch (err) {
    apiError = err?.message || "API call failed";
    console.error("[flowEngine] API step failed", {
      stepId: step.step_id,
      apiId: step.api_id,
      error: apiError,
    });
  }

  const outbound = [];

  // Decide the MAIN message text:
  // 1) use payload.formattedText if provided by integration
  // 2) else use localized template body (if available)
  // 3) else use step.prompt_text (e.g. admin override)
  // 4) else simple generic fallback
  const formattedText =
    (apiPayload && typeof apiPayload.formattedText === "string"
      ? apiPayload.formattedText
      : null) || null;

  const baseText =
    formattedText ||
    (contentContext?.body ?? step.prompt_text) ||
    "Done.";

  const mediaPayload = buildMediaWaPayload({
    ...step,
    prompt_text: contentContext?.body ?? step.prompt_text,
    media_url: contentContext?.mediaUrl ?? step.media_url,
  });

  if (baseText || mediaPayload) {
    const msg = withStepContext({
      base: {
        to: contact.phone_num,
        content: baseText || "",
        ...(mediaPayload ? { waPayload: mediaPayload } : {}),
      },
      step,
      session,
      contact,
      contentContext,
    });
    outbound.push(msg);
  }

  // Decide next step:
  // - on success: next_step_id
  // - on failure: failure_step_id if set, otherwise null (end)
  const hasFailureStep = !!step.failure_step_id;
  const targetStepId = ok
    ? step.next_step_id
    : hasFailureStep
      ? step.failure_step_id
      : null;

  // If no branch AND the call failed AND we have an error_message,
  // send that as a follow-up clarification.
  if (!ok && !hasFailureStep && step.error_message) {
    outbound.push({
      to: contact.phone_num,
      content: step.error_message,
    });
  }

  return {
    outbound,
    nextStepId: targetStepId,
    integration: {
      lastApi: {
        apiId: step.api_id,
        ok,
        status,
        ...(apiPayload !== undefined ? { payload: apiPayload } : {}),
        ...(apiError ? { error: apiError } : {}),
      },
    },
  };
}

async function runEndStep({ contact, session, step }) {
  await ensureSessionStep(session, step.step_id);
  const contentContext =
    step.template_source_id ? await resolveStepContent(session, step) : null;
  const resolvedPrompt = contentContext?.body ?? step.prompt_text ?? "Thank you!";
  const mediaPayload = buildMediaWaPayload({
    ...step,
    prompt_text: resolvedPrompt,
    media_url: contentContext?.mediaUrl ?? step.media_url,
  });
  await prisma.campaign_session.update({
    where: { campaign_session_id: session.campaign_session_id },
    data: { session_status: "COMPLETED", current_step_id: null, last_active_at: new Date() },
  });

  return {
    outbound: [
      withStepContext({
        base: {
          to: contact.phone_num,
          content: resolvedPrompt || "Thank you!",
          ...(mediaPayload ? { waPayload: mediaPayload } : {}),
        },
        step,
        session,
        contact,
        contentContext,
      }),
    ],
  };
}

async function runStepAndReturnMessages({ contact, session, step }) {
  const outbound = [];
  let current = step;

  while (current) {
    await ensureSessionStep(session, current.step_id);
    const contentContext =
      current.template_source_id ? await resolveStepContent(session, current) : null;
    const resolvedPrompt = contentContext?.body ?? current.prompt_text ?? "";
    const resolvedMediaUrl = contentContext?.mediaUrl ?? current.media_url ?? null;

    const expectsInput =
      current.action_type === "choice" || current.action_type === "input";
    const isEnd = current.is_end_step || current.next_step_id == null;

    if (current.action_type === "api") {
      const apiResult = await runApiStep({
        contact,
        session,
        step: current,
        lastAnswer: null,
        contentContext,
      });
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
        const listMessage = buildChoiceMessage(contact, resolvedPrompt, choices);
        outbound.push(
          withStepContext({
            base: listMessage,
            step: current,
            session,
            contact,
            contentContext,
          })
        );
        return { outbound };
      }

      if (resolvedPrompt || resolvedMediaUrl) {
        const mediaPayload = buildMediaWaPayload({
          ...current,
          prompt_text: resolvedPrompt,
          media_url: resolvedMediaUrl,
        });
        outbound.push(
          withStepContext({
            base: {
              to: contact.phone_num,
              content: resolvedPrompt || "",
              ...(mediaPayload ? { waPayload: mediaPayload } : {}),
            },
            step: current,
            session,
            contact,
            contentContext,
          })
        );
      }
      return { outbound };
    }

    if (resolvedPrompt || resolvedMediaUrl) {
      const mediaPayload = buildMediaWaPayload({
        ...current,
        prompt_text: resolvedPrompt,
        media_url: resolvedMediaUrl,
      });
      console.log("[ENGINE] Sending step", {
        step_id: current.step_id,
        campaign_id: current.campaign_id,
        action: current.action_type,
        has_text: !!(resolvedPrompt && resolvedPrompt.trim()),
        media_url: resolvedMediaUrl || null,
        media_payload_type: mediaPayload?.type || null,
      });
      outbound.push(
        withStepContext({
          base: {
            to: contact.phone_num,
            content: resolvedPrompt || "",
            ...(mediaPayload ? { waPayload: mediaPayload } : {}),
          },
          step: current,
          session,
          contact,
          contentContext,
        })
      );
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

// Infer media type from URL when media_type is not set
function inferMediaType(url, fallback = "image") {
  if (!url) return fallback;
  const lower = url.toLowerCase();
  if (/\.(mp4|mov|avi|mkv|webm)$/.test(lower)) return "video";
  if (/\.(mp3|wav|m4a|aac|ogg)$/.test(lower)) return "audio";
  if (/\.(pdf|docx?|xls|xlsx|ppt|pptx)$/.test(lower)) return "document";
  if (/\.(jpe?g|png|gif|webp|bmp|tiff?)$/.test(lower)) return "image";
  return fallback;
}

// Build media WA payload from step.media_* fields
function buildMediaWaPayload(step) {
  if (!step || !step.media_url) return null;
  const resolvedType = inferMediaType(step.media_url, step.media_type || "image");
  const caption = step.media_caption || step.prompt_text || undefined;

  if (resolvedType === "image") {
    return {
      type: "image",
      image: {
        link: step.media_url,
        ...(caption ? { caption } : {}),
      },
    };
  }
  if (resolvedType === "video") {
    return {
      type: "video",
      video: {
        link: step.media_url,
        ...(caption ? { caption } : {}),
      },
    };
  }
  if (resolvedType === "audio") {
    return {
      type: "audio",
      audio: {
        link: step.media_url,
      },
    };
  }
  if (resolvedType === "document") {
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

function deriveContentType(waPayload, step) {
  if (waPayload?.type) return waPayload.type;
  if (step?.media_url) {
    return inferMediaType(step.media_url, step.media_type || "image");
  }
  return "text";
}

function withStepContext({ base = {}, step, session, contact, contentContext = null }) {
  const waPayload = base.waPayload ?? (step?.media_url ? buildMediaWaPayload(step) : null);
  const contentValue = base.content ?? step?.prompt_text ?? "";

  return {
    ...base,
    to: base.to ?? contact?.phone_num,
    content: contentValue,
    waPayload: waPayload || undefined,
    contentType: base.contentType ?? deriveContentType(waPayload, step),
    stepContext: {
      campaign_id: session?.campaign_id ?? null,
      campaign_session_id: session?.campaign_session_id ?? null,
      contact_id: contact?.contact_id ?? null,
      step_id: step?.step_id ?? null,
      template_source_id: step?.template_source_id ?? null,
      content_id: contentContext?.contentId ?? null,
      content_lang: contentContext?.lang ?? null,
    },
  };
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

function extractLocationFromPayload(payload) {
  try {
    const entry = payload?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const msg = value?.messages?.[0];
    if (!msg || msg.type !== "location" || !msg.location) return null;
    const { latitude, longitude } = msg.location;
    if (typeof latitude !== "number" || typeof longitude !== "number") return null;
    return { latitude, longitude };
  } catch (e) {
    console.error("[ENGINE] extractLocationFromPayload error", e);
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
      status: { in: ["On Going", "Upcoming"] },
      is_active: true,
      OR: [{ is_deleted: false }, { is_deleted: null }],
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

async function handleFeedbackCommand(contact, text) {
  const parts = (text || "").trim().split(/\s+/).slice(1); // drop /feedback
  const ratingRaw = parts[0];
  const rating = ratingRaw ? Number(ratingRaw) : NaN;
  const hasValidRating = !Number.isNaN(rating) && rating >= 1 && rating <= 5;
  const comment = hasValidRating ? parts.slice(1).join(" ").trim() || null : null;

  if (hasValidRating) {
    // Attach to the most recent session if available
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

    return {
      outbound: [
        {
          to: contact.phone_num,
          content: "Thanks for your feedback! We appreciate your rating.",
        },
      ],
    };
  }

  return {
    outbound: [
      {
        to: contact.phone_num,
        content:
          "To share feedback, reply with /feedback <1-5> <optional comment>. Example: /feedback 5 Great service!",
      },
    ],
  };
}


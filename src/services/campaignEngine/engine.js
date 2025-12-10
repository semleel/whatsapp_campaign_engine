// src/services/campaignEngine/engine.js

import prisma from "../../config/prismaClient.js";
import {
  createSessionForCampaign,
  findActiveSession,
  findExpiredSession,
  findOrCreateContact,
  resolveStepContent,
} from "./session.js";
import {
  showMainMenuWithUnknownKeyword,
  handleSystemCommand,
  buildLetContinueMessage,
  buildExitHintMessage,
} from "./commands.js";
import { extractChoiceCodeFromPayload } from "./helpers.js";
import { runChoiceStep, runInputStep, runApiStep, runStepAndReturnMessages } from "./steps.js";

export async function handleIncomingMessage(args) {
  const { fromPhone, text, type, payload, enginePayload } = args;
  const contact = await findOrCreateContact(fromPhone);

  const keywordTextTypes = ["text", "button", "list"];
  const incomingTextValue = text || "";
  const trimmedIncomingText = text?.trim() ?? "";
  const interactiveReplyId = (extractChoiceCodeFromPayload(payload) || "").trim();

  const normalizedCommandText = trimmedIncomingText || interactiveReplyId;
  const normalizedCommandLower = normalizedCommandText.toLowerCase();

  const normalizedKeywordText =
    keywordTextTypes.includes(type) && (trimmedIncomingText || interactiveReplyId)
      ? trimmedIncomingText || interactiveReplyId
      : "";
  const normalizedKeywordLower = normalizedKeywordText.toLowerCase();
  let activeSession = await findActiveSession(contact.contact_id);

  if (normalizedCommandLower.startsWith("/")) {
    const cmd = normalizedCommandLower.split(/\s+/)[0] || normalizedCommandLower;
    const rawCommandText = normalizedCommandText || cmd;
    const commandResult = await handleSystemCommand({
      contact,
      command: cmd,
      rawText: rawCommandText,
      session: activeSession,
    });
    if (commandResult.sessionEnded) {
      activeSession = null;
    }
    let outbound = [...(commandResult.outbound || [])];
    if (commandResult.shouldResume && activeSession) {
      const continuation = await continueAfterCommand(contact, activeSession);
      outbound.push(...continuation);
    }
    return { outbound };
  }

  let keywordOnly = "";
  let keywordArgs = "";
  let campaignFromKeyword = null;

  if (normalizedKeywordLower) {
    const selectionCampaignId = parseCampaignSelectionToken(normalizedKeywordLower);
    if (selectionCampaignId) {
      campaignFromKeyword = await findCampaignById(selectionCampaignId);
      if (campaignFromKeyword) {
        keywordOnly = normalizedKeywordLower;
        keywordArgs = "";
      }
    }

    const fullMatch = campaignFromKeyword
      ? null
      : await findCampaignByKeyword(normalizedKeywordLower);
    if (fullMatch) {
      campaignFromKeyword = fullMatch;
      keywordOnly = normalizedKeywordLower;
      keywordArgs = "";
    }

    if (!campaignFromKeyword) {
      const parts = normalizedKeywordLower.split(/\s+/);
      const base = (parts[0] || "").trim();
      const rest = parts.slice(1).join(" ").trim();
      if (base) {
        const c = await findCampaignByKeyword(base);
        if (c) {
          campaignFromKeyword = c;
          keywordOnly = base;
          keywordArgs = rest;
        }
      }
    }
  }

  if (campaignFromKeyword) {
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

    const keywordMeta =
      keywordOnly
        ? {
            rawText: normalizedKeywordText,
            keyword: keywordOnly,
            args: keywordArgs || null,
          }
        : null;

    const newSession = await createSessionForCampaign(
      contact.contact_id,
      campaignFromKeyword.campaign_id,
      keywordMeta
    );
    return startCampaignAtFirstStep({ contact, session: newSession });
  }

  const session = activeSession;

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

  return showMainMenuWithUnknownKeyword(contact, trimmedIncomingText);
}

async function findCampaignByKeyword(text) {
  if (!text) return null;
  const normalized = text.toLowerCase();
  const now = new Date();
  const allowedStatuses = ["Active", "On Going"];

  return prisma.campaign.findFirst({
    where: {
      status: { in: allowedStatuses },
      is_active: { not: false },
      OR: [{ is_deleted: false }, { is_deleted: null }],
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

function parseCampaignSelectionToken(value) {
  if (!value) return null;
  const match = value.match(/^campaign_(\d+)$/i);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isNaN(id) ? null : id;
}

async function findCampaignById(campaignId) {
  if (!campaignId) return null;
  const now = new Date();
  return prisma.campaign.findFirst({
    where: {
      campaign_id: campaignId,
      status: { in: ["On Going", "Upcoming"] },
      is_active: true,
      OR: [{ is_deleted: false }, { is_deleted: null }],
      OR: [{ start_at: null }, { start_at: { lte: now } }],
      AND: [{ end_at: null }, { end_at: { gte: now } }],
    },
  });
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

  try {
    if (
      firstStep.action_type === "input" &&
      session.last_payload_type === "keyword_start" &&
      session.last_payload_json
    ) {
      let keywordMeta = session.last_payload_json;

      if (typeof keywordMeta === "string") {
        try {
          keywordMeta = JSON.parse(keywordMeta);
        } catch {
          keywordMeta = null;
        }
      }

      const keywordArgs =
        keywordMeta && typeof keywordMeta === "object"
          ? (keywordMeta.args || "").toString()
          : "";

      if (keywordArgs && keywordArgs.trim().length > 0) {
        console.log(
          "[ENGINE] Auto-answering first input step from keyword args",
          {
            campaign_id: session.campaign_id,
            session_id: session.campaign_session_id,
            step_id: firstStep.step_id,
            args: keywordArgs,
          }
        );

        return runInputStep({
          contact,
          session,
          step: firstStep,
          incomingText: keywordArgs,
          type: "text",
          payload: null,
        });
      }
    }
  } catch (e) {
    console.warn(
      "[ENGINE] Failed to auto-answer first step from keyword args:",
      e?.message || e
    );
  }

  await prisma.campaign_session.update({
    where: { campaign_session_id: session.campaign_session_id },
    data: { current_step_id: firstStep.step_id, last_active_at: new Date() },
  });

  const result = await runStepAndReturnMessages({ contact, session, step: firstStep });
  result.outbound = result.outbound || [];
  result.outbound.push(buildExitHintMessage(contact));
  return result;
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

async function continueAfterCommand(contact, session) {
  const repeated = await repeatLastStep({ contact, session });
  if (!repeated.length) return [];
  return [buildLetContinueMessage(contact), ...repeated];
}

async function repeatLastStep({ contact, session }) {
  let stepId = session.current_step_id;

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

  if (!stepId) {
    return [];
  }

  const step = await prisma.campaign_step.findUnique({
    where: { step_id: stepId },
  });
  if (!step) {
    return [];
  }

  const result = await runStepAndReturnMessages({ contact, session, step });
  return result.outbound || [];
}

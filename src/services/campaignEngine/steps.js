import prisma from "../../config/prismaClient.js";
import { dispatchEndpoint } from "../integrationService.js";
import { ensureSessionStep, resolveStepContent, isLanguageSelectorStep, updateContactLanguageForSession } from "./session.js";
import { SUPPORTED_LANG_CODES } from "./constants.js";
import {
  buildChoiceMessage,
  withStepContext,
  buildMediaWaPayload,
  extractChoiceCodeFromPayload,
  extractLocationFromPayload,
} from "./helpers.js";

export async function runChoiceStep({
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

export async function runInputStep({ contact, session, step, incomingText, type, payload }) {
  let value = (incomingText || "").trim();
  let isValid = true;

  const locFromPayload = extractLocationFromPayload(payload);
  if (locFromPayload) {
    value = JSON.stringify({
      latitude: locFromPayload.latitude,
      longitude: locFromPayload.longitude,
    });
  }

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
    const errorText = step.error_message || "Invalid input. Please try again.";
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

export async function runApiStep({ contact, session, step, lastAnswer, contentContext = null }) {
  await ensureSessionStep(session, step.step_id);
  if (!step.api_id) {
    console.warn("[flowEngine] API step has no api_id", { stepId: step.step_id });
    return { outbound: [], nextStepId: step.next_step_id };
  }

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

  if (!effectiveLastAnswer && session) {
    const isKeywordStart = session.last_payload_type === "keyword_start";
    if (isKeywordStart && session.last_payload_json) {
      let keywordMeta = session.last_payload_json;
      if (typeof keywordMeta === "string") {
        try {
          keywordMeta = JSON.parse(keywordMeta);
        } catch {
          keywordMeta = null;
        }
      }

      if (keywordMeta && typeof keywordMeta === "object") {
        const args = keywordMeta.args || "";
        const rawText = keywordMeta.rawText || "";
        const keywordOnly = keywordMeta.keyword || "";
        effectiveLastAnswer = {
          session_id: session.campaign_session_id ?? null,
          campaign_id: session.campaign_id ?? null,
          step_id: null,
          choice_id: null,
          user_input_raw: args || rawText || keywordOnly || "",
          is_valid: true,
        };
      }
    }
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
    result = await dispatchEndpoint(step.api_id, vars, {
      source: "campaign_step",
      stepId: step.step_id,
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
  const introText = (step.prompt_text || "").trim();
  const formattedText =
    apiPayload && typeof apiPayload.formattedText === "string"
      ? apiPayload.formattedText
      : null;

  let mainText = null;

  if (formattedText) {
    mainText = formattedText;
  } else if (!introText) {
    mainText = ok ? "Done." : "Sorry, something went wrong.";
  } else {
    mainText = introText;
  }

  if (introText && formattedText) {
    outbound.push(
      withStepContext({
        base: {
          to: contact.phone_num,
          content: introText,
        },
        step,
        session,
        contact,
      })
    );
  }

  if (mainText || step.media_url) {
    const mediaPayload = buildMediaWaPayload(step);
    outbound.push(
      withStepContext({
        base: {
          to: contact.phone_num,
          content: mainText || "",
          ...(mediaPayload ? { waPayload: mediaPayload } : {}),
        },
        step,
        session,
        contact,
      })
    );
  }

  const hasFailureStep = !!step.failure_step_id;
  const targetStepId = ok
    ? step.next_step_id
    : hasFailureStep
      ? step.failure_step_id
      : null;

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

export async function runEndStep({ contact, session, step }) {
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

export async function runStepAndReturnMessages({ contact, session, step }) {
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

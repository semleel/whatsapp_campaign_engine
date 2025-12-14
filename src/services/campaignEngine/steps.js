// src/services/campaignEngine/steps.js

import prisma from "../../config/prismaClient.js";
import { dispatchEndpoint } from "../integrationService.js";
import { ensureSessionStep, resolveStepContent, isLanguageSelectorStep, updateContactLanguageForSession } from "./session.js";
import { SUPPORTED_LANG_CODES } from "./constants.js";
import {
  buildChoicePromptMessage,
  withStepContext,
  buildMediaWaPayload,
  extractChoiceCodeFromPayload,
  extractLocationFromPayload,
  extractInteractiveTitleFromPayload,
} from "./helpers.js";
import { normalizeApiError } from "./apiErrorHelper.js";
import { log, warn, error } from "../../utils/logger.js";

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
  const placeholders =
    contentContext?.placeholders && typeof contentContext.placeholders === "object"
      ? contentContext.placeholders
      : null;
  const interactiveType =
    (placeholders?.interactiveType || "").toString().toLowerCase();
  const hasMenuTemplate = interactiveType === "menu" && !!placeholders?.menu;
  const normalizedChoiceMode = (step.choice_mode || "branch").toString().toLowerCase();
  const isSequentialMode = normalizedChoiceMode === "sequential";
  const interactiveTitle = extractInteractiveTitleFromPayload(payload) || "";
  const rawResponseText = incomingText || interactiveTitle || "";
  const normalizedResponseText = rawResponseText.trim();

  if (type === "button" || type === "list") {
    selectedCode = extractChoiceCodeFromPayload(payload);
    if (selectedCode) {
      const lc = selectedCode.toLowerCase();
      matchedChoice =
        choices.find((c) => (c.choice_code || "").toLowerCase() === lc) ||
        choices.find((c) => (c.label || "").trim().toLowerCase() === lc) ||
        choices.find((c) => String(c.choice_id || "").toLowerCase() === lc);
      if (!matchedChoice) {
        warn(
          "[ENGINE] No matching choice for interactive reply",
          JSON.stringify({
            selectedCode: lc,
            available: choices.map((c) => ({
              id: c.choice_id,
              code: c.choice_code,
              label: c.label,
              next_step_id: c.next_step_id,
            })),
          })
        );
      }
    }
  } else {
    const text = rawResponseText.toLowerCase();
    matchedChoice =
      choices.find((c) => (c.choice_code || "").toLowerCase() === text) ||
      choices.find((c) => (c.label || "").trim().toLowerCase() === text);
  }

  const isValid = isSequentialMode ? normalizedResponseText.length > 0 : !!matchedChoice;

  await prisma.campaign_response.create({
    data: {
      session_id: session.campaign_session_id,
      campaign_id: session.campaign_id,
      step_id: step.step_id,
      choice_id: !isSequentialMode && matchedChoice ? matchedChoice.choice_id : null,
      user_input_raw: rawResponseText,
      is_valid: isValid,
    },
  });

  if ((type === "button" || type === "list") && normalizedResponseText) {
    session.last_choice = {
      value: normalizedResponseText,
      label: normalizedResponseText,
      source: type === "list" ? "menu" : "button",
      template_content_id: step.template_source_id ?? null,
    };
  }

  log(
    "[ENGINE] Choice reply processed",
    JSON.stringify({
      step_id: step.step_id,
      choiceMode: normalizedChoiceMode,
      selectedCode,
      incomingText: rawResponseText,
      matchedChoice: matchedChoice
        ? {
          id: matchedChoice.choice_id,
          code: matchedChoice.choice_code,
          label: matchedChoice.label,
          next_step_id: matchedChoice.next_step_id,
        }
        : null,
    })
  );

  if (!isValid) {
    const msg =
      step.error_message ||
      "Sorry, I didn't get that. Please choose one of the options below.";
    const rePromptMessage = buildChoicePromptMessage({
      contact,
      prompt: promptText,
      choices,
      contentContext,
    });
    const rePrompt = withStepContext({
      base: rePromptMessage,
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

  if (isSequentialMode && hasMenuTemplate && !step.next_step_id) {
    const errMsg = `[ENGINE] Sequential menu step ${step.step_id} requires next_step_id`;
    error(errMsg);
    throw new Error(errMsg);
  }

  const targetStepId = isSequentialMode
    ? step.next_step_id
    : matchedChoice?.next_step_id;

  log(
    "[ENGINE] Choice routing",
    JSON.stringify({
      step_id: step.step_id,
      choiceMode: normalizedChoiceMode,
      targetStepId,
      is_end: step.is_end_step,
    })
  );

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
    error(
      "[ENGINE] Target step not found for choice",
      JSON.stringify({
        targetStepId,
        step_id: step.step_id,
        campaign_id: step.campaign_id,
      })
    );
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

function logApiFailure(normalizedError, err, { step, api, status }) {
  const apiName = api?.name || `API ${api?.apiId ?? ""}`.trim() || "API";
  const context = {
    stepId: step?.step_id ?? null,
    apiId: api?.apiId ?? null,
    apiName,
    status,
    type: normalizedError.type,
    error: err?.message ?? null,
  };
  const details = JSON.stringify(context);
  const message =
    normalizedError.systemMessage || err?.message || "API call failed";
  if (normalizedError.logLevel === "warn") {
    warn("[flowEngine] API error", message, details);
  } else {
    error("[flowEngine] API error", message, details);
  }
}

export async function runApiStep({
  contact,
  session,
  step,
  lastAnswer,
  contentContext = null,
}) {
  await ensureSessionStep(session, step.step_id);

  if (!step.api_id) {
    warn(
      "[flowEngine] API step has no api_id",
      JSON.stringify({ stepId: step.step_id })
    );
    return { outbound: [], nextStepId: step.next_step_id };
  }

  /* -------------------------------------------------
   * 1. Resolve lastAnswer (same logic you already had)
   * ------------------------------------------------- */
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

  /* -------------------------------------------------
   * 2. IMMEDIATELY send prompt_text (UX FIX)
   * ------------------------------------------------- */
  const outbound = [];

  if (step.prompt_text && step.prompt_text.trim()) {
    outbound.push(
      withStepContext({
        base: {
          to: contact.phone_num,
          content: step.prompt_text,
        },
        step,
        session,
        contact,
        contentContext,
      })
    );
  }

  /* -------------------------------------------------
   * 3. Call API (can be slow)
   * ------------------------------------------------- */
  let result = null;
  let ok = false;
  let status = 500;
  let apiPayload;
  let normalizedError = null;
  let apiInfo = { apiId: step.api_id };
  let formattedText = null;
  let templateError = null;

  try {
    result = await dispatchEndpoint(step.api_id, vars, {
      source: "campaign_step",
      stepId: step.step_id,
    });

    apiInfo = result?.api ?? { apiId: result?.apiId ?? step.api_id };
    ok = !!result?.ok;
    status = result?.status ?? status;
    apiPayload = result?.payload;
    formattedText =
      apiPayload && typeof apiPayload.formattedText === "string"
        ? apiPayload.formattedText
        : null;
    templateError = result?.templateError ?? null;
  } catch (err) {
    status = err?.status ?? status;
    normalizedError = normalizeApiError({
      err,
      status,
      api: apiInfo,
      step,
    });
    logApiFailure(normalizedError, err, { step, api: apiInfo, status });
    outbound.push({
      to: contact.phone_num,
      content: normalizedError.userMessage,
    });
    ok = false;
  }

  /* -------------------------------------------------
   * 4. Send API result OR error_message
   * ------------------------------------------------- */
  if (!normalizedError) {
    if (ok && !templateError && formattedText) {
      outbound.push(
        withStepContext({
          base: {
            to: contact.phone_num,
            content: formattedText,
          },
          step,
          session,
          contact,
          contentContext,
        })
      );
    } else {
      normalizedError = normalizeApiError({
        err: templateError ?? null,
        status,
        api: apiInfo,
        step,
      });
      logApiFailure(normalizedError, templateError, {
        step,
        api: apiInfo,
        status,
      });
      outbound.push({
        to: contact.phone_num,
        content: normalizedError.userMessage,
      });
      ok = false;
    }
  }

  /* -------------------------------------------------
   * 5. Decide next step
   * ------------------------------------------------- */
  const hasFailureStep = !!step.failure_step_id;
  const resolvedOk = ok && !normalizedError;
  const targetStepId = resolvedOk
    ? step.next_step_id
    : hasFailureStep
      ? step.failure_step_id
      : null;

  const integrationMeta = {
    apiId: apiInfo.apiId ?? step.api_id,
    ok: resolvedOk,
    status,
    type: normalizedError?.type ?? "SUCCESS",
    ...(apiPayload !== undefined ? { payload: apiPayload } : {}),
  };
  if (normalizedError) {
    integrationMeta.error = normalizedError.systemMessage;
    integrationMeta.userMessage = normalizedError.userMessage;
  }

  return {
    outbound,
    nextStepId: targetStepId,
    integration: {
      lastApi: integrationMeta,
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
        const promptMessage = buildChoicePromptMessage({
          contact,
          prompt: resolvedPrompt,
          choices,
          contentContext,
        });
        outbound.push(
          withStepContext({
            base: promptMessage,
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
      log(
        "[ENGINE] Sending step",
        JSON.stringify({
          step_id: current.step_id,
          campaign_id: current.campaign_id,
          action: current.action_type,
          has_text: !!(resolvedPrompt && resolvedPrompt.trim()),
          media_url: resolvedMediaUrl || null,
          media_payload_type: mediaPayload?.type || null,
        })
      );
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

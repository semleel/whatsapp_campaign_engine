// src/services/campaignEngine/steps.js

import prisma from "../../config/prismaClient.js";
import { dispatchEndpoint } from "../integrationService.js";
import { ensureSessionStep, resolveStepContent, isLanguageSelectorStep, updateContactLanguageForSession } from "./session.js";
import { SUPPORTED_LANG_CODES } from "./constants.js";
import { convertApiResponseToInteraction } from "./interactionConverter.js";
import {
  buildChoicePromptMessage,
  buildInteractionMessage,
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
  const selectedId = extractChoiceCodeFromPayload(payload) || null;
  const selectedLabel = (interactiveTitle || incomingText || "").trim();

  const isBranchMode = normalizedChoiceMode === "branch";
  const choices =
    isBranchMode
      ? await prisma.campaign_step_choice.findMany({
          where: { step_id: step.step_id },
          orderBy: { choice_id: "asc" },
        })
      : [];

  let matchedChoice = null;

  if (type === "button" || type === "list") {
    if (selectedId) {
      const lc = String(selectedId).toLowerCase();
      if (isBranchMode && choices.length) {
        matchedChoice =
          choices.find((c) => (c.choice_code || "").toLowerCase() === lc) ||
          choices.find((c) => (c.label || "").trim().toLowerCase() === lc) ||
          choices.find((c) => String(c.choice_id || "").toLowerCase() === lc);
        if (!matchedChoice) {
          warn(
            "[ENGINE] No matching choice for interactive reply",
            JSON.stringify({
              selectedId: lc,
              selectedLabel,
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
    }
  } else {
    if (isBranchMode && choices.length) {
      const text = rawResponseText.toLowerCase();
      matchedChoice =
        choices.find((c) => (c.choice_code || "").toLowerCase() === text) ||
        choices.find((c) => (c.label || "").trim().toLowerCase() === text);
    }
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

  const sessionChoiceMap = extractSessionRuntimeChoiceMap(session);
  if ((type === "button" || type === "list") && normalizedResponseText) {
    const runtimeLabel = selectedId ? sessionChoiceMap[selectedId] : null;
    const resolvedLabel = matchedChoice?.label ?? runtimeLabel ?? normalizedResponseText;
    session.last_choice = {
      value: normalizedResponseText,
      label: resolvedLabel,
      source: type === "list" ? "menu" : "button",
      template_content_id: step.template_source_id ?? null,
    };
  }

  log(
    "[ENGINE] Choice reply processed",
    JSON.stringify({
      step_id: step.step_id,
      choiceMode: normalizedChoiceMode,
      selectedId,
      selectedLabel,
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

  const explicitKey = step.interaction_config?.save_to;
  const requiredKeys = session.required_inputs || [];

  const saveKey =
    explicitKey ||
    requiredKeys.find(
      (k) => !(session.last_payload_json && k in session.last_payload_json)
    );

  let runtimeLabelEntry =
    selectedId && selectedLabel
      ? { [selectedId]: selectedLabel }
      : null;

  if (saveKey) {
    const valueToSave = selectedId || normalizedResponseText;

    if (valueToSave) {
      const existingPayload = session.last_payload_json || {};

      let updatedPayload = {
        ...(typeof existingPayload === "object" ? existingPayload : {}),
        [saveKey]: valueToSave,
      };
      if (runtimeLabelEntry) {
        updatedPayload = mergeRuntimeChoiceMapIntoPayload(updatedPayload, runtimeLabelEntry);
        runtimeLabelEntry = null;
      }
      await prisma.campaign_session.update({
        where: { campaign_session_id: session.campaign_session_id },
        data: {
          last_payload_json: updatedPayload,
          last_active_at: new Date(),
        },
      });

      // keep in-memory session updated
      session.last_payload_json = updatedPayload;
    }
  }

  if (runtimeLabelEntry) {
    const existingPayload = session.last_payload_json || {};
    const updatedPayload = mergeRuntimeChoiceMapIntoPayload(existingPayload, runtimeLabelEntry);
    await prisma.campaign_session.update({
      where: { campaign_session_id: session.campaign_session_id },
      data: {
        last_payload_json: updatedPayload,
        last_active_at: new Date(),
      },
    });
    session.last_payload_json = updatedPayload;
    runtimeLabelEntry = null;
  }

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

  const targetStepId = isSequentialMode ? step.next_step_id : matchedChoice?.next_step_id;

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

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const normalizeObject = (value) => (isPlainObject(value) ? { ...value } : {});

function mergeRuntimeChoiceMapIntoPayload(payload, choiceMap) {
  if (!choiceMap || typeof choiceMap !== "object" || !Object.keys(choiceMap).length) {
    return normalizeObject(payload);
  }
  const normalizedPayload = normalizeObject(payload);
  const runtime = normalizeObject(normalizedPayload.runtime);
  const existingChoiceMap = normalizeObject(runtime.choice_map);
  const mergedChoiceMap = { ...existingChoiceMap, ...choiceMap };
  return {
    ...normalizedPayload,
    runtime: {
      ...runtime,
      choice_map: mergedChoiceMap,
    },
  };
}

function extractSessionRuntimeChoiceMap(session) {
  const payload = session?.last_payload_json;
  if (!isPlainObject(payload)) return {};
  const runtime = payload.runtime;
  if (!isPlainObject(runtime)) return {};
  const choiceMap = runtime.choice_map;
  if (!isPlainObject(choiceMap)) return {};
  return choiceMap;
}

function extractChoiceMapFromItems(items) {
  if (!items) return {};
  const map = {};
  const addRow = (row) => {
    if (!row) return;
    const id = row.id ?? row.value;
    const title = (row.title ?? row.label ?? "").trim();
    if (!id || !title) return;
    map[String(id)] = title;
  };
  if (Array.isArray(items.rows)) {
    items.rows.forEach(addRow);
  }
  if (Array.isArray(items.sections)) {
    items.sections.forEach((section) => {
      if (!section?.rows) return;
      section.rows.forEach(addRow);
    });
  }
  return map;
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

  const explicitKey = step.interaction_config?.save_to;
  const requiredKeys = session.required_inputs || [];

  const saveKey =
    explicitKey ||
    requiredKeys.find(
      (k) => !(session.last_payload_json && k in session.last_payload_json)
    );

  if (saveKey && value) {
    const existingPayload = session.last_payload_json || {};

    await prisma.campaign_session.update({
      where: { campaign_session_id: session.campaign_session_id },
      data: {
        last_payload_json: {
          ...(typeof existingPayload === "object" ? existingPayload : {}),
          [saveKey]: value,
        },
        last_active_at: new Date(),
      },
    });

    // keep runtime session in sync
    session.last_payload_json = {
      ...(typeof existingPayload === "object" ? existingPayload : {}),
      [saveKey]: value,
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

    // Execute the configured API (if any) before rendering outbound content so downstream logic can reuse the payload.
    let stepApiState = null;
    if (current.api_id) {
      stepApiState = await executeStepApiCall({ contact, session, step: current });
      if (stepApiState?.requiredInputs?.length) {
        await prisma.campaign_session.update({
          where: { campaign_session_id: session.campaign_session_id },
          data: {
            required_inputs: stepApiState.requiredInputs,
          },
        });

        session.required_inputs = stepApiState.requiredInputs;
      }
      if (stepApiState?.normalizedError) {
        outbound.push(
          withStepContext({
            base: { to: contact.phone_num, content: stepApiState.normalizedError.userMessage },
            step: current,
            session,
            contact,
            contentContext,
          })
        );
        if (!current.failure_step_id) {
          await prisma.campaign_session.update({
            where: { campaign_session_id: session.campaign_session_id },
            data: { session_status: "COMPLETED", current_step_id: null, last_active_at: new Date() },
          });
          return { outbound };
        }
        const failureStep = await prisma.campaign_step.findUnique({
          where: { step_id: current.failure_step_id },
        });
        if (!failureStep) {
          await prisma.campaign_session.update({
            where: { campaign_session_id: session.campaign_session_id },
            data: { session_status: "COMPLETED", current_step_id: null, last_active_at: new Date() },
          });
          return { outbound };
        }
        current = failureStep;
        continue;
      }
    }

    if (
      current.interaction_config &&
      current.interaction_config.type !== "none" &&
      stepApiState?.apiPayload?.response
    ) {
      const items = convertApiResponseToInteraction({
        response: stepApiState.apiPayload.response,
        config: current.interaction_config,
      });

      const hasInteractionItems =
        (Array.isArray(items?.rows) && items.rows.length > 0) ||
        (Array.isArray(items?.sections) && items.sections.length > 0);

      if (hasInteractionItems) {
        const runtimeChoiceMap = extractChoiceMapFromItems(items);
        const sessionPayload =
          Object.keys(runtimeChoiceMap).length > 0
            ? mergeRuntimeChoiceMapIntoPayload(session.last_payload_json, runtimeChoiceMap)
            : null;

        const updateData = {
          current_step_id: current.step_id,
          last_active_at: new Date(),
          ...(sessionPayload ? { last_payload_json: sessionPayload } : {}),
        };

        await prisma.campaign_session.update({
          where: { campaign_session_id: session.campaign_session_id },
          data: updateData,
        });

        if (sessionPayload) {
          session.last_payload_json = sessionPayload;
        }

        outbound.push(
          withStepContext({
            base: buildInteractionMessage({
              contact,
              step: current,
              items,
              type: current.interaction_config?.type,
            }),
            step: current,
            session,
            contact,
            contentContext,
          })
        );
        return { outbound };
      }
    }

    const effectivePrompt = (stepApiState?.formattedText ?? resolvedPrompt) || "";

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
          prompt: effectivePrompt,
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

      if (current.action_type === "input") {
        if (effectivePrompt || resolvedMediaUrl) {
          const mediaPayload = buildMediaWaPayload({
            ...current,
            prompt_text: effectivePrompt,
            media_url: resolvedMediaUrl,
          });
          outbound.push(
            withStepContext({
              base: {
                to: contact.phone_num,
                content: effectivePrompt,
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
    }

    if (effectivePrompt || resolvedMediaUrl) {
      const mediaPayload = buildMediaWaPayload({
        ...current,
        prompt_text: effectivePrompt,
        media_url: resolvedMediaUrl,
      });
      log(
        "[ENGINE] Sending step",
        JSON.stringify({
          step_id: current.step_id,
          campaign_id: current.campaign_id,
          action: current.action_type,
          has_text: !!(effectivePrompt && effectivePrompt.trim()),
          media_url: resolvedMediaUrl || null,
          media_payload_type: mediaPayload?.type || null,
        })
      );
      outbound.push(
        withStepContext({
          base: {
            to: contact.phone_num,
            content: effectivePrompt,
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

async function resolveEffectiveLastAnswer(session, lastAnswerCandidate = null) {
  if (lastAnswerCandidate) {
    return lastAnswerCandidate;
  }
  if (!session?.campaign_session_id) return null;

  const lastResponse = await prisma.campaign_response.findFirst({
    where: {
      session_id: session.campaign_session_id,
      is_valid: true,
    },
    orderBy: { created_at: "desc" },
  });
  if (lastResponse) return lastResponse;

  if (!session) return null;
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

      return {
        session_id: session.campaign_session_id ?? null,
        campaign_id: session.campaign_id ?? null,
        step_id: null,
        choice_id: null,
        user_input_raw: args || rawText || keywordOnly || "",
        is_valid: true,
      };
    }
  }

  return null;
}

async function executeStepApiCall({ contact, session, step, lastAnswer = null }) {
  if (!step?.api_id) return null;

  const effectiveLastAnswer = await resolveEffectiveLastAnswer(session, lastAnswer);
  const vars = {
    contact,
    campaign: session?.campaign || { campaign_id: session?.campaign_id },
    session,
    lastAnswer: effectiveLastAnswer,
  };

  let result = null;
  let ok = false;
  let status = 500;
  let apiPayload = null;
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
    return {
      normalizedError,
      apiPayload: null,
      formattedText: null,
      apiInfo,
      status,
    };
  }

  if (!normalizedError) {
    if (!ok || templateError) {
      normalizedError = normalizeApiError({
        err: templateError ?? null,
        status,
        api: apiInfo,
        step,
      });
      logApiFailure(normalizedError, templateError ?? null, {
        step,
        api: apiInfo,
        status,
      });
    }
  }

  return {
    normalizedError,
    apiPayload,
    formattedText,
    apiInfo,
    status,
    requiredInputs: result?.requiredInputs || [],
  };
}

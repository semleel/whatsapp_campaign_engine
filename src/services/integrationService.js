// src/services/integrationService.js

import { URL } from "url";
import { appendLog } from "./integrationStore.js";
import prisma from "../config/prismaClient.js";
import { getRuntimeEndpoint } from "./apiEndpointRuntime.js";
import { normalizeApiError } from "./campaignEngine/apiErrorHelper.js";
import { log as appLog, warn as appWarn } from "../utils/logger.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { convertApiResponseToInteraction } from "./campaignEngine/interactionConverter.js";

// ---------------------------------------------------------------------------
// Simple {{ token }} formatter (used for URL/body templating)
// ---------------------------------------------------------------------------
const PLACEHOLDER = /{{\s*([^}]+)\s*}}/g;

function extractSessionKeysFromBodyTemplate(template) {
  if (!template || typeof template !== "string") return [];
  const regex = /{{\s*session\.([a-zA-Z0-9_]+)\s*}}/g;
  const keys = new Set();
  let match;
  while ((match = regex.exec(template)) !== null) {
    keys.add(match[1]);
  }
  return Array.from(keys);
}

function resolvePath(data, path) {
  return path.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), data);
}

export function renderTemplateString(input, context = {}) {
  if (!input || typeof input !== "string") return input;

  let hasMissing = false;

  const output = input.replace(PLACEHOLDER, (_, token) => {
    const [rawPath, formatter] = token.split("|").map((part) => part.trim());
    const value = resolvePath(context, rawPath);

    if (value === undefined || value === null) {
      hasMissing = true;
      return "";
    }

    return formatter ? applyFormatter(value, formatter) : toPlainString(value);
  });

  if (hasMissing) {
    const err = new Error("TEMPLATE_MISSING_FIELD");
    err.code = "TEMPLATE_MISSING_FIELD";
    throw err;
  }

  return output;
}

function toPlainString(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    return value.map((item) => toPlainString(item)).join(", ");
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function applyFormatter(value, formatter) {
  const rawFormatter = (formatter || "").trim();
  const [method, argRaw] = rawFormatter.split(":").map((s) => s.trim());

  const normalized = method.toLowerCase();
  const arg = argRaw?.toUpperCase();
  const numVal = Number(value) || 0;

  switch (normalized) {
    case "currency": {
      const currencyCode = arg === "USD" ? "USD" : "MYR";
      const locale = currencyCode === "USD" ? "en-US" : "en-MY";

      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: currencyCode,
      }).format(numVal);
    }

    case "number":
      return new Intl.NumberFormat("en-MY").format(numVal);

    case "times":
      return numVal * arg;

    case "divided_by":
      // Prevent division by zero
      return arg !== 0 ? numVal / arg : numVal;

    case "plus":
      return numVal + arg;

    case "minus":
      return numVal - arg;

    case "date":
      // expects milliseconds (JS Date)
      return new Date(Number(value)).toLocaleDateString("en-MY");

    case "date_unix":
      // unix seconds -> ms
      return new Date(Number(value) * 1000).toLocaleDateString("en-MY");

    case "date_time_unix":
      return new Date(Number(value) * 1000).toLocaleString("en-MY", {
        hour12: false,
      });

    case "upper":
      return String(value ?? "").toUpperCase();

    case "lower":
      return String(value ?? "").toLowerCase();

    case "list":
      return Array.isArray(value)
        ? value.map((item) => toPlainString(item)).join(", ")
        : toPlainString(value);

    default:
      return toPlainString(value);
  }
}

function normalizeLastAnswer(rawAnswer) {
  if (rawAnswer == null) {
    return { raw: null, value: null };
  }

  // ✅ CASE 1: Admin test sends { value: "cheras" }
  if (typeof rawAnswer === "object" && "value" in rawAnswer) {
    const v = rawAnswer.value;
    return {
      raw: v,
      value: typeof v === "string" ? v.trim() : v,
    };
  }

  // ✅ CASE 2: Campaign response row (WhatsApp runtime)
  if (typeof rawAnswer === "object" && "user_input_raw" in rawAnswer) {
    const v = rawAnswer.user_input_raw;
    return {
      raw: v,
      value: typeof v === "string" ? v.trim() : v,
    };
  }

  // ✅ CASE 3: Plain string
  if (typeof rawAnswer === "string") {
    return {
      raw: rawAnswer,
      value: rawAnswer.trim(),
    };
  }

  return {
    raw: rawAnswer,
    value: rawAnswer,
  };
}

function buildTemplateResponse(responseBody) {
  if (Array.isArray(responseBody)) {
    return responseBody.length > 0 && typeof responseBody[0] === "object"
      ? responseBody[0]
      : { value: responseBody };
  }

  if (responseBody && typeof responseBody === "object") {
    const keys = Object.keys(responseBody);

    if (keys.length === 1) {
      const singleValue = responseBody[keys[0]];
      if (singleValue && typeof singleValue === "object") {
        return { ...responseBody, data: singleValue };
      }
    }

    return responseBody;
  }

  if (responseBody != null) {
    return { value: responseBody };
  }

  return {};
}

function ensureHttps(url) {
  if (!/^https:\/\//i.test(url)) {
    throw new Error("Only HTTPS endpoints are allowed for integration calls.");
  }
}

function buildUrl(endpoint, vars) {
  const interpolated = renderTemplateString(endpoint.url, vars);
  ensureHttps(interpolated);
  const url = new URL(interpolated);
  (endpoint.query || []).forEach(({ key, value }) => {
    if (!key) return;
    url.searchParams.set(key, renderTemplateString(value, vars));
  });
  return url.toString();
}

function buildHeaders(endpoint, vars) {
  const headers = {};
  (endpoint.headers || []).forEach(({ key, value }) => {
    if (!key) return;
    headers[key] = renderTemplateString(value, vars);
  });
  const authType = endpoint.auth?.type || "none";
  if (authType !== "none") {
    const headerName =
      endpoint.auth?.headerName ||
      (authType === "bearer_header" ? "Authorization" : "X-API-Key");
    const prefix = authType === "bearer_header" ? "Bearer " : "";
    const token = endpoint.auth?.tokenRef || "";
    const headerValue = `${prefix}${token}`.trim();
    if (headerValue) {
      headers[headerName] = headerValue;
    }
  }
  return headers;
}

function buildBody(endpoint, vars) {
  if (endpoint.method === "GET") return undefined;
  if (!endpoint.bodyTemplate) return undefined;
  const rendered = renderTemplateString(endpoint.bodyTemplate, vars);
  try {
    return JSON.stringify(JSON.parse(rendered));
  } catch {
    return rendered;
  }
}

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function applyParamMap(baseVars = {}, paramMap) {
  if (!paramMap || typeof paramMap !== "object") return { ...baseVars };
  const resolved = { ...baseVars };
  Object.entries(paramMap).forEach(([key, template]) => {
    if (!key || typeof template !== "string") return;
    resolved[key] = renderTemplateString(template, baseVars);
  });
  return resolved;
}

export function materializeVariables(baseVars, paramMap) {
  return applyParamMap(baseVars, paramMap);
}

export async function dispatchEndpoint(endpointId, vars = {}, options = {}) {
  const { log = true, source, stepId } = options || {};
  let endpoint = await getRuntimeEndpoint(endpointId);
  if (!endpoint) throw new Error("Endpoint not found");

  const endpointNumericId = endpoint.id ?? endpoint.api_id ?? Number(endpointId);
  if (endpoint.isDeleted) {
    const err = new Error("This API has been archived.");
    err.code = "API_ARCHIVED";
    err.apiId = endpointNumericId;
    throw err;
  }

  const apiMeta = {
    apiId: endpointNumericId ?? endpointId,
    name: endpoint.name,
    isActive: endpoint.is_active ?? endpoint.isActive ?? true,
  };
  
  if (apiMeta.isActive === false && source !== "manual_test") {
    const err = new Error("API_DISABLED");
    err.code = "API_DISABLED";
    err.apiId = endpointId;
    throw err;
  }

  
  if (!endpoint.response_template && endpointNumericId) {
    try {
      const apiRow = await prisma.api.findUnique({
        where: { api_id: Number(endpointNumericId) },
        select: { response_template: true },
      });
      if (apiRow?.response_template) {
        endpoint = { ...endpoint, response_template: apiRow.response_template };
      }
    } catch (e) {
      appWarn?.("[integration] failed to hydrate response_template:", e?.message || e);
    }
  }

  const normalizedTemplate = endpoint.response_template
    ? String(endpoint.response_template).trim()
    : "";
  if (!normalizedTemplate) {
    const err = new Error("Response template is empty");
    err.code = "TEMPLATE_EMPTY";
    throw err;
  }
  endpoint = { ...endpoint, response_template: normalizedTemplate };
  const requiredInputs = extractSessionKeysFromBodyTemplate(endpoint.bodyTemplate || "");

  const resolvedVars = { ...vars };
  const lastAnswerContext = normalizeLastAnswer(
    resolvedVars.lastAnswer ?? null
  );

  const localStepId =
    stepId ??
    resolvedVars.step?.step_id ??
    resolvedVars.step_id ??
    null;

  const requestContext = {
    ...resolvedVars,
    session: {
      ...resolvedVars.session,
      ...(resolvedVars.session?.last_payload_json || {}),
    },
    lastAnswer: {
      raw: lastAnswerContext.raw,
      value: lastAnswerContext.value,
    },
  };

  const url = buildUrl(endpoint, requestContext);
  const method = endpoint.method || "GET";
  const headers = {
    "Content-Type": "application/json",
    ...buildHeaders(endpoint, requestContext),
  };
  const body = buildBody(endpoint, requestContext);
  const bodyString =
    body == null ? null : typeof body === "string" ? body : JSON.stringify(body);

  const retries = Math.max(0, Number(endpoint.retries) || 0);
  const timeoutMs = Math.max(1000, Number(endpoint.timeoutMs) || 8000);
  const backoffMs = Math.max(0, Number(endpoint.backoffMs) || 0);

  const attempt = async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const started = Date.now();
    try {
      const res = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });
      const duration = Date.now() - started;
      const ct = res.headers.get("content-type") || "";
      let rawText = "";
      try {
        rawText = await res.text();
      } catch {
        rawText = "";
      }

      let payload = rawText;
      if (ct.includes("application/json")) {
        try {
          payload = rawText ? JSON.parse(rawText) : null;
        } catch {
          payload = rawText;
        }
      }

      return {
        ok: res.ok,
        status: res.status,
        duration,
        payload,
        url,
        method,
        requestBody: bodyString,
      };
    } finally {
      clearTimeout(timeout);
    }
  };

  const shouldLog = log !== false;

  const campaignId =
    resolvedVars.campaign?.campaign_id ??
    resolvedVars.campaign?.campaignid ??
    resolvedVars.campaign?.id ??
    null;
  const sessionId =
    resolvedVars.session?.campaign_session_id ??
    resolvedVars.session?.campaignsessionid ??
    resolvedVars.session?.id ??
    null;
  const contactId =
    resolvedVars.contact?.contact_id ??
    resolvedVars.contact?.contactid ??
    resolvedVars.contact?.id ??
    null;

  let lastError = null;

  for (let i = 0; i <= retries; i += 1) {
    try {
      const result = await attempt();

      const responseBody = result.payload;
      const responseNormalized = buildTemplateResponse(responseBody);

      // ---- Response templating ----
      let formattedText = null;
      let templateError = null;

      if (result.ok && endpoint.response_template) {
        const ctx = {
          lastAnswer: {
            raw: lastAnswerContext.raw,
            value: lastAnswerContext.value,
          },
          response: responseNormalized,
        };

        try {
          formattedText = renderTemplateString(endpoint.response_template, ctx);
        } catch (err) {
          appWarn?.(
            "[integration] response_template render failed:",
            err?.message || err
          );
          templateError = err;
        }
      }

      // ---- Interaction generation (CHOICE + interaction_config) ----
      let interactionItems = null;

      if (
        endpoint &&
        resolvedVars?.step &&
        resolvedVars.step.action_type === "choice" &&
        resolvedVars.step.interaction_config
      ) {
        try {
          interactionItems = convertApiResponseToInteraction({
            response: responseNormalized,
            config: resolvedVars.step.interaction_config,
          });
        } catch (e) {
          appWarn?.("[interaction] failed to convert API response:", e?.message || e);
        }
      }

      const successResponse = {
        ...result,
        url,
        method,
        apiId: endpointNumericId ?? endpointId,
        requestBody: body,
        payload: {
          response: responseNormalized,
          ...(formattedText ? { formattedText } : {}),
        },
        api: apiMeta,
        templateError,
        requiredInputs,
      };

      if (shouldLog) {
        try {
          await prisma.api_log.create({
            data: {
              api_id: endpointNumericId ? Number(endpointNumericId) : null,
              campaign_id: campaignId,
              campaign_session_id: sessionId,
              contact_id: contactId,
              step_id: localStepId,
              request_url: url,
              request_body: bodyString,
              response_body:
                typeof responseBody === "string"
                  ? responseBody
                  : JSON.stringify(responseBody),
              response_code: result.status,
              status: "success",
              error_message: null,
              source,
              called_at: new Date(),
            },
          });
        } catch (logErr) {
          appWarn?.(
            "[integration] failed to write api_log (success):",
            logErr?.message || logErr
          );
        }
      }

      if (!result.ok && i < retries) {
        await wait(backoffMs || 0);
        continue;
      }

      return successResponse;
    } catch (err) {
      lastError = err;
      if (i < retries) {
        await wait(backoffMs || 0);
        continue;
      }
      break;
    }
  }

  if (lastError) {
    if (shouldLog) {
      try {
        await prisma.api_log.create({
          data: {
            api_id: endpointNumericId ? Number(endpointNumericId) : null,
            campaign_id: campaignId,
            campaign_session_id: sessionId,
            contact_id: contactId,
            step_id: localStepId,
            request_url: url,
            request_body: bodyString,
            response_body: null,
            response_code: null,
            status: "error",
            error_message: lastError?.message || "Unknown error during dispatch",
            source,
            called_at: new Date(),
          },
        });
      } catch (logErr) {
        appWarn?.(
          "[integration] failed to write api_log (error):",
          logErr?.message || logErr
        );
      }
    }
    throw lastError;
  }

  // In case we somehow exit the loop without returning or erroring,
  throw new Error("Unknown error during dispatch");
}

function normalizeResponseForPrompt(responseJson) {
  if (responseJson == null) return null;
  if (typeof responseJson === "string") {
    try {
      return JSON.parse(responseJson);
    } catch {
      return { value: responseJson };
    }
  }
  if (typeof responseJson === "object") {
    return responseJson;
  }
  return { value: responseJson };
}

function trimResponseObject(obj, limit = 12) {
  if (Array.isArray(obj)) {
    return obj.slice(0, limit);
  }
  if (!obj || typeof obj !== "object") return obj;
  const entries = Object.entries(obj).slice(0, limit);
  return Object.fromEntries(entries);
}

function detectFirstImageKey(obj) {
  if (!obj || typeof obj !== "object") return null;
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value !== "string") continue;
    const normalized = value.toLowerCase();
    if (
      normalized.startsWith("http") &&
      (normalized.endsWith(".jpg") ||
        normalized.endsWith(".jpeg") ||
        normalized.endsWith(".png") ||
        normalized.endsWith(".gif") ||
        normalized.endsWith(".webp") ||
        normalized.endsWith(".svg"))
    ) {
      return key;
    }
  }
  return null;
}

function sanitizeGeminiOutput(text) {
  if (!text) return "";
  return text
    .replace(/```/g, "")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/[*_~]/g, "")
    .trim();
}


// ---------------------------------------------------------------------------
// Gemini API call wrapper — FIXED
// ---------------------------------------------------------------------------
async function callGemini(messages) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Gemini API key is missing.");

  // 1. Initialize the official Client
  const genAI = new GoogleGenerativeAI(apiKey);

  // 2. Select a VALID model
  const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  const model = genAI.getGenerativeModel({ model: modelName });

  // 3. Convert messages to a simple prompt string
  // (The SDK handles simple string prompts best for this use case)
  const prompt = messages
    .map((m) => {
      // If it's a system instruction, we can prepend it or pass it separately,
      // but simpler is often better for flash models:
      return m.role === "system" ? `**SYSTEM INSTRUCTION:** ${m.content}` : m.content;
    })
    .join("\n\n");

  try {
    // 4. Generate Content
    const result = await model.generateContent(prompt);

    // 5. Await the response object specifically
    const response = await result.response;
    const text = response.text();

    if (!text) throw new Error("Gemini returned empty output.");

    // Clean up markdown code blocks if present
    return text.replace(/```json/g, "").replace(/```/g, "").trim();

  } catch (error) {
    // Log the actual error from Google to help debugging
    console.error("Gemini API Error details:", error);
    throw new Error(`Gemini API Failed: ${error.message}`);
  }
}

export async function generateTemplateFromAI({
  campaign = null,
  step = null,
  responseJson,
  lastAnswer,
}) {
  if (!responseJson) {
    throw new Error(
      "Template generation requires a sample API response or sample user input."
    );
  }

  // 1. Safe Defaults
  const safeCampaign = {
    name: campaign?.name || "Unlinked API",
    description: campaign?.description || "Generic API response",
  };

  const safeStep = {
    prompt_text: step?.prompt_text || "No specific user prompt provided.",
  };

  // 2. Prepare the JSON context
  // We trim the object to avoid hitting token limits with huge API responses
  const normalized = normalizeResponseForPrompt(responseJson);
  const trimmed = trimResponseObject(normalized, 15);

  let snippet = JSON.stringify(trimmed, null, 2);
  if (snippet.length > 2000) snippet = snippet.slice(0, 2000) + "\n...(truncated)";

  // 3. Detect Image for context
  const imageKey = detectFirstImageKey(trimmed);
  const imageHint = imageKey
    ? `NOTE: An image URL was detected in the field '${imageKey}'. You can refer to it as {{ response.${imageKey} }}.`
    : "";

  // 4. Construct the Prompt
  // We combine instructions into a single clear block for Gemini
  const systemInstruction = `
  You are an expert WhatsApp message template designer.
  Your goal is to write a short, clear WhatsApp message template based on a JSON API response.

  ====================
  TEMPLATE RULES
  ====================
  1. Always use {{ response.* }} to access API data.
  2. If the API response is wrapped in a single root object, prefer:
    → {{ response.data.fieldName }}
  3. If the API response is flat, use:
    → {{ response.fieldName }}

  ====================
  FORMATTERS
  ====================
  Use formatters when appropriate.

  • Currency:
    - If the field name contains "usd", use:
      {{ response.price_usd | currency:usd }}
    - If the field name contains "myr", use:
      {{ response.price_myr | currency:myr }}
    - If currency is unclear, default to:
      {{ response.price | currency }}

  • Numbers:
    {{ response.value | number }}

  • Math:
    - Multiply: {{ response.val | times: 10 }}
    - Divide: {{ response.val | divided_by: 10 }}
    - Add: {{ response.val | plus: 5 }}
    - Subtract: {{ response.val | minus: 2 }}

  • Lists:
    {{ response.items | list }}

  • Dates & Time (IMPORTANT):
    - UNIX timestamp (seconds, DATE ONLY):
      {{ response.time | date_unix }}
    - UNIX timestamp (seconds, DATE + TIME):
      {{ response.time | date_time_unix }}
    - JS timestamp (milliseconds):
      {{ response.time | date }}

    👉 Use **date_time_unix** when showing "last updated", "updated at", or any real-time data.
    👉 Use **date_unix** only when time is NOT important.

  • Text:
    - Uppercase: {{ response.symbol | upper }}
    - Lowercase: {{ response.symbol | lower }}

  ====================
  FORMATTING & STYLE (CRITICAL)
  ====================
  - HEADERS: Use *Bold* and Emojis for titles (e.g., 📈 *Price Update*).
  - LABELS: Bold keys for readability (e.g., *USD:* {{ response.usd }}).
  - SPACING: Always leave an empty line between header, body, and lists.
  - LISTS: Use hyphens (-) or bullet points (•).
  - ID/CODES: Use monospaced font for IDs if applicable (e.g., \`{{ response.id }}\`).

  ====================
  CONSTRAINTS
  ====================
  - Keep the message concise.
  - Use {{ lastAnswer.value }} only if it adds clarity.
  - NEVER invent fields.
  - NEVER guess keys.
  - NEVER use dynamic keys.
  - NEVER explain the template.
  - Output ONLY the final template text.
  `.trim();

  const userContext = `
  **Context:**
  - Campaign Name: ${safeCampaign.name}
  - Campaign Goal: ${safeCampaign.description}
  - User's Request (Step): "${safeStep.prompt_text}"
  - User's Last Input: "${lastAnswer ?? "N/A"}"

  **API Response Data (JSON):**
  \`\`\`json
  ${snippet}
  \`\`\`

  ${imageHint}

  **Task:**
  Write the WhatsApp message template now.
  `;

  // 5. Send to Gemini
  // We pass an array of messages to match the 'callGemini' structure we fixed earlier
  const messages = [
    { role: "system", content: systemInstruction },
    { role: "user", content: userContext },
  ];

  return callGemini(messages);
}

export async function runTest({ endpointId, sampleVars = {}, templateId }) {
  const ts = new Date().toISOString();

  try {
    const result = await dispatchEndpoint(endpointId, sampleVars);
    const formatted =
      result?.payload && typeof result.payload.formattedText === "string"
        ? result.payload.formattedText
        : null;

    appendLog({
      id: `${ts}-${Math.random().toString(36).slice(2, 6)}`,
      ts,
      level: "info",
      source: "integration:test",
      message: `Endpoint ${endpointId} responded with ${result.status}`,
      meta: {
        endpointId,
        status: result.status,
        duration: result.duration,
        responsePayload: result.payload,
      },
    });

    return {
      ok: true,
      status: result.status,
      timeMs: result.duration,
      responseJson: {
        raw: result.payload,
        formatted,
      },
    };
  } catch (error) {
    const normalizedError = normalizeApiError({
      err: error,
      status: error?.status ?? 502,
      api: { apiId },
      step: {},
    });

    appendLog({
      id: `${ts}-${Math.random().toString(36).slice(2, 6)}`,
      ts,
      level: "error",
      source: "integration:test",
      message: normalizedError.userMessage,
      error: normalizedError.userMessage,
      meta: {
        endpointId,
        sampleVars,
        normalizedError,
        status: error?.status ?? 500,
      },
    });

    return {
      ok: false,
      status: error?.status ?? 500,
      timeMs: 0,
      errorMessage:
        normalizedError.userMessage || error.message || "Failed to execute test",
    };
  }
}

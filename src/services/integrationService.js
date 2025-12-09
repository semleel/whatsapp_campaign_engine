// src/services/integrationService.js

import { URL } from "url";
import { appendLog } from "./integrationStore.js";
import prisma from "../config/prismaClient.js";
import { getRuntimeEndpoint } from "./apiEndpointRuntime.js";
import { log as appLog, warn as appWarn } from "../utils/logger.js";

// ---------------------------------------------------------------------------
// Simple {{ token }} formatter (used for URL/body templating)
// ---------------------------------------------------------------------------
const PLACEHOLDER = /{{\s*([^}]+)\s*}}/g;

function resolvePath(data, path) {
  return path.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), data);
}

export function renderTemplateString(input, context = {}) {
  if (!input || typeof input !== "string") return input;
  return input.replace(PLACEHOLDER, (_, token) => {
    const [rawPath, formatter] = token.split("|").map((part) => part.trim());
    const value = resolvePath(context, rawPath);
    if (value == null) return "";
    return applyFormatter(value, formatter);
  });
}

function applyFormatter(value, formatter) {
  if (!formatter) return String(value);
  switch ((formatter || "").toLowerCase()) {
    case "currency":
      return new Intl.NumberFormat("en-MY", {
        style: "currency",
        currency: "MYR",
      }).format(Number(value) || 0);
    case "number":
      return new Intl.NumberFormat("en-MY").format(Number(value) || 0);
    case "date":
      return new Date(value).toLocaleDateString("en-MY");
    default:
      return String(value);
  }
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
  if (endpoint.auth && endpoint.auth.type !== "none") {
    const headerName = endpoint.auth.headerName || (endpoint.auth.type === "bearer" ? "Authorization" : "X-API-Key");
    const prefix = endpoint.auth.type === "bearer" ? "Bearer " : "";
    headers[headerName] = `${prefix}${endpoint.auth.tokenRef || ""}`;
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
  let endpoint = await getRuntimeEndpoint(endpointId);
  if (!endpoint) throw new Error("Endpoint not found");

  const endpointNumericId = endpoint.id ?? endpoint.api_id ?? Number(endpointId);
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

  const resolvedVars = { ...vars };
  let lastAnswerValue = null;
  if (resolvedVars.lastAnswer?.user_input_raw) {
    const raw = resolvedVars.lastAnswer.user_input_raw;
    try {
      lastAnswerValue = JSON.parse(raw);
    } catch {
      lastAnswerValue = raw;
    }
  }

  const requestContext = {
    ...resolvedVars,
    campaign: resolvedVars.campaign || {},
    args: resolvedVars,
    lastAnswer: {
      raw: resolvedVars.lastAnswer || null,
      value: lastAnswerValue,
    },
  };
  const url = buildUrl(endpoint, requestContext);
  const method = endpoint.method || "GET";
  const headers = {
    "Content-Type": "application/json",
    ...buildHeaders(endpoint, requestContext),
  };
  const body = buildBody(endpoint, requestContext);
  const bodyString = body == null ? null : typeof body === "string" ? body : JSON.stringify(body);
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

  const shouldLog = options.log !== false;
  const source = options.source || "engine";

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
  let lastResult = null;
  for (let i = 0; i <= retries; i += 1) {
    try {
      const result = await attempt();
      lastResult = result;
      if (!result.ok) {
        lastError = new Error(`Remote responded with status ${result.status}`);
        if (i < retries) {
          await wait(backoffMs || 0);
          continue;
        }
        break;
      }

      const responseBody = result.payload;

      let formattedText = null;
      if (endpoint.response_template) {
        const ctx = {
          contact: resolvedVars.contact || null,
          campaign: resolvedVars.campaign || null,
          session: resolvedVars.session || null,
          lastAnswer: resolvedVars.lastAnswer || null,
          response: responseBody,
        };
        try {
          // Use the same {{ token }} behavior as the formatter playground
          formattedText = renderTemplateString(endpoint.response_template, ctx);
        } catch (err) {
          appWarn?.(
            "[integration] response_template render failed:",
            err?.message || err
          );
        }
      }

      const successResponse = {
        ...result,
        url,
        method,
        apiId: endpointNumericId ?? endpointId,
        requestBody: body,
        payload: {
          response: responseBody,
          ...(formattedText ? { formattedText } : {}),
        },
      };

      if (shouldLog) {
        try {
          await prisma.api_log.create({
            data: {
              api_id: endpointNumericId ? Number(endpointNumericId) : null,
              campaign_id: campaignId,
              campaign_session_id: sessionId,
              contact_id: contactId,
              request_url: url,
              request_body: bodyString,
              response_body:
                typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody),
              response_code: result.status,
              status: "success",
              error_message: null,
              called_at: new Date(),
              source,
            },
          });
        } catch (logErr) {
          appWarn?.("[integration] failed to write api_log (success):", logErr?.message || logErr);
        }
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

  if (shouldLog) {
    try {
      await prisma.api_log.create({
        data: {
          api_id: endpointNumericId ? Number(endpointNumericId) : null,
          campaign_id: campaignId,
          campaign_session_id: sessionId,
          contact_id: contactId,
          request_url: url,
          request_body: bodyString,
          response_body:
            lastResult && typeof lastResult.payload === "string"
              ? lastResult.payload
              : lastResult?.payload != null
                ? JSON.stringify(lastResult.payload)
                : null,
          response_code: lastResult?.status ?? 500,
          status: "error",
          error_message: lastError?.message || "Unknown error during dispatch",
          called_at: new Date(),
          source,
        },
      });
    } catch (logErr) {
      appWarn?.("[integration] failed to write api_log (error):", logErr?.message || logErr);
    }
  }

  throw lastError || new Error("Unknown error during dispatch");
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
    appendLog({
      id: `${ts}-${Math.random().toString(36).slice(2, 6)}`,
      ts,
      level: "error",
      source: "integration:test",
      message: error.message,
      meta: { endpointId, sampleVars },
    });

    return {
      ok: false,
      status: 500,
      timeMs: 0,
      errorMessage: error.message || "Failed to execute test",
    };
  }
}

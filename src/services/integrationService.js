import { URL } from "url";
import { appendLog, getEndpoint, getResponseTemplate } from "./integrationStore.js";
import { log as appLog, warn as appWarn } from "../utils/logger.js";

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
  switch (formatter.toLowerCase()) {
    case "currency":
      return new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR" }).format(Number(value) || 0);
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

export async function dispatchEndpoint(endpointId, vars = {}) {
  const endpoint = await getEndpoint(endpointId);
  if (!endpoint) throw new Error("Endpoint not found");

  const resolvedVars = { ...vars };
  const requestContext = { ...resolvedVars, campaign: resolvedVars.campaign || {}, args: resolvedVars };
  const url = buildUrl(endpoint, requestContext);
  const headers = {
    "Content-Type": "application/json",
    ...buildHeaders(endpoint, requestContext),
  };
  const body = buildBody(endpoint, requestContext);
  const retries = Math.max(0, Number(endpoint.retries) || 0);
  const timeoutMs = Math.max(1000, Number(endpoint.timeoutMs) || 8000);
  const backoffMs = Math.max(0, Number(endpoint.backoffMs) || 0);

  const attempt = async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const started = Date.now();
    try {
      const res = await fetch(url, {
        method: endpoint.method,
        headers,
        body,
        signal: controller.signal,
      });
      const duration = Date.now() - started;
      const ct = res.headers.get("content-type") || "";
      let payload;
      if (ct.includes("application/json")) {
        payload = await res.json();
      } else {
        payload = await res.text();
      }
      return { ok: res.ok, status: res.status, duration, payload };
    } finally {
      clearTimeout(timeout);
    }
  };

  let lastError = null;
  for (let i = 0; i <= retries; i += 1) {
    try {
      const result = await attempt();
      if (!result.ok) throw new Error(`Remote responded with status ${result.status}`);
      return result;
    } catch (err) {
      lastError = err;
      if (i < retries) {
        await wait(backoffMs || 0);
        continue;
      }
      throw err;
    }
  }
  throw lastError || new Error("Unknown error during dispatch");
}

export function renderResponse(templateId, payload, vars = {}) {
  if (!templateId) return null;
  const template = getResponseTemplate(templateId);
  if (!template) return null;
  const context = { ...vars, ...normalizePayload(payload), args: payload };
  return {
    templateId: template.id,
    body: renderTemplateString(template.body, context),
    locale: template.locale,
  };
}

function normalizePayload(payload) {
  if (payload && typeof payload === "object") return payload;
  return { value: payload };
}

export async function runTest({ endpointId, sampleVars = {}, templateId }) {
  const ts = new Date().toISOString();
  try {
    const result = await dispatchEndpoint(endpointId, sampleVars);
    const formatted = renderResponse(templateId, result.payload, sampleVars);
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
    appLog(`Integration test successful for endpoint ${endpointId}`);
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
    appWarn(`Integration test failed for endpoint ${endpointId}: ${error.message}`);
    return {
      ok: false,
      status: 500,
      timeMs: 0,
      errorMessage: error.message,
    };
  }
}

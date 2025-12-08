// src/controllers/integrationController.js

import {
  appendLog,
  deleteEndpoint,
  getEndpoint,
  getMapping,
  listEndpoints,
  listLogs,
  saveEndpoint,
  seedIntegrationData,
} from "../services/integrationStore.js";
import { dispatchEndpoint, materializeVariables } from "../services/integrationService.js";
import prisma from "../config/prismaClient.js";

seedIntegrationData();

// ------------------------------
// Update API response_template
// ------------------------------
export async function updateApiTemplate(req, res) {
  const id = Number(req.params.id);
  const { response_template } = req.body || {};

  if (!id || Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid API id" });
  }

  try {
    const updated = await prisma.api.update({
      where: { api_id: id },
      data: { response_template: response_template || null },
    });
    return res.json({ ok: true, api: updated });
  } catch (err) {
    console.error("updateApiTemplate error:", err);
    return res.status(500).json({ error: "Failed to update API template" });
  }
}

function ensureHttps(url) {
  if (!/^https:\/\//i.test(url)) {
    throw new Error("Only HTTPS endpoints are allowed.");
  }
}

function normalizePairs(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((row) => ({
      key: String(row.key || "").trim(),
      value: String(row.value || "").trim(),
    }))
    .filter((row) => row.key || row.value);
}

function normalizeEndpointInput(body, current = {}) {
  return {
    name: body.name ?? current.name ?? "",
    method: body.method === "POST" ? "POST" : "GET",
    url: body.url ?? current.url ?? "",
    description: body.description ?? current.description ?? "",
    headers: normalizePairs(body.headers ?? current.headers ?? []),
    query: normalizePairs(body.query ?? current.query ?? []),
    bodyTemplate: body.bodyTemplate ?? current.bodyTemplate ?? "",
    auth: body.auth || current.auth || { type: "none" },
    timeoutMs: Number(body.timeoutMs ?? current.timeoutMs ?? 8000),
    retries: Number(body.retries ?? current.retries ?? 0),
    backoffMs: Number(body.backoffMs ?? current.backoffMs ?? 300),
    parameters: normalizeParameters(body.parameters ?? current.parameters ?? []),
  };
}

function normalizeParameters(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((param) => ({
      key: String(param.key || "").trim(),
      valueSource: ["query", "header", "body", "path", "context"].includes(param.valueSource)
        ? param.valueSource
        : "query",
      value: String(param.value || "").trim(),
      required: Boolean(param.required),
    }))
    .filter((param) => param.key && param.value);
}

export async function getAllEndpoints(req, res) {
  try {
    const endpoints = await listEndpoints();
    return res.json(endpoints);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to load endpoints" });
  }
}

export async function getSingleEndpoint(req, res) {
  try {
    const endpoint = await getEndpoint(req.params.id);
    if (!endpoint) return res.status(404).json({ error: "Endpoint not found" });
    return res.json(endpoint);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to load endpoint" });
  }
}

export async function createEndpoint(req, res) {
  try {
    ensureHttps(req.body.url || "");
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  try {
    const normalized = normalizeEndpointInput(req.body);
    const payload = await saveEndpoint({ ...normalized, id: undefined });
    return res.status(201).json(payload);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to create endpoint" });
  }
}

export async function updateEndpoint(req, res) {
  let current;
  try {
    current = await getEndpoint(req.params.id);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to load endpoint" });
  }
  if (!current) return res.status(404).json({ error: "Endpoint not found" });
  try {
    ensureHttps(req.body.url || current.url);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  try {
    const normalized = normalizeEndpointInput({ ...current, ...req.body }, current);
    const payload = await saveEndpoint({ ...current, ...normalized, id: current.id });
    return res.json(payload);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to update endpoint" });
  }
}

export async function removeEndpoint(req, res) {
  try {
    const success = await deleteEndpoint(req.params.id);
    if (!success) return res.status(404).json({ error: "Endpoint not found" });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to delete endpoint" });
  }
}

export async function getIntegrationLogs(req, res) {
  const limit = Number(req.query.limit) || 100;
  try {
    const rows = await listLogs(limit);
    return res.json(rows);
  } catch (err) {
    console.error("[integration:logs] load error:", err);
    return res.status(500).json({ error: err?.message || "Failed to load logs" });
  }
}

export async function runTest(req, res) {
  const { endpointId, sampleVars = {} } = req.body || {};

  const apiId = Number(endpointId);
  if (!apiId || Number.isNaN(apiId)) {
    return res.status(400).json({ error: "endpointId is required" });
  }

  const vars = sampleVars && typeof sampleVars === "object" ? sampleVars : {};
  const now = new Date();

  const campaignId = vars.campaign?.campaignid ?? vars.campaign?.id ?? null;
  const sessionId = vars.session?.campaignsessionid ?? vars.session?.id ?? null;
  const contactId = vars.contact?.contactid ?? vars.contact?.id ?? null;

  try {
    const result = await dispatchEndpoint(apiId, vars);
    const formatted =
      result?.payload && typeof result.payload.formattedText === "string"
        ? result.payload.formattedText
        : null;

    try {
      await prisma.api_log.create({
        data: {
          api_id: apiId,
          campaign_id: campaignId,
          campaign_session_id: sessionId,
          contact_id: contactId,
          request_url: result.url || null,
          request_body: result.requestBody ?? null,
          response_body: typeof result.payload === "string" ? result.payload : JSON.stringify(result.payload),
          response_code: result.status,
          status: "success",
          error_message: null,
          called_at: now,
        },
      });
    } catch (logErr) {
      console.warn("[integration:test] failed to write api_log:", logErr?.message || logErr);
    }

    const responseJson = {
      raw: result.payload ?? null,
      formatted,
    };
    return res.status(200).json({
      ok: true,
      status: result.status,
      timeMs: result.duration,
      duration: result.duration,
      responseJson,
      raw: responseJson.raw,
      formatted: responseJson.formatted,
    });
  } catch (err) {
    console.error("[integration:test] dispatch error", err);

    try {
      await prisma.api_log.create({
        data: {
          api_id: apiId,
          campaign_id: campaignId,
          campaign_session_id: sessionId,
          contact_id: contactId,
          request_url: null,
          request_body: null,
          response_body: null,
          response_code: 500,
          status: "error",
          error_message: err?.message || "Unknown error",
          called_at: now,
        },
      });
    } catch (logErr) {
      console.warn("[integration:test] failed to write api_log for error:", logErr?.message || logErr);
    }

    return res.status(500).json({
      ok: false,
      status: 500,
      timeMs: 0,
      errorMessage: err?.message || "Failed to execute test",
      error: err?.message || "Failed to execute test",
    });
  }
}

export async function dispatchMapping(req, res) {
  const { mappingId, vars = {} } = req.body || {};
  if (!mappingId) {
    return res.status(400).json({ error: "mappingId is required" });
  }
  const mapping = getMapping(mappingId);
  if (!mapping) return res.status(404).json({ error: "Mapping not found" });
  const runtimeVars = materializeVariables(vars, mapping.paramMap);
  const attempts = Math.max(1, mapping.retry?.enabled ? Number(mapping.retry?.count || 1) : 1);

  const campaignId = runtimeVars.campaign?.campaignid ?? runtimeVars.campaign?.id ?? null;
  const sessionId = runtimeVars.session?.campaignsessionid ?? runtimeVars.session?.id ?? null;
  const contactId = runtimeVars.contact?.contactid ?? runtimeVars.contact?.id ?? null;
  const numericEndpointId = mapping.endpointId != null ? Number(mapping.endpointId) || null : null;

  try {
    let result;
    for (let i = 0; i < attempts; i += 1) {
      try {
        result = await dispatchEndpoint(mapping.endpointId, runtimeVars);
        break;
      } catch (err) {
        if (i === attempts - 1) throw err;
      }
    }
    const formatted =
      result?.payload && typeof result.payload.formattedText === "string"
        ? result.payload.formattedText
        : null;

    try {
      await prisma.api_log.create({
        data: {
          api_id: numericEndpointId,
          campaign_id: campaignId,
          campaign_session_id: sessionId,
          contact_id: contactId,
          request_url: result.url || null,
          request_body:
            result.requestBody == null
              ? null
              : typeof result.requestBody === "string"
              ? result.requestBody
              : JSON.stringify(result.requestBody),
          response_body: typeof result.payload === "string" ? result.payload : JSON.stringify(result.payload),
          response_code: result.status,
          status: "success",
          error_message: null,
          called_at: new Date(),
        },
      });
    } catch (logErr) {
      console.warn("[integration:dispatch] failed to write api_log:", logErr?.message || logErr);
    }

    return res.json({
      ok: true,
      status: result.status,
      response: result.payload,
      formatted,
    });
  } catch (err) {
    const now = new Date();

    appendLog({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ts: now.toISOString(),
      level: "error",
      source: "integration:dispatch",
      message: err.message,
      meta: { mappingId, vars },
    });

    try {
      await prisma.api_log.create({
        data: {
          api_id: numericEndpointId,
          campaign_id: campaignId,
          campaign_session_id: sessionId,
          contact_id: contactId,
          request_url: null,
          request_body: null,
          response_body: null,
          response_code: null,
          status: "error",
          error_message: err.message || "Unknown error",
          called_at: now,
        },
      });
    } catch (logErr) {
      console.warn("[integration:dispatch] failed to write api_log for error:", logErr?.message || logErr);
    }

    return res.status(500).json({
      ok: false,
      error: mapping.fallbackMessage || "We're unable to retrieve your data at the moment. Please try again later.",
    });
  }
}

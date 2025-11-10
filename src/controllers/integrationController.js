import {
  appendLog,
  deleteEndpoint,
  deleteMapping,
  deleteResponseTemplate,
  getEndpoint,
  getMapping,
  getResponseTemplate,
  listEndpoints,
  listLogs,
  listMappings,
  listResponseTemplates,
  saveEndpoint,
  saveMapping,
  saveResponseTemplate,
  seedIntegrationData,
} from "../services/integrationStore.js";
import { dispatchEndpoint, materializeVariables, renderResponse, runTest as runTestExecutor } from "../services/integrationService.js";

seedIntegrationData();

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

function normalizeMapping(body, current = {}) {
  return {
    campaignCode: body.campaignCode ?? current.campaignCode ?? "",
    trigger: body.trigger || current.trigger || { type: "keyword", value: "" },
    endpointId: Number(body.endpointId ?? current.endpointId ?? 0),
    paramMap: typeof body.paramMap === "object" && body.paramMap ? body.paramMap : current.paramMap || {},
    templateId: Number(body.templateId ?? current.templateId ?? 0) || undefined,
    fallbackMessage: body.fallbackMessage ?? current.fallbackMessage,
    retry: body.retry || current.retry,
    errorTemplateId: body.errorTemplateId ?? current.errorTemplateId,
  };
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

export function getAllResponseTemplates(req, res) {
  res.json(listResponseTemplates());
}

export function createResponseTemplate(req, res) {
  const payload = saveResponseTemplate({ ...req.body, id: undefined });
  return res.status(201).json(payload);
}

export function updateResponseTemplate(req, res) {
  const current = getResponseTemplate(req.params.id);
  if (!current) return res.status(404).json({ error: "Formatter not found" });
  const payload = saveResponseTemplate({ ...current, ...req.body, id: current.id });
  return res.json(payload);
}

export function removeResponseTemplate(req, res) {
  const success = deleteResponseTemplate(req.params.id);
  if (!success) return res.status(404).json({ error: "Formatter not found" });
  return res.json({ success: true });
}

export function getAllMappings(req, res) {
  res.json(listMappings());
}

export async function createMapping(req, res) {
  const normalized = normalizeMapping(req.body);
  try {
    const endpoint = await getEndpoint(normalized.endpointId);
    if (!endpoint) return res.status(400).json({ error: "Endpoint not found" });
    const payload = saveMapping({ ...normalized, id: undefined });
    return res.status(201).json(payload);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to validate endpoint" });
  }
}

export async function updateMapping(req, res) {
  const current = getMapping(req.params.id);
  if (!current) return res.status(404).json({ error: "Mapping not found" });
  const normalized = normalizeMapping({ ...current, ...req.body }, current);
  try {
    const endpoint = await getEndpoint(normalized.endpointId);
    if (!endpoint) return res.status(400).json({ error: "Endpoint not found" });
    const payload = saveMapping({ ...current, ...normalized, id: current.id });
    return res.json(payload);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to validate endpoint" });
  }
}

export function removeMapping(req, res) {
  const success = deleteMapping(req.params.id);
  if (!success) return res.status(404).json({ error: "Mapping not found" });
  return res.json({ success: true });
}

export function getIntegrationLogs(req, res) {
  const limit = Number(req.query.limit) || 100;
  res.json(listLogs(limit));
}

export async function runTest(req, res) {
  const payload = req.body || {};
  if (!payload.endpointId) {
    return res.status(400).json({ error: "endpointId is required" });
  }
  const result = await runTestExecutor(payload);
  return res.json(result);
}

export async function dispatchMapping(req, res) {
  const { mappingId, vars = {} } = req.body || {};
  if (!mappingId) return res.status(400).json({ error: "mappingId is required" });
  const mapping = getMapping(mappingId);
  if (!mapping) return res.status(404).json({ error: "Mapping not found" });
  const runtimeVars = materializeVariables(vars, mapping.paramMap);
  const attempts = Math.max(1, mapping.retry?.enabled ? Number(mapping.retry?.count || 1) : 1);
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
    const formatted = renderResponse(mapping.templateId, result.payload, runtimeVars);
    return res.json({
      ok: true,
      status: result.status,
      response: result.payload,
      formatted,
    });
  } catch (err) {
    appendLog({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ts: new Date().toISOString(),
      level: "error",
      source: "integration:dispatch",
      message: err.message,
      meta: { mappingId, vars },
    });
    return res.status(500).json({
      ok: false,
      error: mapping.fallbackMessage || "We're unable to retrieve your data at the moment. Please try again later.",
    });
  }
}

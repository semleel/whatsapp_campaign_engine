// src/services/integrationStore.js

import { prisma } from "../config/prismaClient.js";

const mappingStore = new Map();
const BODY_TEMPLATE_KEY = "__body_template";
const logStore = [];
const DEFAULT_LOG_LIMIT = 500;

export function seedIntegrationData() {
  // Legacy integration templates have been removed.
  // Real copy is managed via the content/template tables.
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
    backoffMs: Number(body.backoffMs ?? current.backoffMs ?? 0),
    parameters: normalizeParameters(body.parameters ?? current.parameters ?? []),
  };
}

const buildUrl = (row) => {
  const base = (row.base_url || "").replace(/\/$/, "");
  const path = row.path ? `/${row.path}`.replace(/\/+/g, "/") : "";
  return (base + path).replace(":/", "://");
};

const splitUrl = (url) => {
  try {
    const parsed = new URL(url);
    return {
      base: `${parsed.protocol}//${parsed.host}`,
      path: `${parsed.pathname}${parsed.search}`.replace(/^\//, ""),
    };
  } catch {
    throw new Error("Invalid URL supplied.");
  }
};

const mapKeyValue = (row) => ({
  key: row.key,
  value: row.constant_value || row.value_path || "",
});

function hydrateEndpoint(row, params = []) {
  const headers = params.filter((p) => p.location === "header");
  const query = params.filter((p) => p.location === "query");
  const parameterRows = params.filter((p) => p.location === "parameter");
  const metaRows = params.filter((p) => p.location === "meta");
  const bodyTemplateRow = metaRows.find((p) => p.key === BODY_TEMPLATE_KEY);

  return {
    id: row.api_id,
    api_id: row.api_id,
    name: row.name,
    method: row.method?.toUpperCase() === "POST" ? "POST" : "GET",
    url: buildUrl(row),
    description: row.description || "",
    headers: headers.map(mapKeyValue),
    query: query.map(mapKeyValue),
    bodyTemplate: bodyTemplateRow?.constant_value || "",
    response_template: row.response_template || "",
    auth: {
      type: row.auth_type || "none",
      headerName: row.auth_header_name || undefined,
      tokenRef: row.auth_token || undefined,
    },
    timeoutMs: row.timeout_ms ?? 8000,
    retries: row.retry_enabled ? row.retry_count ?? 0 : 0,
    backoffMs: 0,
    parameters: parameterRows.map((p) => ({
      id: p.param_id,
      key: p.key,
      valueSource: p.value_source || "query",
      value: p.constant_value || p.value_path || "",
      required: !!p.required,
    })),
  };
}

async function fetchParametersForIds(ids) {
  if (!ids.length) return [];
  const rows = await prisma.api_parameter.findMany({
    where: { api_id: { in: ids } },
  });
  return rows;
}

async function fetchParameters(apiId) {
  const rows = await fetchParametersForIds([apiId]);
  return rows.filter((row) => row.api_id === apiId);
}

async function syncParameters(apiId, normalized) {
  await prisma.api_parameter.deleteMany({ where: { api_id: apiId } });
  const rows = [];

  normalized.headers.forEach((header) => {
    if (!header.key) return;
    rows.push({
      api_id: apiId,
      location: "header",
      key: header.key,
      value_source: "constant",
      constant_value: header.value,
    });
  });

  normalized.query.forEach((param) => {
    if (!param.key) return;
    rows.push({
      api_id: apiId,
      location: "query",
      key: param.key,
      value_source: "constant",
      constant_value: param.value,
    });
  });

  normalized.parameters.forEach((param) => {
    rows.push({
      api_id: apiId,
      location: "parameter",
      key: param.key,
      value_source: param.valueSource,
      constant_value: param.value,
      required: param.required,
    });
  });

  if (normalized.bodyTemplate) {
    rows.push({
      api_id: apiId,
      location: "meta",
      key: BODY_TEMPLATE_KEY,
      value_source: "constant",
      constant_value: normalized.bodyTemplate,
    });
  }

  if (rows.length) {
    await prisma.api_parameter.createMany({ data: rows });
  }
}

export async function listEndpoints() {
  const endpoints = await prisma.api.findMany({
    orderBy: { api_id: "asc" },
  });
  if (!endpoints.length) return [];
  const params = await fetchParametersForIds(endpoints.map((row) => row.api_id));
  const grouped = params.reduce((acc, row) => {
    const list = acc.get(row.api_id) || [];
    list.push(row);
    acc.set(row.api_id, list);
    return acc;
  }, new Map());
  return endpoints.map((row) => hydrateEndpoint(row, grouped.get(row.api_id) || []));
}

export async function getEndpoint(id) {
  if (!id) return null;
  const numericId = Number(id);
  if (Number.isNaN(numericId)) return null;
  const row = await prisma.api.findUnique({ where: { api_id: numericId } });
  if (!row) return null;
  const params = await fetchParameters(row.api_id);
  return hydrateEndpoint(row, params);
}

export async function saveEndpoint(data) {
  ensureHttps(data.url);
  const normalized = normalizeEndpointInput(data);
  const { base, path } = splitUrl(normalized.url);
  const payload = {
    name: normalized.name,
    description: normalized.description,
    base_url: base,
    path,
    method: normalized.method,
    auth_type: normalized.auth?.type || "none",
    auth_header_name: normalized.auth?.headerName || "Authorization",
    auth_token: normalized.auth?.tokenRef || null,
    timeout_ms: normalized.timeoutMs,
    retry_enabled: normalized.retries > 0,
    retry_count: normalized.retries,
    last_updated: new Date(),
  };

  let row;
  if (data.id) {
    row = await prisma.api.update({
      where: { api_id: Number(data.id) },
      data: payload,
    });
  } else {
    row = await prisma.api.create({ data: payload });
  }

  await syncParameters(row.api_id, normalized);
  const params = await fetchParameters(row.api_id);
  return hydrateEndpoint(row, params);
}

export async function deleteEndpoint(id) {
  const numericId = Number(id);
  if (Number.isNaN(numericId)) return false;
  await prisma.api_parameter.deleteMany({ where: { api_id: numericId } });
  try {
    await prisma.api.delete({
      where: { api_id: numericId },
    });
    return true;
  } catch (err) {
    if (err.code === "P2025") return false;
    throw err;
  }
}

export function getMapping(id) {
  return mappingStore.get(String(id));
}

export async function appendLog(entry) {
  logStore.unshift(entry);
  if (logStore.length > DEFAULT_LOG_LIMIT) {
    logStore.length = DEFAULT_LOG_LIMIT;
  }

  let responseCode = null;
  if (entry?.meta && typeof entry.meta.status === "number") {
    responseCode = entry.meta.status;
  }
  if (!responseCode && typeof entry?.message === "string") {
    const match = entry.message.match(/status\s+(\d{3})/i);
    if (match) {
      responseCode = Number(match[1]);
    }
  }

  const apiId = entry?.meta?.endpointId ?? entry?.meta?.apiId ?? null;
  const calledAt = entry?.ts ? new Date(entry.ts) : new Date();

  try {
    await prisma.api_log.create({
      data: {
        api_id: apiId ? Number(apiId) : null,
        campaign_id: entry?.meta?.campaignId ?? null,
        campaign_session_id: entry?.meta?.campaignSessionId ?? null,
        contact_id: entry?.meta?.contactId ?? null,
        request_url: entry?.meta?.requestUrl ?? null,
        request_body: entry?.meta?.requestBody ?? null,
        response_body: entry?.meta?.responseBody ?? null,
        response_code: responseCode,
        status:
          entry?.level === "error"
            ? "error"
            : responseCode && responseCode >= 200 && responseCode < 300
              ? "success"
              : entry?.meta?.statusText || null,
        error_message: entry?.error || entry?.message || null,
        called_at: calledAt,
      },
    });
  } catch (err) {
    console.error("[integration] Failed to write api_log:", err);
  }
}

export async function listLogs(limit = 100) {
  const rows = await prisma.api_log.findMany({
    orderBy: { called_at: "desc" },
    take: limit,
    include: {
      api: true,
    },
  });

  return rows.map((row) => ({
    logid: row.log_id,
    apiid: row.api_id,
    campaignid: row.campaign_id,
    campaignsessionid: row.campaign_session_id,
    contactid: row.contact_id,
    request_url: row.request_url,
    request_body: row.request_body,
    response_body: row.response_body,
    response_code: row.response_code,
    status: row.status,
    error_message: row.error_message,
    called_at: row.called_at.toISOString(),
    endpoint: row.request_url || (row.api ? `${row.api.base_url || ""}${row.api.path || ""}` : null),
    status_code: row.response_code,
    method: row.api?.method || null,
    path: row.api?.path || null,
    createdat: row.called_at.toISOString(),
  }));
}

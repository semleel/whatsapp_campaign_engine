// src/controllers/apiEndpointController.js

import prisma from "../config/prismaClient.js";

function lintTemplateTokens(template = "") {
  if (!template) return [];
  return Array.from(template.matchAll(/{{\s*([^}]+)\s*}}/g))
    .map((match) => match[1].trim())
    .filter((token) => {
      if (!token) return false;
      if (token.startsWith("response.")) return false;
      if (token.startsWith("lastAnswer.")) return false;
      return true;
    });
}

function ensureHttps(url) {
  if (!/^https:\/\//i.test(url || "")) {
    throw new Error("URL must start with https://");
  }
}

function normalizeHeaders(rawHeaders) {
  if (!Array.isArray(rawHeaders)) return [];
  return rawHeaders
    .map((row) => ({
      key: String(row?.key || "").trim(),
      value: String(row?.value ?? "").trim(),
    }))
    .filter((row) => row.key);
}

function parseBodyTemplate(raw) {
  if (raw == null) {
    return null;
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) {
      return null;
    }
    try {
      return JSON.parse(trimmed);
    } catch {
      return raw;
    }
  }
  return raw;
}

function normalizeEndpointPayload(body = {}) {
  const trimmedUrl = String(body.url || "").trim();
  ensureHttps(trimmedUrl);

  const authType = String(body.auth_type || "none");
  const cleanHeaders = normalizeHeaders(body.headers_json);
  const bodyTemplate = parseBodyTemplate(body.body_template);
  const responseTemplate =
    typeof body.response_template === "string" ? body.response_template : null;
  return {
    name: String(body.name || "").trim(),
    description:
      body.description != null
        ? String(body.description).trim()
        : null,
    method: String(body.method || "GET").toUpperCase(),
    url: trimmedUrl,
    auth_type: authType,
    auth_header_name:
      authType === "none"
        ? null
        : (String(body.auth_header_name || "Authorization").trim() || "Authorization"),
    auth_token:
      authType === "none"
        ? null
        : String(body.auth_token || "").trim() || null,
    is_active: body.is_active !== undefined ? Boolean(body.is_active) : true,
    headers_json: cleanHeaders,
    body_template: bodyTemplate,
    response_template: responseTemplate,
    last_updated: new Date(),
  };
}

function mapApiToEndpointConfig(row) {
  const headers = Array.isArray(row.headers_json) ? row.headers_json : [];
  const bodyTemplate =
    row.body_template == null
      ? null
      : typeof row.body_template === "string"
        ? row.body_template
        : JSON.stringify(row.body_template, null, 2);

  return {
    apiid: row.api_id,
    name: row.name,
    description: row.description,
    response_template: row.response_template,
    method: (row.method || "GET").toUpperCase(),
    url: row.url,
    auth_type: row.auth_type,
    auth_header_name: row.auth_header_name,
    auth_token: row.auth_token,
    is_active: row.is_active ?? true,
    is_deleted: Boolean(row.is_deleted),
    headers_json: headers,
    body_template: bodyTemplate,
    lastupdated: row.last_updated ? row.last_updated.toISOString() : null,
  };
}

export async function listEndpoints(req, res) {
  try {
    const rows = await prisma.api.findMany({
      where: { is_deleted: false },
      orderBy: { api_id: "asc" },
    });
    const payload = rows.map(mapApiToEndpointConfig);
    return res.json(payload);
  } catch (err) {
    console.error("[integration:endpoints] list error:", err);
    return res.status(500).json({ error: err.message || "Failed to load endpoints" });
  }
}

export async function listArchivedEndpoints(req, res) {
  try {
    const rows = await prisma.api.findMany({
      where: { is_deleted: true },
      orderBy: { last_updated: "desc" },
    });
    const payload = rows.map(mapApiToEndpointConfig);
    return res.json(payload);
  } catch (err) {
    console.error("[integration:endpoints] archived list error:", err);
    return res
      .status(500)
      .json({ error: err.message || "Failed to load archived endpoints" });
  }
}

export async function getEndpoint(req, res) {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "Invalid endpoint id" });
  }

  try {
    const apiRow = await prisma.api.findUnique({
      where: { api_id: id },
    });
    if (!apiRow) {
      return res.status(404).json({ error: "Endpoint not found" });
    }
    if (apiRow.is_deleted) {
      return res.status(404).json({ error: "Endpoint not found" });
    }
    return res.json(mapApiToEndpointConfig(apiRow));
  } catch (err) {
    console.error("[integration:endpoints] get error:", err);
    return res.status(500).json({ error: err.message || "Failed to load endpoint" });
  }
}

export async function createEndpoint(req, res) {
  let normalized;
  try {
    normalized = normalizeEndpointPayload(req.body);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const lintTokens = lintTemplateTokens(normalized.response_template);
  if (lintTokens.length > 0) {
    console.warn(
      "[template:lint] response_template contains fields without response.*",
      { tokens: lintTokens }
    );
  }

  try {
    const created = await prisma.api.create({ data: normalized });
    return res.status(201).json(mapApiToEndpointConfig(created));
  } catch (err) {
    console.error("[integration:endpoints] create error:", err);
    return res.status(500).json({ error: err.message || "Failed to create endpoint" });
  }
}

export async function updateEndpoint(req, res) {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "Invalid endpoint id" });
  }

  try {
    const existing = await prisma.api.findUnique({ where: { api_id: id } });
    if (!existing) {
      return res.status(404).json({ error: "Endpoint not found" });
    }
    if (existing.is_deleted) {
      return res.status(400).json({ error: "Cannot update an archived endpoint" });
    }
  } catch (err) {
    console.error("[integration:endpoints] lookup error:", err);
    return res.status(500).json({ error: err.message || "Failed to load endpoint" });
  }

  let normalized;
  try {
    normalized = normalizeEndpointPayload(req.body);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const lintTokens = lintTemplateTokens(normalized.response_template);
  if (lintTokens.length > 0) {
    console.warn(
      "[template:lint] response_template contains fields without response.*",
      { tokens: lintTokens, apiId: id }
    );
  }

  try {
    const updated = await prisma.api.update({
      where: { api_id: id },
      data: normalized,
    });
    return res.json(mapApiToEndpointConfig(updated));
  } catch (err) {
    console.error("[integration:endpoints] update error:", err);
    return res.status(500).json({ error: err.message || "Failed to update endpoint" });
  }
}

export async function deleteEndpoint(req, res) {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "Invalid endpoint id" });
  }

  try {
    const existing = await prisma.api.findUnique({
      where: { api_id: id },
    });
    if (!existing) {
      return res.status(404).json({ error: "Endpoint not found" });
    }

    await prisma.api.update({
      where: { api_id: id },
      data: {
        is_deleted: true,
        is_active: false,
        last_updated: new Date(),
      },
    });
    return res.json({ success: true });
  } catch (err) {
    console.error("[integration:endpoints] delete error:", err);
    return res.status(500).json({ error: err.message || "Failed to delete endpoint" });
  }
}

export async function restoreEndpoint(req, res) {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "Invalid endpoint id" });
  }

  try {
    const existing = await prisma.api.findUnique({
      where: { api_id: id },
    });
    if (!existing) {
      return res.status(404).json({ error: "Endpoint not found" });
    }
    if (!existing.is_deleted) {
      return res.status(404).json({ error: "Endpoint not archived" });
    }

    const updated = await prisma.api.update({
      where: { api_id: id },
      data: {
        is_deleted: false,
        is_active: false,
        last_updated: new Date(),
      },
    });
    return res.json(mapApiToEndpointConfig(updated));
  } catch (err) {
    console.error("[integration:endpoints] restore error:", err);
    return res.status(500).json({ error: err.message || "Failed to restore endpoint" });
  }
}

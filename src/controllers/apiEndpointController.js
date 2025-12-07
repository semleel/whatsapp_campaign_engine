// src/controllers/apiEndpointController.js

import prisma from "../config/prismaClient.js";

function ensureHttps(baseUrl) {
  if (!/^https:\/\//i.test(baseUrl || "")) {
    throw new Error("Base URL must start with https://");
  }
}

function normalizeEndpointPayload(body = {}) {
  const trimmedBase = (body.base_url || "").trim();
  ensureHttps(trimmedBase);

  const authType = body.auth_type || "none";

  return {
    name: (body.name || "").trim(),
    description: body.description != null ? String(body.description).trim() : null,
    base_url: trimmedBase,
    path: (body.path || "/").trim() || "/",
    method: (body.method || "GET").toUpperCase(),
    auth_type: authType,
    auth_header_name: authType === "none" ? null : (body.auth_header_name || "Authorization").trim(),
    auth_token: authType === "none" ? null : (body.auth_token || "").trim() || null,
    timeout_ms: Number(body.timeout_ms ?? 5000) || 0,
    retry_enabled: Boolean(body.retry_enabled),
    retry_count: body.retry_enabled ? Number(body.retry_count ?? 0) || 0 : 0,
    is_active: body.is_active !== undefined ? Boolean(body.is_active) : true,
    last_updated: new Date(),
  };
}

function normalizeParameters(apiId, list = []) {
  if (!Array.isArray(list)) return [];

  return list
    .map((p) => {
      const valuesource = p.valuesource || "contact";

      return {
        api_id: apiId,
        location: p.location || "query",
        key: (p.key || "").trim(),
        value_source: valuesource,
        value_path: valuesource === "constant" ? null : (p.valuepath || "").trim() || null,
        constant_value: valuesource === "constant" ? (p.constantvalue || "").trim() || null : null,
        required: Boolean(p.required),
      };
    })
    .filter((p) => p.key);
}

function mapApiToEndpointConfig(apiRow, paramRows = []) {
  return {
    apiid: apiRow.api_id,
    name: apiRow.name,
    description: apiRow.description,
    base_url: apiRow.base_url,
    path: apiRow.path,
    method: apiRow.method,
    auth_type: apiRow.auth_type,
    auth_header_name: apiRow.auth_header_name,
    auth_token: apiRow.auth_token,
    timeout_ms: apiRow.timeout_ms,
    retry_enabled: apiRow.retry_enabled,
    retry_count: apiRow.retry_count,
    is_active: apiRow.is_active,
    lastupdated: apiRow.last_updated ? apiRow.last_updated.toISOString() : null,
    parameters: paramRows.map((p) => ({
      paramid: p.param_id,
      apiid: p.api_id,
      location: p.location,
      key: p.key,
      valuesource: p.value_source,
      valuepath: p.value_path,
      constantvalue: p.constant_value,
      required: p.required,
    })),
  };
}

export async function listEndpoints(req, res) {
  try {
    const rows = await prisma.api.findMany({
      orderBy: { api_id: "asc" },
    });

    const payload = rows.map((row) => mapApiToEndpointConfig(row, []));

    return res.json(payload);
  } catch (err) {
    console.error("[integration:endpoints] list error:", err);
    return res.status(500).json({ error: err.message || "Failed to load endpoints" });
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

    const params = await prisma.api_parameter.findMany({
      where: { api_id: id },
      orderBy: { param_id: "asc" },
    });

    const payload = mapApiToEndpointConfig(apiRow, params);
    return res.json(payload);
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

  try {
    const created = await prisma.api.create({
      data: normalized,
    });

    const paramRows = normalizeParameters(created.api_id, req.body.parameters);
    if (paramRows.length > 0) {
      await prisma.api_parameter.createMany({ data: paramRows });
    }

    const payload = mapApiToEndpointConfig(created, paramRows);
    return res.status(201).json(payload);
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

  let normalized;
  try {
    normalized = normalizeEndpointPayload(req.body);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  try {
    const existing = await prisma.api.findUnique({
      where: { api_id: id },
    });
    if (!existing) {
      return res.status(404).json({ error: "Endpoint not found" });
    }

    const paramRows = normalizeParameters(id, req.body.parameters);

    const [updated] = await prisma.$transaction([
      prisma.api.update({
        where: { api_id: id },
        data: normalized,
      }),
      prisma.api_parameter.deleteMany({
        where: { api_id: id },
      }),
      ...(paramRows.length > 0 ? [prisma.api_parameter.createMany({ data: paramRows })] : []),
    ]);

    const payload = mapApiToEndpointConfig(updated, paramRows);
    return res.json(payload);
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
      data: { is_active: false, last_updated: new Date() },
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("[integration:endpoints] delete error:", err);
    return res.status(500).json({ error: err.message || "Failed to delete endpoint" });
  }
}

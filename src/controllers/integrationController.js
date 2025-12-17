// src/controllers/integrationController.js

import { listLogs, seedIntegrationData } from "../services/integrationStore.js";
import {
  dispatchEndpoint,
  generateTemplateFromAI,
} from "../services/integrationService.js";
import prisma from "../config/prismaClient.js";

seedIntegrationData();

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
  const campaignId = vars.campaign?.campaignid ?? vars.campaign?.id ?? null;
  const sessionId =
    vars.session?.campaignsessionid ??
    vars.session?.id ??
    vars.session?.campaign_session_id ??
    null;
  const contactId =
    vars.contact?.contactid ?? vars.contact?.id ?? vars.contact?.contact_id ?? null;
  const now = new Date();
  const logSuccess = async (result) => {
    const formatted =
      result?.payload && typeof result.payload.formattedText === "string"
        ? result.payload.formattedText
        : null;
    await prisma.api_log.create({
      data: {
        api_id: apiId,
        campaign_id: campaignId,
        campaign_session_id: sessionId,
        contact_id: contactId,
        request_url: result.url || null,
        request_body: result.requestBody ?? null,
        response_body:
          typeof result.payload === "string"
            ? result.payload
            : JSON.stringify(result.payload),
        response_code: result.status,
        status: "success",
        error_message: null,
        step_id: null,
        source: "manual_test",
        called_at: now,
      },
    });
    const responseJson = {
      raw: result.payload ?? null,
      formatted,
    };
    return {
      ok: true,
      status: result.status,
      timeMs: result.duration,
      responseJson,
      raw: responseJson.raw,
      formatted: responseJson.formatted,
    };
  };

  const performDispatch = async (varsToUse) =>
    dispatchEndpoint(apiId, varsToUse, {
      log: false,
      source: "manual_test",
    });

  const handleErrorLog = async (err) => {
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
          response_code: err?.status || 500,
          status: "error",
          error_message: err?.message || "Unknown error",
          step_id: null,
          source: "manual_test",
          called_at: now,
        },
      });
    } catch (logErr) {
      console.warn("[integration:test] failed to write api_log for error:", logErr?.message || logErr);
    }
  };

  try {
    const result = await performDispatch(vars);
    const payload = await logSuccess(result);
    return res.status(200).json(payload);
  } catch (err) {
    if (err?.code === "API_DISABLED") {
      return res.status(400).json({
        error: "This API is disabled and cannot be tested.",
      });
    }
    await handleErrorLog(err);
    const errorMessage =
      err?.message || "Remote API call failed while running this endpoint.";
    return res.status(502).json({ error: errorMessage });
  }
}

export async function previewApi(req, res) {
  const id = Number(req.params.id);
  if (!id || Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid API id" });
  }

  try {
    const apiRow = await prisma.api.findUnique({
      where: { api_id: id },
      select: { is_active: true, is_deleted: true },
    });
    if (!apiRow || apiRow.is_deleted) {
      return res.status(404).json({ error: "API not found" });
    }
    if (apiRow.is_active === false) {
      return res.status(400).json({ error: "This API is disabled and cannot be previewed." });
    }
  } catch (err) {
    console.error("[integration:preview] lookup error:", err);
    return res.status(500).json({ error: "Failed to preview API." });
  }

  try {
    const result = await dispatchEndpoint(id, {}, { log: false, source: "preview" });
    const rawData =
      result?.raw ??
      result?.response ??
      result?.payload ??
      null;
    const previewPayload = buildPreviewPayload(rawData);
    return res.status(200).json(previewPayload);
  } catch (err) {
    if (err?.code === "API_DISABLED") {
      return res.status(400).json({
        error: "This API is disabled and cannot be previewed.",
      });
    }
    console.error("[integration:preview] dispatch error", err);
    return res.status(502).json({
      error: err?.message || "Failed to run API preview.",
    });
  }
}

export async function generateTemplate(req, res) {
  const { campaign, step, responseJson, lastAnswer } = req.body || {};

  try {
    const template = await generateTemplateFromAI({
      campaign,
      step,
      responseJson,
      lastAnswer,
    });
    return res.status(200).json({ ok: true, template });
  } catch (err) {
    console.error("[integration:template] generation error", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "Failed to generate template",
    });
  }
}

const MAX_PREVIEW_ITEMS = 25;
const MAX_PREVIEW_KEYS = 25;
const MAX_PREVIEW_STRING_LENGTH = 512;
const MAX_PREVIEW_DEPTH = 5;
const MAX_PREVIEW_BYTES = 200 * 1024;

function buildPreviewPayload(payload) {
  const compacted = compactPreviewValue(payload);
  let serialized = "";
  try {
    serialized = JSON.stringify(compacted);
  } catch {
    serialized = "";
  }

  if (serialized.length && serialized.length > MAX_PREVIEW_BYTES) {
    return {
      data: { message: "Preview trimmed to keep the response small." },
      truncated: true,
    };
  }

  return {
    data: compacted,
    truncated: false,
  };
}

function compactPreviewValue(value, depth = 0, seen = new WeakSet()) {
  if (depth > MAX_PREVIEW_DEPTH) {
    return "...";
  }
  if (value === null || typeof value === "undefined") return value;
  if (typeof value === "string") {
    return value.length > MAX_PREVIEW_STRING_LENGTH
      ? `${value.slice(0, MAX_PREVIEW_STRING_LENGTH)}…`
      : value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value !== "object") {
    return value;
  }
  if (seen.has(value)) {
    return "[Circular]";
  }
  seen.add(value);

  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_PREVIEW_ITEMS).map((item) =>
      compactPreviewValue(item, depth + 1, seen)
    );
    if (value.length > MAX_PREVIEW_ITEMS) {
      items.push(`…+${value.length - MAX_PREVIEW_ITEMS} more items`);
    }
    return items;
  }

  const limited = {};
  const entries = Object.entries(value).slice(0, MAX_PREVIEW_KEYS);
  entries.forEach(([key, child]) => {
    limited[key] = compactPreviewValue(child, depth + 1, seen);
  });
  if (Object.keys(value).length > MAX_PREVIEW_KEYS) {
    limited.__truncated = `+${Object.keys(value).length - MAX_PREVIEW_KEYS} more keys`;
  }
  return limited;
}

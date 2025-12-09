// src/controllers/integrationController.js

import { listLogs, seedIntegrationData } from "../services/integrationStore.js";
import { dispatchEndpoint } from "../services/integrationService.js";
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

  try {
    const result = await dispatchEndpoint(apiId, vars, {
      log: false,
      source: "manual_test",
    });
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
    return res.status(200).json({
      ok: true,
      status: result.status,
      timeMs: result.duration,
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
          step_id: null,
          source: "manual_test",
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

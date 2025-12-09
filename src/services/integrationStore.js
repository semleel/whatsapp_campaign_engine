// src/services/integrationStore.js

import { prisma } from "../config/prismaClient.js";

export function seedIntegrationData() {
  // Legacy integration templates have been removed; nothing to seed here.
}

function deriveResponseCode(entry) {
  if (entry?.meta && typeof entry.meta.status === "number") {
    return entry.meta.status;
  }
  if (entry?.message && typeof entry.message === "string") {
    const match = entry.message.match(/status\s+(\d{3})/i);
    if (match) {
      return Number(match[1]);
    }
  }
  return null;
}

export async function appendLog(entry) {
  const responseCode = deriveResponseCode(entry);
  const status =
    entry?.level === "error"
      ? "error"
      : responseCode && responseCode >= 200 && responseCode < 300
        ? "success"
        : entry?.meta?.statusText || null;
  const calledAt = entry?.ts ? new Date(entry.ts) : new Date();

  try {
    await prisma.api_log.create({
      data: {
        api_id: entry?.meta?.endpointId
          ? Number(entry.meta.endpointId)
          : entry?.meta?.apiId
            ? Number(entry.meta.apiId)
            : null,
        campaign_id: entry?.meta?.campaignId ?? null,
        campaign_session_id: entry?.meta?.campaignSessionId ?? null,
        contact_id: entry?.meta?.contactId ?? null,
        step_id: entry?.meta?.stepId ?? null,
        request_url: entry?.meta?.requestUrl ?? null,
        request_body: entry?.meta?.requestBody ?? null,
        response_body: entry?.meta?.responseBody ?? null,
        response_code: responseCode,
        status,
        error_message: entry?.error || entry?.message || null,
        source: entry?.source || entry?.meta?.source || "internal",
        template_used: entry?.meta?.template ?? entry?.meta?.templateUsed ?? null,
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
      campaign: true,
      contact: true,
    },
  });

  return rows.map((row) => ({
    logid: row.log_id,
    apiid: row.api_id,
    campaignid: row.campaign_id,
    campaignname: row.campaign?.campaign_name ?? null,
    campaignsessionid: row.campaign_session_id,
    contactid: row.contact_id,
    contact_phone: row.contact?.phone_num ?? null,
    request_url: row.request_url,
    request_body: row.request_body,
    response_body: row.response_body,
    response_code: row.response_code,
    status: row.status,
    error_message: row.error_message,
    called_at: row.called_at?.toISOString() ?? new Date().toISOString(),
    endpoint: row.request_url || row.api?.url || null,
    status_code: row.response_code,
    method: row.api?.method || null,
    path: null,
    createdat: row.called_at?.toISOString() ?? null,
    stepid: row.step_id,
    source: row.source,
    template_used: row.template_used,
  }));
}

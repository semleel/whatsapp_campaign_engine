"use client";

// lib/client.ts

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:3000";

const TOKEN_STORAGE_KEY = "auth_token";

function getBearerToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function withBase(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  const base = API_BASE.replace(/\/+$/, "");
  const target = path.replace(/^\/+/, "");
  return `${base}/${target}`;
}

import { getStoredToken, clearStoredSession } from "./auth";

type PrivilegeErrorDetails = {
  error?: string;
  message?: string;
  details?: { action?: string; resource?: string };
  action?: string;
  resource?: string;
};

async function maybeShowPrivilegeAlert(details: PrivilegeErrorDetails | null, status: number) {
  if (typeof window === "undefined" || status !== 403) return;
  try {
    const { showPrivilegeDenied } = await import("./showAlert");
    const action = details?.details?.action || details?.action;
    const resource = details?.details?.resource || details?.resource;
    const message = details?.error || details?.message;
    void showPrivilegeDenied({ action, resource, message });
  } catch (err) {
    console.warn("[client] Failed to show privilege alert", err);
  }
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const url = withBase(path);
  const token = typeof window !== "undefined" ? getStoredToken() : null;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    let details: any = null;
    try {
      details = await res.json();
    } catch {
      // ignore
    }
    if (res.status === 403) {
      void maybeShowPrivilegeAlert(details, res.status);
    }
    if (res.status === 401) {
      // Token missing/expired/revoked; reset client session so the user can log back in cleanly.
      if (typeof window !== "undefined") {
        clearStoredSession();
        // Optional navigation hint; we avoid throwing if push fails.
        try {
          window.location.href = "/login";
        } catch {
          // ignore navigation errors
        }
      }
    }
    const defaultMessage =
      res.status === 403
        ? "You do not have permission to perform this action."
        : `${res.status} ${res.statusText}`;
    const message =
      details?.error ||
      details?.message ||
      defaultMessage;
    throw new Error(message);
  }

  return (await res.json()) as T;
}

function updateApiTemplateRequest(
  apiId: number | string,
  payload: { response_template: string }
) {
  return http<{ ok: boolean; api: any }>(`/api/integration/apis/${apiId}/template`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------
import type {
  EndpointConfig,
  ApiLogEntry,
  WhatsAppConfig,
  TestRunPayload,
  TestRunResult,
  RegionRef,
  CampaignStatusRef,
  CampaignListItem,
  CampaignDetail,
  CampaignCreatePayload,
  CampaignUpdatePayload,
  CampaignWithStepsResponse,
  CampaignStepWithChoices,
  ApiListItem,
  KeywordEntry,
  KeywordListItem,
  KeywordCheckResponse,
  TemplateListItem,
  TemplateDetail,
  TemplatePayload,
  TemplatesOverviewResponse,
  CampaignSession,
  FlowStat,
  ReportSummary,
  SystemCommand,
  FeedbackEntry,
  GenerateTemplatePayload,
  GenerateTemplateResult,
} from "./types";
import type { DeliveryReportRow, ConversationThread } from "./types";

type ListLogsParams = {
  limit?: number;
};

// ------------------------------------------------------------------
// API client
// ------------------------------------------------------------------

export const Api = {
  // =========================================================
  // Reference data (regions, campaign status)
  // =========================================================

  listRegions: () => http<RegionRef[]>("/api/reference/regions"),

  listCampaignStatuses: () =>
    http<CampaignStatusRef[]>("/api/reference/campaignstatus"),

  createRegion: (regionName: string, regionCode: string) =>
    http<{ message: string; region: RegionRef }>("/api/reference/regions", {
      method: "POST",
      body: JSON.stringify({ regionName, regionCode }),
    }),

  // =========================================================
  // Campaigns
  // =========================================================

  listCampaigns: () => http<CampaignListItem[]>("/api/campaign/list"),

  listArchivedCampaigns: () =>
    http<CampaignListItem[]>("/api/campaign/archive"),

  getCampaign: (id: number | string) =>
    http<CampaignDetail>(`/api/campaign/${id}`),

  createCampaign: (payload: CampaignCreatePayload) =>
    http<{ message: string; data: CampaignDetail }>("/api/campaign/create", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateCampaign: (id: number | string, payload: CampaignUpdatePayload) =>
    http<{ message: string }>(`/api/campaign/update/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  archiveCampaign: (id: number | string) =>
    http<{ message: string }>(`/api/campaign/archive/${id}`, {
      method: "PUT",
    }),

  restoreCampaign: (id: number | string) =>
    http<{ message: string }>(`/api/campaign/restore/${id}`, {
      method: "PUT",
    }),

  listApis: () => http<ApiListItem[]>(`/api/integration/apis`),

  // =========================================================
  // Integration → update API response_template
  // =========================================================
  updateApiTemplate: (apiId: number | string, payload: { response_template: string }) =>
    updateApiTemplateRequest(apiId, payload),

  updateResponseTemplate: (apiId: number | string, response_template: string) =>
    updateApiTemplateRequest(apiId, { response_template }),

  getCampaignWithSteps: (id: number | string) =>
    http<CampaignWithStepsResponse>(`/api/campaign/${id}/steps`),

  saveCampaignStep: (campaignId: number | string, payload: Partial<CampaignStepWithChoices>) =>
    http<{ message: string; step: CampaignStepWithChoices }>(`/api/campaign/${campaignId}/steps`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  saveCampaignStepsBulk: (campaignId: number | string, steps: CampaignStepWithChoices[]) =>
    http<CampaignWithStepsResponse>(`/api/campaign/${campaignId}/steps/bulk`, {
      method: "POST",
      body: JSON.stringify({ steps }),
    }),

  deleteCampaignStep: (campaignId: number | string, stepId: number | string) =>
    http<{ message: string }>(`/api/campaign/${campaignId}/steps/${stepId}`, {
      method: "DELETE",
    }),

  saveStepChoices: (
    campaignId: number | string,
    stepId: number | string,
    choices: Array<Partial<{ choice_id: number; choice_code: string; label: string; next_step_id?: number | null; is_correct?: boolean }>>
  ) =>
    http<{ message: string }>(`/api/campaign/${campaignId}/steps/${stepId}/choices`, {
      method: "POST",
      body: JSON.stringify({ choices }),
    }),

  deleteArchivedCampaign: (id: number | string) =>
    http<{ message: string }>(`/api/campaign/archive/${id}`, {
      method: "DELETE",
    }),

  deleteArchivedCampaigns: (ids: Array<number | string>) =>
    http<{ message: string; deleted: number }>(`/api/campaign/archive/bulk-delete`, {
      method: "POST",
      body: JSON.stringify({ ids }),
    }),

  // =========================================================
  // Privileges
  // =========================================================
  getPrivileges: (adminid: number | string) =>
    http<{ adminid: number; privileges: Record<string, { view: boolean; create: boolean; update: boolean; archive: boolean }> }>(
      `/api/privilege/${adminid}`
    ),

  savePrivileges: (
    adminid: number | string,
    privileges: Record<string, { view: boolean; create: boolean; update: boolean; archive: boolean }>
  ) =>
    http<{ success: boolean; count: number }>(`/api/privilege/${adminid}`, {
      method: "PUT",
      body: JSON.stringify({ privileges }),
    }),

  // =========================================================
  // Keywords (keyword table)
  // =========================================================

  listKeywordsByCampaign: (campaignId: number | string) =>
    http<KeywordEntry[]>(`/api/keyword/by-campaign/${campaignId}`),

  listAllKeywords: () =>
    http<KeywordListItem[]>("/api/keyword/list"),

  createKeyword: (value: string, campaignid: number | string) =>
    http<{ message: string; keyword: KeywordEntry }>("/api/keyword/create", {
      method: "POST",
      body: JSON.stringify({ value, campaignid }),
    }),

  deleteKeyword: (keywordId: number | string) =>
    http<{ message: string }>(`/api/keyword/${keywordId}`, {
      method: "DELETE",
    }),

  checkKeywordAvailability: async (value: string) => {
    const token = typeof window !== "undefined" ? getStoredToken() : null;
    const url = withBase(
      `/api/keyword/check?value=${encodeURIComponent(value)}`
    );

    const res = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      cache: "no-store",
    });

    let data: KeywordCheckResponse;

    try {
      const raw = await res.json();

      data = {
        available: Boolean(raw?.available),
        error: raw?.error,
        keywordid: raw?.keywordid,
        campaignid: raw?.campaignid,
        campaignname: raw?.campaignname ?? null,
      };
    } catch {
      data = {
        available: false,
        error: "Invalid server response",
      };
    }

    return {
      ok: res.ok,
      status: res.status,
      data,
    };
  },

  // =========================================================
  // Integration -> EndpointConfig (api table)
  // =========================================================

  listEndpoints: () => http<EndpointConfig[]>("/api/integration/endpoints"),

  getEndpoint: (id: string | number) =>
    http<EndpointConfig>(`/api/integration/endpoints/${id}`),

  createEndpoint: (payload: EndpointConfig) =>
    http<EndpointConfig>("/api/integration/endpoints", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateEndpoint: (id: string | number, payload: EndpointConfig) =>
    http<EndpointConfig>(`/api/integration/endpoints/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  deleteEndpoint: (id: string | number) =>
    http<{ success: true }>(`/api/integration/endpoints/${id}`, {
      method: "DELETE",
    }),

  // =========================================================
  // Integration -> Test Runner helper
  // =========================================================

  runTest: (payload: TestRunPayload) =>
    http<TestRunResult>("/api/integration/test", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  generateTemplate: (payload: GenerateTemplatePayload) =>
    http<GenerateTemplateResult>("/api/integration/generate-template", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // =========================================================
  // Integration -> Logs (api_log)
  // =========================================================

  listLogs: (params: ListLogsParams = {}) => {
    const limit = params.limit ?? 100;
    return http<ApiLogEntry[]>(`/api/integration/logs?limit=${limit}`);
  },

  // =========================================================
  // Reports
  // =========================================================
  listDeliveryReport: (limit = 200) =>
    http<DeliveryReportRow[]>(`/api/report/delivery?limit=${limit}`),
  listFlowStats: () => http<FlowStat[]>(`/api/report/flow`),
  getReportSummary: () => http<ReportSummary>(`/api/report/summary`),

  // Feedback
  listFeedback: (filters: { rating?: "good" | "neutral" | "bad"; hasComment?: boolean } = {}) => {
    const params = new URLSearchParams();
    if (filters.rating) params.append("rating", filters.rating);
    if (filters.hasComment) params.append("hasComment", "true");
    const qs = params.toString();
    return http<{ items: FeedbackEntry[] }>(`/api/feedback${qs ? `?${qs}` : ""}`);
  },

  // Admin/staff
  listAdmins: () =>
    http<
      {
        adminid: number;
        name: string | null;
        email: string;
        role: string | null;
        phonenum?: string | null;
        is_active?: boolean | null;
        createdat?: string | null;
        has_privileges?: boolean;
      }[]
    >("/api/admin"),

  // Conversations
  listConversations: (limit = 100) =>
    http<ConversationThread[]>(`/api/conversation/list?limit=${limit}`),
  sendConversationMessage: (contactId: number | string, text: string) =>
    http<{ success: boolean; provider_msg_id?: string | null }>(
      `/api/conversation/${contactId}/send`,
      {
        method: "POST",
        body: JSON.stringify({
          text,
        }),
      }
    ),

  listSessionsByContact: (contactId: number | string) =>
    http<CampaignSession[]>(`/api/session/by-contact/${contactId}`),

  // =========================================================
  // System -> WhatsApp Integration (whatsapp_config)
  // =========================================================

  getWhatsAppConfig: () =>
    http<WhatsAppConfig>("/api/system/whatsapp-config"),

  updateWhatsAppConfig: (config: WhatsAppConfig) =>
    http<WhatsAppConfig>("/api/system/whatsapp-config", {
      method: "PUT",
      body: JSON.stringify(config),
    }),

  // =========================================================
  // Templates (content)
  // =========================================================

  listTemplates: (
    options: boolean | { includeDeleted?: boolean; status?: string; type?: string; search?: string; lang?: string; contentKey?: string } = {}
  ) => {
    const opts = typeof options === "boolean" ? { includeDeleted: options } : options || {};
    const params = new URLSearchParams();
    if (opts.includeDeleted) params.append("includeDeleted", "true");
    if (opts.status) params.append("status", opts.status);
    if (opts.type) params.append("type", opts.type);
    if (opts.search) params.append("search", opts.search);
    if (opts.lang) params.append("lang", opts.lang);
    if (opts.contentKey) params.append("contentKey", opts.contentKey);
    const qs = params.toString();
    const suffix = qs ? `?${qs}` : "";
    return http<TemplateListItem[]>(`/api/templates${suffix}`);
  },

  getTemplate: (id: number | string, includeDeleted = false) =>
    http<TemplateDetail>(
      `/api/templates/${id}${includeDeleted ? "?includeDeleted=true" : ""}`
    ),

  createTemplate: (payload: TemplatePayload) =>
    http<{ message: string; data: TemplateDetail }>("/api/templates", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateTemplate: (id: number | string, payload: TemplatePayload) =>
    http<{ message: string; data: TemplateDetail }>(`/api/templates/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  setTemplateExpiry: (id: number | string, expiresAt: string) =>
    http<{ message: string }>(`/api/templates/${id}/expire`, {
      method: "POST",
      body: JSON.stringify({ expiresAt }),
    }),

  archiveTemplate: (id: number | string) =>
    http<{ message: string }>(`/api/templates/${id}/archive`, {
      method: "POST",
    }),

  softDeleteTemplate: (id: number | string) =>
    http<{ message: string }>(`/api/templates/${id}/archive`, {
      method: "POST",
    }),

  deleteTemplate: (id: number | string) =>
    http<{ message: string }>(`/api/templates/${id}`, {
      method: "DELETE",
    }),

  getTemplatesOverview: () =>
    http<TemplatesOverviewResponse>("/api/templates/overview"),

  recoverTemplate: (id: number | string) =>
    http<{ message: string }>(`/api/templates/${id}`, {
      method: "PUT",
      body: JSON.stringify({ isdeleted: false, is_deleted: false }),
    }),

  // =========================================================
  // Uploads (Supabase Storage)
  // =========================================================
  uploadAttachment: async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const url = withBase("/api/uploads");
    const token = typeof window !== "undefined" ? getStoredToken() : null;
    const res = await fetch(url, {
      method: "POST",
      body: formData,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) {
      let details: any = null;
      try {
        details = await res.json();
      } catch {
        // ignore
      }
      throw new Error(details?.error || "Upload failed");
    }
    return (await res.json()) as { url: string };
  },

  // =========================================================
  // System Commands
  // =========================================================

  listSystemCommands: () =>
    http<SystemCommand[]>("/api/system/commands"),

  updateSystemCommand: (
    command: string,
    payload: Partial<SystemCommand>
  ) =>
    http<SystemCommand>(
      `/api/system/commands/${encodeURIComponent(command)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    ),

  // =========================================================
  // Sessions (campaignsession)
  // =========================================================
  listSessions: (): Promise<CampaignSession[]> =>
    http<CampaignSession[]>("/api/session/list"),

  getSession: (id: number | string): Promise<CampaignSession> =>
    http<CampaignSession>(`/api/session/${id}`),

  createSession: (payload: { contactid: number; campaignid: number; checkpoint?: string }) =>
    http<CampaignSession>("/api/session/create", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  pauseSession: (id: number | string) =>
    http<{ message: string }>(`/api/session/${id}/pause`, { method: "POST" }),

  resumeSession: (id: number | string) =>
    http<{ message: string }>(`/api/session/${id}/resume`, { method: "POST" }),

  cancelSession: (id: number | string) =>
    http<{ message: string }>(`/api/session/${id}/cancel`, { method: "POST" }),
};

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

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------
import type {
  EndpointConfig,
  CampaignApiMapping,
  ApiLogEntry,
  WhatsAppConfig,
  TestRunPayload,
  TestRunResult,
  RegionRef,
  UserFlowRef,
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
  FlowListItem,
  FlowCreatePayload,
  FlowDefinition,
  FlowUpdatePayload,
  TagItem,
  SystemFlow,
  SystemKeyword,
  CampaignSession,
  SystemFlowActivationRef,
  FlowStatus,
  FlowStat,
  ReportSummary,
  SystemCommand,
} from "./types";
import type { DeliveryReportRow, ConversationThread } from "./types";

// ------------------------------------------------------------------
// API client
// ------------------------------------------------------------------

export const Api = {
  // =========================================================
  // Reference data (regions, userflows, campaign status)
  // =========================================================

  listRegions: () => http<RegionRef[]>("/api/reference/regions"),

  listUserFlows: () => http<UserFlowRef[]>("/api/reference/userflows"),

  listCampaignStatuses: () =>
    http<CampaignStatusRef[]>("/api/reference/campaignstatus"),

  createRegion: (regionName: string, regionCode: string) =>
    http<{ message: string; region: RegionRef }>("/api/reference/regions", {
      method: "POST",
      body: JSON.stringify({ regionName, regionCode }),
    }),

  createUserFlow: (userFlowName: string) =>
    http<{ message: string; userflow: UserFlowRef }>("/api/reference/userflows", {
      method: "POST",
      body: JSON.stringify({ userFlowName }),
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
    let data: KeywordCheckResponse | { error?: string } | null = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { ok: res.ok, status: res.status, data };
  },

  // =========================================================
  // Integration -> EndpointConfig (api + apiparameter)
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
  // Integration -> CampaignApiMapping (campaign_api_mapping)
  // =========================================================

  listMappings: () =>
    http<CampaignApiMapping[]>("/api/integration/mappings"),

  createMapping: (payload: CampaignApiMapping) =>
    http<CampaignApiMapping>("/api/integration/mappings", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateMapping: (id: string | number, payload: CampaignApiMapping) =>
    http<CampaignApiMapping>(`/api/integration/mappings/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  deleteMapping: (id: string | number) =>
    http<{ success: true }>(`/api/integration/mappings/${id}`, {
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

  // =========================================================
  // Integration -> Logs (api_log)
  // =========================================================

  listLogs: (limit = 100) =>
    http<ApiLogEntry[]>(`/api/integration/logs?limit=${limit}`),

  // =========================================================
  // Reports
  // =========================================================
  listDeliveryReport: (limit = 200) =>
    http<DeliveryReportRow[]>(`/api/report/delivery?limit=${limit}`),
  listFlowStats: () => http<FlowStat[]>(`/api/report/flow`),
  getReportSummary: () => http<ReportSummary>(`/api/report/summary`),

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

  listTemplates: (includeDeleted = false) =>
    http<TemplateListItem[]>(
      `/api/template/list${includeDeleted ? "?includeDeleted=true" : ""}`
    ),

  getTemplate: (id: number | string) =>
    http<TemplateDetail>(`/api/template/${id}`),

  createTemplate: (payload: TemplatePayload) =>
    http<{ message: string; data: TemplateDetail }>(
      "/api/template/create",
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    ),

  updateTemplate: (id: number | string, payload: TemplatePayload) =>
    http<{ message: string; data: TemplateDetail }>(`/api/template/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  setTemplateExpiry: (id: number | string, expiresAt: string) =>
    http<{ message: string }>(`/api/template/${id}/expire`, {
      method: "POST",
      body: JSON.stringify({ expiresAt }),
    }),

  deleteTemplate: (id: number | string) =>
    http<{ message: string }>(`/api/template/${id}`, {
      method: "DELETE",
    }),


  softDeleteTemplate: (id: number | string) =>
    http<{ message: string }>(`/api/template/${id}/delete`, {
      method: "POST",
    }),

  recoverTemplate: (id: number | string) =>
    http<{ message: string }>(`/api/template/${id}`, {
      method: "PUT",
      body: JSON.stringify({ isdeleted: false }),
    }),

  // =========================================================
  // Tags
  // =========================================================
  listTags: (includeDeleted = false) =>
    http<TagItem[]>(`/api/tags${includeDeleted ? "?includeDeleted=true" : ""}`),

  getTag: (id: number | string) => http<TagItem>(`/api/tags/${id}`),

  createTag: (name: string) =>
    http<{ message: string; data: TagItem }>("/api/tags", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  updateTag: (
    id: number | string,
    payload: { name?: string; isdeleted?: boolean }
  ) =>
    http<{ message: string; data: TagItem }>(`/api/tags/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  archiveTag: (id: number | string) =>
    http<{ message: string; data: TagItem }>(`/api/tags/${id}/archive`, {
      method: "POST",
    }),

  recoverTag: (id: number | string) =>
    http<{ message: string; data: TagItem }>(`/api/tags/${id}/recover`, {
      method: "POST",
    }),

  deleteTag: (id: number | string) =>
    http<{ message: string }>(`/api/tags/${id}`, {
      method: "DELETE",
    }),

  // =========================================================
  // Flow builder (userflow + nodes + rules)
  // =========================================================

  listFlows: () => http<FlowListItem[]>("/api/flow/list"),

  createFlowDefinition: (payload: FlowCreatePayload) =>
    http<{ message: string; userflow: UserFlowRef }>("/api/flow/create", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getFlowDefinition: (id: string | number) =>
    http<FlowDefinition>(`/api/flow/${id}`),

  updateFlowDefinition: (id: string | number, payload: FlowUpdatePayload) =>
    http<{ message: string }>(`/api/flow/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  deleteFlowDefinition: (id: string | number) =>
    http<{ message: string }>(`/api/flow/${id}`, {
      method: "DELETE",
    }),

  updateFlowStatus: (id: string | number, status: FlowStatus) =>
    http<{ message: string; status: FlowStatus }>(`/api/flow/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  // =========================================================
  // System -> System Flows & Keywords
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

  listSystemFlows: () => http<SystemFlow[]>("/api/system/flows"),

  getActiveSystemStartFlow: () =>
    http<SystemFlowActivationRef | null>("/api/system/start-flow"),

  setActiveSystemStartFlow: (userflowid: number) =>
    http<SystemFlowActivationRef>("/api/system/start-flow", {
      method: "POST",
      body: JSON.stringify({ userflowid }),
    }),

  getActiveSystemEndFlow: () =>
    http<SystemFlowActivationRef | null>("/api/system/end-flow"),

  setActiveSystemEndFlow: (userflowid: number) =>
    http<SystemFlowActivationRef>("/api/system/end-flow", {
      method: "POST",
      body: JSON.stringify({ userflowid }),
    }),

  listSystemKeywords: () => http<SystemKeyword[]>("/api/system/keywords"),

  createSystemKeyword: (payload: {
    keyword: string;
    userflowid: number;
    systemflowid?: number | null;
    is_active?: boolean;
  }) =>
    http<SystemKeyword>("/api/system/keywords", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateSystemKeyword: (
    keyword: string,
    payload: {
      keyword?: string;
      userflowid?: number;
      systemflowid?: number | null;
      is_active?: boolean;
    }
  ) =>
    http<SystemKeyword>(`/api/system/keywords/${encodeURIComponent(keyword)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  deleteSystemKeyword: (keyword: string) =>
    http<{ ok: boolean }>(
      `/api/system/keywords/${encodeURIComponent(keyword)}`,
      { method: "DELETE" }
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

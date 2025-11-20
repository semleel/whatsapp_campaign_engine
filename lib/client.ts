const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:3000";

function withBase(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  const base = API_BASE.replace(/\/+$/, "");
  const target = path.replace(/^\/+/, "");
  return `${base}/${target}`;
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const url = withBase(path);
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
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
    const message =
      details?.error ||
      details?.message ||
      `${res.status} ${res.statusText}`;
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
  CampaignSession
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
    const url = withBase(
      `/api/keyword/check?value=${encodeURIComponent(value)}`
    );
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
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

  // Conversations
  listConversations: (limit = 100) =>
    http<ConversationThread[]>(`/api/conversation/list?limit=${limit}`),
  sendConversationMessage: (to: string, text: string) =>
    http("/api/wa/send", {
      method: "POST",
      body: JSON.stringify({
        to,
        message: { type: "text", text: { body: text } },
      }),
    }),

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

  listTemplates: () =>
    http<TemplateListItem[]>("/api/template/list"),

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

  deleteTemplate: (id: number | string) =>
    http<{ message: string }>(`/api/template/${id}`, {
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

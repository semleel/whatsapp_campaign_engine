// app/lib/types.ts

// =============================================
// HTTP & basic enums
// =============================================
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type ApiLocation = "query" | "header" | "body" | "path";
export type ApiValueSource = "contact" | "campaign" | "constant";

export type ApiAuthType = "none" | "bearer_header" | "api_key_header";

// =============================================
// API Layer (maps to tables: api, apiparameter, api_log, campaign_api_mapping)
// =============================================

// apiparameter table
export type ApiParameter = {
    paramid?: number;           // DB: paramid (PK)
    apiid?: number;             // FK to api.apiid

    location: ApiLocation;      // DB: location ('query', 'header', 'body', 'path')
    key: string;                // DB: key

    valuesource: ApiValueSource; // DB: valuesource ('contact', 'campaign', 'constant')
    valuepath?: string | null;   // DB: valuepath (e.g. "phonenum")
    constantvalue?: string | null; // DB: constantvalue

    required?: boolean;          // DB: required
};

// api table
export type EndpointConfig = {
    apiid?: number;                 // DB: apiid (PK)

    name: string;                   // DB: name
    description?: string | null;    // DB: description

    base_url: string;               // DB: base_url
    path: string;                   // DB: path
    method: HttpMethod | string;    // DB: method (varchar(10))

    auth_type: ApiAuthType;         // DB: auth_type
    auth_header_name?: string | null; // DB: auth_header_name
    auth_token?: string | null;     // DB: auth_token (if you choose to store it)

    timeout_ms?: number | null;     // DB: timeout_ms
    retry_enabled?: boolean;        // DB: retry_enabled
    retry_count?: number | null;    // DB: retry_count

    is_active?: boolean;            // DB: is_active
    lastupdated?: string | null;    // DB: lastupdated (ISO string)

    // Joined children:
    parameters?: ApiParameter[];    // from apiparameter
};

// campaign_api_mapping table
export type CampaignApiMapping = {
    mappingid?: number;          // DB: mappingid (PK)

    campaignid: number;          // DB: campaignid (FK to campaign)
    contentkeyid: string;        // DB: contentkeyid (FK to keymapping)

    apiid: number;               // DB: apiid (FK to api)

    success_contentkeyid?: string | null; // DB: success_contentkeyid
    error_contentkeyid?: string | null;   // DB: error_contentkeyid

    is_active?: boolean;         // DB: is_active
};

// api_log table (for viewing logs in UI, if you want)
export interface ApiLogEntry {
    logid: number;                     // DB: logid
    apiid: number | null;
    campaignid: number | null;
    campaignsessionid: number | null;
    contactid: number | null;

    request_url: string | null;
    request_body: string | null;
    response_body: string | null;
    response_code: number | null;

    status: string | null;             // e.g. 'success', 'error', 'timeout'
    error_message: string | null;

    called_at: string;                 // ISO datetime string
}

// Delivery report row (message + latest deliverlog)
export interface DeliveryReportRow {
    messageid: number;
    campaign: string | null;
    contact: string | null;
    status: string | null;
    retrycount: number;
    sentAt: string | null;
    provider_msg_id: string | null;
    error_message: string | null;
}

// Conversations (threads from message/history)
export type ConversationStatus = "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED" | "EXPIRED";

export interface ConversationMessage {
    id: string | number;
    author: "customer" | "agent";
    text: string;
    timestamp: string;
}

export interface ConversationThread {
    contactId: number;
    contactName: string;
    phone: string;
    status: ConversationStatus;
    lastMessage: string;
    updatedAt: string;
    campaign?: string | null;
    messages: ConversationMessage[];
}

export interface SendMessageResponse {
    success: boolean;
    provider_msg_id?: string | null;
    details?: any;
}

// =============================================
// Flow / content side (if you want types for UI later)
// (Optional – you can add more as needed)
// =============================================
export interface ContentTemplate {
    contentid: number;
    type?: string | null;
    category?: string | null;
    title?: string | null;
    status?: string | null;
    lang?: string | null;
    body: string;
    placeholders?: Record<string, unknown> | null;
    description?: string | null;
    mediaurl?: string | null;
    createdat?: string;
    updatedat?: string | null;
    expiresat?: string | null;
    isdeleted?: boolean;
}

// =============================================
// WhatsApp Config (whatsapp_config table)
// =============================================
export interface WhatsAppConfig {
    id?: number;

    display_name?: string | null;
    phone_number: string;
    phone_number_id: string;
    waba_id?: string | null;

    verify_token: string;
    api_version: string;

    is_active: boolean;
    createdat?: string;
    updatedat?: string | null;
    updatedby_adminid?: number | null;
}

// =============================================
// Legacy / generic things you already had
// (Keep if still used elsewhere in UI)
// =============================================

// You can keep this if you're still using it for generic logs in the UI
export interface LogEntry {
    id: string | number;
    ts: string;             // ISO date
    level: "info" | "warn" | "error";
    source: string;
    message: string;
    meta?: Record<string, unknown>;
}

// Simple test runner for endpoints (frontend tool, not DB)
export interface TestRunPayload {
    endpointId: string | number;
    sampleVars?: Record<string, unknown>;
}

export interface TestRunResult {
    ok: boolean;
    status: number;
    timeMs: number;
    responseJson?: any;
    errorMessage?: string;
}

// =============================================
// Reference data
// =============================================
export interface RegionRef {
    regionid: number;
    regionname: string;
    regioncode?: string | null;
}

export interface UserFlowRef {
    userflowid: number;
    userflowname: string;
}

export interface CampaignStatusRef {
    camstatusid: number | string;
    currentstatus: string;
}

// =============================================
// Campaign types
// =============================================
export interface CampaignListItem {
    campaignid: number;
    campaignname: string;
    objective: string | null;
    regionname: string;
    currentstatus: string;
    status: string;
    camstatusid: number | null;
    start_at?: string | null;
    end_at?: string | null;
}

export interface CampaignDetail {
    campaignid: number;
    campaignname: string;
    objective: string | null;
    targetregionid: number | null;
    status: string | null;
    start_at: string | null;
    end_at: string | null;
    createdat: string;
    updatedat: string | null;
    camstatusid?: number | string | null;
}

export type CampaignCreatePayload = {
    campaignName: string;
    objective?: string | null;
    targetRegionID?: string | number | null;
    status?: string | null;
    startAt?: string | null;
    endAt?: string | null;
};

export type CampaignUpdatePayload = {
    campaignName?: string;
    objective?: string | null;
    targetRegionID?: string | number | null;
    camStatusID?: string | number | null;
    status?: string | null;
    startAt?: string | null;
    endAt?: string | null;
};

// =============================================
// Keyword types
// =============================================
export interface KeywordEntry {
    keywordid: number;
    value: string;
    campaignid: number;
}

export interface KeywordListItem {
    keywordid: number;
    value: string;
    campaignid: number;
    campaignname: string;
}

export interface KeywordCheckResponse {
    available?: boolean;
    error?: string;
    keywordid?: number;
    campaignid?: number;
    campaignname?: string | null;
}

// =============================================
// Template types
// =============================================
export interface TemplateListItem {
    contentid: number;
    title: string;
    type: string;
    status: string;
    defaultlang: string;
    category: string | null;
    currentversion: number | null;
    updatedat?: string | null;
    lastupdated?: string | null;
}

export interface TemplateDetail extends TemplateListItem {
    description?: string | null;
    mediaurl?: string | null;
    body?: string | null;
}

export type TemplatePayload = {
    title: string;
    type: string;
    status: string;
    defaultLang: string;
    category?: string | null;
    description?: string | null;
    mediaUrl?: string | null;
    body?: string | null;
};

// ========================
// Flow list / detail types
// ========================
export interface FlowListItem {
    userflowid: number;
    userflowname: string;
    nodeCount: number;
    entryKey: string | null;
    fallbackKey: string | null;
    status: string;        // e.g. "Active" | "Draft"
    updatedAt: string | null; // ISO string from backend
}

// ========================
// Flow builder types
// ========================
export type FlowBranchRule = {
    input: string;
    next: string;
};

export type FlowNodePayload = {
    key: string;
    type: string;      // 'message' | 'question' | 'api' | 'decision'
    content: string;   // admin description / copy

    // Optional rule config (for create flow)
    allowedInputs?: string[];
    branches?: FlowBranchRule[];
    fallbackKey?: string | null;
};

export type FlowCreatePayload = {
    userflowname: string;
    entryKey: string;
    fallbackKey: string;
    description?: string | null;
    nodes: FlowNodePayload[];
};

export type FlowUpdatePayload = FlowCreatePayload;

export type FlowNodeDefinition = {
    key: string;
    type: string;
    description: string;
    allowedInputs?: string[];
    branches?: FlowBranchRule[];
    fallback?: string | null;
};

export type FlowDefinition = {
    id: number | string;
    name: string;
    entryKey: string;
    fallbackKey: string;
    nodes: FlowNodeDefinition[];
};

// campaign session types
export type SessionStatus = "ACTIVE" | "PAUSED" | "COMPLETED" | "EXPIRED" | "CANCELLED";

export interface CampaignSession {
  id: number;                // campaignsessionid
  contactid?: number | null;
  campaignid?: number | null;
  campaignname?: string | null;
  contact_phonenum?: string | null;
  checkpoint?: string | null;
  status?: SessionStatus;
  createdAt?: string | null;
  lastActiveAt?: string | null;
}

export interface FlowStat {
  campaignid: number | null;
  name: string;
  sessions: number;
  completed: number;
  completionRate: number; // percent (0-100)
}

export interface ReportSummary {
  metrics: {
    messagesLast24: number;
    messagesTotal: number;
    deliveryRate: number;
    activeCampaigns: number;
    deliveries: number;
    deliveriesSuccess: number;
    deliveriesFailed: number;
  };
  trending: Array<{
    campaignid: number | null;
    name: string;
    sent: number;
    delivered: number;
    deliveredRate: number;
  }>;
}

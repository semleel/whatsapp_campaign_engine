// app/lib/types.ts

// =============================================
// HTTP & basic enums
// =============================================
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type ApiAuthType = "none" | "bearer_header" | "api_key_header";

// =============================================
// API Layer (maps to tables: api, api_log)
// =============================================

// api table
export type EndpointConfig = {
    apiid?: number; // DB: api_id (PK)
    name: string; // DB: name
    description: string | null; // DB: description
    response_template?: string | null; // DB: response_template
    method: HttpMethod | string; // DB: method (e.g. 'GET', 'POST')
    url: string; // DB: url (full https://... path)
    auth_type: ApiAuthType; // DB: auth_type
    auth_header_name: string | null; // DB: auth_header_name
    auth_token: string | null; // DB: auth_token
    is_active: boolean; // DB: is_active
    lastupdated?: string | null; // DB: last_updated (ISO string)
    headers_json?: { key: string; value: string }[]; // DB: headers_json
    body_template?: string | null; // DB: body_template (stringified JSON or raw body)
};

// api_log table (for viewing logs in UI, if you want)
export interface ApiLogEntry {
    logid: number; // DB: logid
    apiid: number | null;
    campaignid: number | null;
    campaignsessionid: number | null;
    contactid: number | null;

    campaignname?: string | null;
    contact_phone?: string | null;

    request_url: string | null;
    request_body: string | null;
    response_body: string | null;
    response_code: number | null;

    status: string | null; // e.g. 'success', 'error', 'timeout'
    error_message: string | null;

    called_at: string; // ISO datetime string
    endpoint?: string | null;
    status_code?: number | string | null;
    method?: string | null;
    path?: string | null;
    createdat?: string | null;

    stepid?: number | null;
    source?: string | null;
    template_used?: string | null;
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
    content_key?: string | null;
    contentkey?: string | null;
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
    /**
     * Nested object from backend:
     * {
     *   raw: any;
     *   formatted?: string | null;
     * }
     */
    responseJson?: any;
    /** Mirror of responseJson.raw for convenience */
    raw?: any;
    /** Mirror of responseJson.formatted for convenience */
    formatted?: any;
    errorMessage?: string;
}

export type GenerateTemplatePayload = {
    campaign?: {
        name?: string | null;
        description?: string | null;
    };
    step?: {
        prompt_text?: string | null;
    };
    responseJson?: any;
    lastAnswer?: string | null;
};

export type GenerateTemplateResult = {
    template: string;
};


// =============================================
// Reference data
// =============================================
export interface RegionRef {
    regionid: number;
    regionname: string;
    regioncode?: string | null;
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
    objective: string | null;
    targetRegionID: string | number | null;
    startAt: string | null;
    endAt: string | null;
};

export type CampaignUpdatePayload = {
    campaignName?: string;
    objective?: string | null;
    targetRegionID?: string | number | null;
    camStatusID?: string | number | null;
    status?: string | null;
    startAt?: string | null;
    endAt?: string | null;
    is_active?: boolean | null;
};

// Campaign engine enums/types
export type ActionType = "message" | "choice" | "input" | "api" | "end";
export type ExpectedInput = "none" | "choice" | "text" | "number" | "email" | "location";
export type InputType = "text" | "number" | "email" | "location";
export type ValidationMode = "none" | "numeric" | "email";

export type CampaignStep = {
    step_id: number;
    client_id?: number;
    campaign_id: number;
    step_number: number;
    step_code: string | null;
    prompt_text: string;
    error_message: string | null;
    expected_input: ExpectedInput;
    action_type: ActionType;
    api_id: number | null;
    next_step_id: number | null;
    failure_step_id: number | null;
    is_end_step: boolean;
    media_url?: string | null;
    template_source_id?: number | null;
    template?: TemplateDetail | null;
    next_step_number?: number | null;
    failure_step_number?: number | null;
    updatedat?: string | null;
};

export type CampaignStepChoice = {
    choice_id: number;
    campaign_id: number;
    step_id: number;
    choice_code: string;
    label: string;
    next_step_id: number | null;
    is_correct?: boolean | null;
};

export type CampaignStepWithChoices = CampaignStep & {
    input_type?: InputType | null;
    template?: TemplateDetail | null;
    validation_mode?: ValidationMode;
    campaign_step_choice: CampaignStepChoice[];
};

export type CampaignWithStepsResponse = {
    campaign: CampaignDetail;
    steps: CampaignStepWithChoices[];
};

export type ApiListItem = {
    api_id: number;
    name: string;
    is_active?: boolean | null;
    response_template?: string | null;
};

// =============================================
// Keyword types
// =============================================
export interface KeywordEntry {
    keywordid: number;
    value: string;
    campaignid: number;
    campaignstatus?: string | null;
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
    content_id?: number;
    content_key?: string | null;
    contentkey?: string | null;
    title: string;
    type: string;
    status: string;
    lang?: string | null;
    defaultlang: string;
    category: string | null;
    currentversion: number | null;
    updatedat?: string | null;
    lastupdated?: string | null;
    updated_at?: string | null;
    createdat?: string | null;
    expires_at?: string | null;
    isdeleted?: boolean | null;
    is_deleted?: boolean | null;
    mediaurl?: string | null;
    media_url?: string | null;
    expiresat?: string | null;
    body?: string | null;
    placeholders?: Record<string, unknown> | null;
}

export interface TemplateDetail extends TemplateListItem {
    content_key?: string | null;
    description?: string | null;
    mediaurl?: string | null;
    media_url?: string | null;
    body?: string | null;
    lang?: string | null;
    createdat?: string | null;
    expiresat?: string | null;
    placeholders?: Record<string, unknown> | null;
    headerType?: "none" | "text" | "media" | string | null;
    headerText?: string | null;
    headerMediaType?: string | null;
    interactiveType?: "buttons" | "menu" | string | null;
    buttons?: unknown[] | null;
    menu?: unknown;
    footertext?: string | null;
}

export type TemplatePayload = {
    title: string;
    type: string;
    status: string;
    lang: string;
    content_key?: string | null;
    contentKey?: string | null;
    defaultLang?: string;
    category?: string | null;
    description?: string | null;
    mediaUrl?: string | null;
    media_url?: string | null;
    body?: string | null;
    placeholders?: Record<string, unknown> | null;
    expiresat?: string | null;
    expiresAt?: string | null;
    expires_at?: string | null;
    isdeleted?: boolean | null;
    is_deleted?: boolean | null;
    headerText?: string | null;
    headerType?: string | null;
    headerMediaType?: string | null;
    buttons?: unknown[] | null;
    menu?: unknown;
    interactiveType?: string | null;
};

export interface TemplateOverviewCounts {
    total: number;
    approved: number;
    pendingMeta: number;
    draft: number;
    expired: number;
    rejected: number;
}

export interface TemplateActivityItem {
    id: number;
    title: string;
    status: string | null;
    updatedAt: string | null;
}

export interface TemplateUsageItem {
    id: number;
    title: string;
    status: string | null;
    type: string | null;
    usageCount: number;
}

export interface TemplateExpiryItem {
    id: number;
    title: string;
    status: string | null;
    expiresAt: string | null;
}

export interface TemplatesOverviewResponse {
    counts: TemplateOverviewCounts;
    pipeline: {
        draft: number;
        pendingMeta: number;
        approved: number;
        rejected: number;
        expired: number;
    };
    recent: TemplateActivityItem[];
    mostUsed: TemplateUsageItem[];
    upcomingExpiries: TemplateExpiryItem[];
}

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

// Feedback
export type FeedbackEntry = {
    feedback_id: number;
    contact_id: number | null;
    contact_phone?: string | null;
    contact_name?: string | null;
    campaign_session_id?: number | null;
    rating: number | null;
    comment: string | null;
    created_at?: string | null;
};

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

// =============================================
// System Commands (system_command table)
// =============================================
export type SystemCommand = {
    command: string;
    description: string | null;
    is_enabled: boolean;
    created_at?: string | null;
    updated_at?: string | null;
};

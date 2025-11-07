export type HttpMethod = "GET" | "POST";

export type EndpointConfig = {
    id?: number;
    name: string;
    method: "GET" | "POST";
    url: string;
    headers?: Array<{ key: string; value: string }>;
    query?: Array<{ key: string; value: string }>;
    bodyTemplate?: string; // JSON with {{vars}}
    auth?: { type: "none" | "bearer" | "apiKey"; headerName?: string; tokenRef?: string };
    timeoutMs?: number;
    retries?: number;
    backoffMs?: number;
};


export type MappingRule = {
    id: string;
    campaignCode: string;
    trigger: { type: "keyword" | "button" | "list"; value: string };
    endpointId: number;
    paramMap: Record<string, string>; // { userId: "{{msisdn}}", campaignCode: "{{campaign.code}}" }
    templateId: number;
    errorTemplateId?: number;
    fallbackMessage?: string;
    retry?: { enabled: boolean; count: number };
};

export interface ResponseTemplate {
    id?: string | number;
    name: string;
    body: string;           // e.g. "Hi {{name}}, you have {{points}}"
    locale?: string;        // e.g. "en", "ms"
    variables?: string[];   // ["name","points"]
}

export interface LogEntry {
    id: string | number;
    ts: string;             // ISO date
    level: "info" | "warn" | "error";
    source: string;
    message: string;
    meta?: Record<string, unknown>;
}

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

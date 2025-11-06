async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const details = await res.json().catch(() => ({}));
    throw new Error(details?.error || details?.message || res.statusText);
  }

  return (await res.json()) as T;
}

import type {
  EndpointConfig,
  MappingRule,
  TemplateDef,
  TestRunPayload,
  TestRunResult,
  LogEntry,
} from "./types";

export const Api = {
  // endpoints
  listEndpoints: () => http<EndpointConfig[]>("/api/integration/endpoints"),
  getEndpoint: (id: string | number) =>
    http<EndpointConfig>(`/api/integration/endpoints/${id}`),
  createEndpoint: (e: EndpointConfig) =>
    http<EndpointConfig>("/api/integration/endpoints", {
      method: "POST",
      body: JSON.stringify(e),
    }),
  updateEndpoint: (id: string | number, e: EndpointConfig) =>
    http<EndpointConfig>(`/api/integration/endpoints/${id}`, {
      method: "PUT",
      body: JSON.stringify(e),
    }),
  deleteEndpoint: (id: string | number) =>
    http<{ success: true }>(`/api/integration/endpoints/${id}`, {
      method: "DELETE",
    }),

  // mappings
  listMappings: () => http<MappingRule[]>("/api/integration/mappings"),
  createMapping: (m: MappingRule) =>
    http<MappingRule>("/api/integration/mappings", {
      method: "POST",
      body: JSON.stringify(m),
    }),
  updateMapping: (id: string | number, m: MappingRule) =>
    http<MappingRule>(`/api/integration/mappings/${id}`, {
      method: "PUT",
      body: JSON.stringify(m),
    }),
  deleteMapping: (id: string | number) =>
    http<{ success: true }>(`/api/integration/mappings/${id}`, {
      method: "DELETE",
    }),

  // templates
  listTemplates: () => http<TemplateDef[]>("/api/integration/templates"),
  createTemplate: (t: TemplateDef) =>
    http<TemplateDef>("/api/integration/templates", {
      method: "POST",
      body: JSON.stringify(t),
    }),
  updateTemplate: (id: string | number, t: TemplateDef) =>
    http<TemplateDef>(`/api/integration/templates/${id}`, {
      method: "PUT",
      body: JSON.stringify(t),
    }),
  deleteTemplate: (id: string | number) =>
    http<{ success: true }>(`/api/integration/templates/${id}`, {
      method: "DELETE",
    }),

  // test
  runTest: (payload: TestRunPayload) =>
    http<TestRunResult>("/api/integration/test", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // logs
  listLogs: (limit = 100) => http<LogEntry[]>(`/api/integration/logs?limit=${limit}`),
};

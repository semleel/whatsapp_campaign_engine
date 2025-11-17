"use client";

import { useMemo, useState } from "react";
import type {
  ApiAuthType,
  ApiLocation,
  ApiParameter,
  ApiValueSource,
  EndpointConfig,
  HttpMethod,
} from "@/lib/types";

type Props = {
  initial: EndpointConfig;
  submitting?: boolean;
  onCancel?: () => void;
  onSubmit: (data: EndpointConfig) => Promise<void> | void;
};

const METHOD_OPTIONS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const LOCATION_OPTIONS: ApiLocation[] = ["path", "query", "header", "body"];
const VALUE_SOURCE_OPTIONS: ApiValueSource[] = ["contact", "campaign", "constant"];

function buildUrlPreview(base: string, path: string) {
  const trimmedBase = base.replace(/\/+$/, "");
  const trimmedPath = path ? `/${path.replace(/^\/+/, "")}` : "";
  return `${trimmedBase}${trimmedPath || "/"}`;
}

export default function EndpointForm({ initial, submitting, onCancel, onSubmit }: Props) {
  const [name, setName] = useState(initial.name || "");
  const [description, setDescription] = useState(initial.description || "");
  const [method, setMethod] = useState<HttpMethod>((initial.method as HttpMethod) || "GET");
  const [baseUrl, setBaseUrl] = useState(initial.base_url || "https://");
  const [path, setPath] = useState(initial.path || "/");
  const [authType, setAuthType] = useState<ApiAuthType>(initial.auth_type || "none");
  const [authHeader, setAuthHeader] = useState(initial.auth_header_name || "Authorization");
  const [authToken, setAuthToken] = useState(initial.auth_token || "");
  const [timeoutMs, setTimeoutMs] = useState<number>(initial.timeout_ms ?? 5000);
  const [retryEnabled, setRetryEnabled] = useState(Boolean(initial.retry_enabled));
  const [retryCount, setRetryCount] = useState<number>(initial.retry_count ?? 0);
  const [isActive, setIsActive] = useState(initial.is_active ?? true);
  const [parameters, setParameters] = useState<ApiParameter[]>(initial.parameters || []);

  const urlPreview = useMemo(() => buildUrlPreview(baseUrl, path), [baseUrl, path]);
  const showAuthFields = authType !== "none";

  const handleParamChange = (idx: number, patch: Partial<ApiParameter>) => {
    setParameters((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  const handleRemoveParam = (idx: number) => {
    setParameters((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    const trimmedBase = baseUrl.trim();
    if (!name.trim()) {
      alert("Name is required");
      return;
    }
    if (!/^https:\/\//i.test(trimmedBase)) {
      alert("Base URL must start with https://");
      return;
    }

    const payload: EndpointConfig = {
      ...("apiid" in initial && initial.apiid ? { apiid: initial.apiid } : {}),
      name: name.trim(),
      description: description.trim() || null,
      base_url: trimmedBase,
      path: path.trim() || "/",
      method,
      auth_type: authType,
      auth_header_name: showAuthFields ? authHeader.trim() || "Authorization" : null,
      auth_token: showAuthFields ? authToken.trim() || null : null,
      timeout_ms: Number(timeoutMs) || 0,
      retry_enabled: retryEnabled,
      retry_count: retryEnabled ? Number(retryCount) || 0 : 0,
      is_active: isActive,
      parameters: parameters
        .map((param) => ({
          ...param,
          location: param.location || "query",
          key: (param.key || "").trim(),
          valuesource: param.valuesource || "contact",
          valuepath: param.valuesource === "constant" ? null : (param.valuepath || "").trim() || null,
          constantvalue:
            param.valuesource === "constant" ? (param.constantvalue || "").trim() || null : param.constantvalue || null,
          required: Boolean(param.required),
        }))
        .filter((param) => param.key),
    };

    await onSubmit(payload);
  };

  return (
    <form
      className="space-y-6"
      onSubmit={async (e) => {
        e.preventDefault();
        await handleSubmit();
      }}
    >
      <section className="rounded-xl border p-4 space-y-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Destination API</p>
          <p className="text-sm text-muted-foreground">
            Define how the platform calls the upstream system whenever a campaign node is executed.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm font-medium">
            <span>Name</span>
            <input
              className="w-full rounded-md border px-3 py-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Loyalty balance"
            />
          </label>
          <label className="space-y-1 text-sm font-medium">
            <span>Method</span>
            <select className="w-full rounded-md border px-3 py-2" value={method} onChange={(e) => setMethod(e.target.value as HttpMethod)}>
              {METHOD_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium md:col-span-2">
            <span>Description</span>
            <input
              className="w-full rounded-md border px-3 py-2"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Fetch balance from loyalty core"
            />
          </label>
          <label className="space-y-1 text-sm font-medium">
            <span>Base URL</span>
            <input
              className="w-full rounded-md border px-3 py-2 font-mono text-xs"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.company.com"
            />
          </label>
          <label className="space-y-1 text-sm font-medium">
            <span>Path</span>
            <input
              className="w-full rounded-md border px-3 py-2 font-mono text-xs"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/loyalty/balance"
            />
          </label>
        </div>
        <div className="rounded-lg bg-muted px-3 py-2 text-xs font-mono text-muted-foreground">
          {urlPreview}
        </div>
      </section>

      <section className="rounded-xl border p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Authentication</p>
            <p className="text-xs text-muted-foreground">
              Supports disabled auth, Bearer headers, or custom API-key headers.
            </p>
          </div>
          <select
            className="rounded-md border px-3 py-2 text-sm"
            value={authType}
            onChange={(e) => setAuthType(e.target.value as ApiAuthType)}
          >
            <option value="none">No auth</option>
            <option value="bearer_header">Bearer header</option>
            <option value="api_key_header">API key header</option>
          </select>
        </div>
        {showAuthFields && (
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm font-medium">
              <span>Header name</span>
              <input
                className="w-full rounded-md border px-3 py-2"
                value={authHeader}
                onChange={(e) => setAuthHeader(e.target.value)}
                placeholder="Authorization"
              />
            </label>
            <label className="space-y-1 text-sm font-medium">
              <span>Token / secret</span>
              <input
                className="w-full rounded-md border px-3 py-2"
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
                placeholder="env:LOYALTY_TOKEN"
              />
            </label>
          </div>
        )}
      </section>

      <section className="rounded-xl border p-4 space-y-4">
        <p className="text-sm font-medium">Execution policy</p>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="space-y-1 text-sm font-medium">
            <span>Timeout (ms)</span>
            <input
              type="number"
              className="w-full rounded-md border px-3 py-2"
              value={timeoutMs}
              onChange={(e) => setTimeoutMs(Number(e.target.value))}
              min={1000}
              step={500}
            />
          </label>
          <label className="space-y-1 text-sm font-medium">
            <span>Retry enabled</span>
            <select
              className="w-full rounded-md border px-3 py-2"
              value={retryEnabled ? "yes" : "no"}
              onChange={(e) => setRetryEnabled(e.target.value === "yes")}
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium">
            <span>Retry count</span>
            <input
              type="number"
              className="w-full rounded-md border px-3 py-2"
              value={retryCount}
              onChange={(e) => setRetryCount(Number(e.target.value))}
              min={0}
              disabled={!retryEnabled}
            />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            className="rounded border"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          Endpoint is active
        </label>
      </section>

      <section className="rounded-xl border p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">Parameter mapping</p>
          <button
            type="button"
            className="rounded-md border px-3 py-1 text-sm font-medium"
            onClick={() =>
              setParameters((prev) => [
                ...prev,
                {
                  location: "query",
                  key: "",
                  valuesource: "contact",
                  valuepath: "",
                  constantvalue: "",
                  required: true,
                },
              ])
            }
          >
            Add parameter
          </button>
        </div>
        {parameters.length === 0 && <p className="text-sm text-muted-foreground">No parameters defined.</p>}
        <div className="space-y-3">
          {parameters.map((param, idx) => (
            <div key={param.paramid ?? idx} className="rounded-lg border p-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs uppercase tracking-wide text-muted-foreground">
                <span>Parameter #{idx + 1}</span>
                <button type="button" className="text-rose-600" onClick={() => handleRemoveParam(idx)}>
                  Remove
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <select
                  className="rounded-md border px-3 py-2 text-sm"
                  value={param.location}
                  onChange={(e) => handleParamChange(idx, { location: e.target.value as ApiLocation })}
                >
                  {LOCATION_OPTIONS.map((loc) => (
                    <option key={loc} value={loc}>
                      {loc}
                    </option>
                  ))}
                </select>
                <input
                  className="rounded-md border px-3 py-2 text-sm"
                  placeholder="Key"
                  value={param.key || ""}
                  onChange={(e) => handleParamChange(idx, { key: e.target.value })}
                />
                <select
                  className="rounded-md border px-3 py-2 text-sm"
                  value={param.valuesource}
                  onChange={(e) => handleParamChange(idx, { valuesource: e.target.value as ApiValueSource })}
                >
                  {VALUE_SOURCE_OPTIONS.map((source) => (
                    <option key={source} value={source}>
                      {source}
                    </option>
                  ))}
                </select>
                <label className="inline-flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={Boolean(param.required)}
                    onChange={(e) => handleParamChange(idx, { required: e.target.checked })}
                  />
                  Required
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <input
                  className="rounded-md border px-3 py-2 text-sm font-mono"
                  placeholder="value path (contact.email)"
                  value={param.valuepath || ""}
                  onChange={(e) => handleParamChange(idx, { valuepath: e.target.value })}
                  disabled={param.valuesource === "constant"}
                />
                <input
                  className="rounded-md border px-3 py-2 text-sm font-mono"
                  placeholder="constant value"
                  value={param.constantvalue || ""}
                  onChange={(e) => handleParamChange(idx, { constantvalue: e.target.value })}
                  disabled={param.valuesource !== "constant"}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="flex justify-end gap-3">
        {onCancel && (
          <button
            type="button"
            className="rounded-md border px-4 py-2 text-sm font-medium"
            onClick={() => onCancel()}
            disabled={submitting}
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          disabled={submitting}
        >
          {submitting ? "Saving..." : "Save endpoint"}
        </button>
      </div>
    </form>
  );
}

// components/EndpointForm.tsx

"use client";

import { useState } from "react";
import { Api } from "@/lib/client";
import { showCenteredAlert } from "@/lib/showAlert";
import type { EndpointConfig, HttpMethod, ApiAuthType } from "@/lib/types";

type Props = {
  initial: EndpointConfig;
  submitting?: boolean;
  sampleResponse?: any;
  testingSample?: boolean;
  onRunSample?: () => Promise<void> | void;
  onCancel?: () => void;
  onSubmit: (payload: EndpointConfig) => Promise<void> | void;
  campaign?: { name?: string | null; description?: string | null };
  step?: { prompt_text?: string | null };
  lastAnswer?: string | null;
};

const METHOD_OPTIONS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

function renderTemplatePreview(template: string, payload: any) {
  if (!template) return "";
  return template.replace(/{{\s*([^}]+)\s*}}/g, (_, token) => {
    const path = token.trim().split(".");
    let value: any = payload;
    for (const key of path) {
      if (value == null) break;
      value = value[key];
    }
    return value == null ? `{${token}}` : String(value);
  });
}

function buildPreviewContext(sampleResponse: any, lastAnswer?: string | null) {
  const response =
    sampleResponse && typeof sampleResponse === "object"
      ? sampleResponse
      : sampleResponse != null
        ? { value: sampleResponse }
        : {};
  return {
    lastAnswer: {
      raw: lastAnswer ?? "",
      value: lastAnswer ?? "",
    },
    response,
  };
}

export default function EndpointForm({
  initial,
  submitting,
  sampleResponse,
  testingSample,
  onRunSample,
  onCancel,
  onSubmit,
  campaign,
  step,
  lastAnswer,
}: Props) {
  const [name, setName] = useState(initial.name || "");
  const [description, setDescription] = useState(initial.description ?? "");
  const [method, setMethod] = useState<HttpMethod>(
    (initial.method as HttpMethod) || "GET"
  );
  const [url, setUrl] = useState(initial.url || "https://");
  const [authType, setAuthType] = useState<ApiAuthType>(
    (initial.auth_type as ApiAuthType) || "none"
  );
  const [authHeader, setAuthHeader] = useState(
    initial.auth_header_name || "Authorization"
  );
  const [authToken, setAuthToken] = useState(initial.auth_token || "");
  const [isActive, setIsActive] = useState(initial.is_active ?? true);
  const [headers, setHeaders] = useState<{ key: string; value: string }[]>(
    (initial.headers_json as any) || []
  );
  const [bodyTemplate, setBodyTemplate] = useState(initial.body_template ?? "");
  const [responseTemplate, setResponseTemplate] = useState(
    initial.response_template ?? ""
  );
  const [preview, setPreview] = useState<string | null>(null);
  const [bodyInfo, setBodyInfo] = useState<string | null>(null);
  const [autoGenerating, setAutoGenerating] = useState(false);
  const [autoGenError, setAutoGenError] = useState<string | null>(null);

  const showAuthFields = authType !== "none";
  const showBodySection = ["POST", "PUT", "PATCH"].includes(method);
  const hasSampleJson = Boolean(sampleResponse && typeof sampleResponse === "object");

  const handleAddHeader = () => {
    setHeaders((prev) => [...prev, { key: "", value: "" }]);
  };

  const handleHeaderChange = (
    idx: number,
    field: "key" | "value",
    value: string
  ) => {
    setHeaders((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const handleRemoveHeader = (idx: number) => {
    setHeaders((prev) => prev.filter((_, index) => index !== idx));
  };

  const handleTestTemplate = () => {
    if (!responseTemplate || !sampleResponse) {
      setPreview(
        !responseTemplate
          ? "No template yet."
          : "No sample response available for preview."
      );
      return;
    }

    const ctx = buildPreviewContext(sampleResponse, lastAnswer);

    const rendered = renderTemplatePreview(responseTemplate, ctx);
    setPreview(rendered || "(Rendered template is empty)");
  };

  const handleAutoGenerate = async () => {
    if (!hasSampleJson) {
      setAutoGenError("Auto-generation requires a JSON sample response.");
      return;
    }
    setAutoGenerating(true);
    setAutoGenError(null);
    try {
      const result = await Api.generateTemplate({
        campaign,
        step,
        responseJson: sampleResponse,
        lastAnswer,
      });
      setResponseTemplate(result.template || "");
      setPreview(result.template || "(Auto-generated template returned empty.)");
    } catch (err: any) {
      setAutoGenError(err?.message || "Failed to generate template (Gemini).");
    } finally {
      setAutoGenerating(false);
    }
  };

  const handleValidateBodyJson = async () => {
    setBodyInfo(null);
    const raw = bodyTemplate.trim();
    if (!raw) {
      setBodyInfo("Body is empty - nothing to validate.");
      return;
    }
    try {
      JSON.parse(raw);
      setBodyInfo(
        'Looks like valid JSON. Remember: tokens must be inside quotes, e.g. "{{token}}".'
      );
      await showCenteredAlert("Body template is valid JSON.");
    } catch {
      setBodyInfo(
        "Not valid JSON. If you are using {{tokens}}, ensure they are inside string values."
      );
      await showCenteredAlert(
        'Body template is not valid JSON. Tokens should be inside quotes, e.g. "{{last_answer.lat}}".'
      );
    }
  };

  const handleFormatBodyJson = async () => {
    setBodyInfo(null);
    const raw = bodyTemplate.trim();
    if (!raw) {
      setBodyInfo("Body is empty - nothing to format.");
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      const formatted = JSON.stringify(parsed, null, 2);
      setBodyTemplate(formatted);
      setBodyInfo("Body has been pretty-printed.");
      await showCenteredAlert("Body template formatted as pretty JSON.");
    } catch {
      setBodyInfo(
        "Could not format: body is not valid JSON. Tokens must remain inside quotes."
      );
      await showCenteredAlert(
        "Cannot format: body is not valid JSON. Make sure any {{tokens}} are inside quoted strings."
      );
    }
  };

  const handleSubmit = async () => {
    const trimmedUrl = url.trim();
    if (!name.trim()) {
      await showCenteredAlert("Name is required");
      return;
    }
    if (!/^https:\/\//i.test(trimmedUrl)) {
      await showCenteredAlert("URL must start with https://");
      return;
    }

    const formattedHeaders = headers
      .map((row) => ({ key: row.key.trim(), value: row.value.trim() }))
      .filter((row) => row.key);

    const payload: EndpointConfig = {
      ...("apiid" in initial && (initial as any).apiid
        ? { apiid: (initial as any).apiid }
        : {}),
      name: name.trim(),
      description: description.trim() || null,
      method,
      url: trimmedUrl,
      auth_type: authType,
      auth_header_name:
        authType === "none" ? null : authHeader.trim() || "Authorization",
      auth_token: authType === "none" ? null : authToken.trim() || null,
      is_active: isActive,
      headers_json: formattedHeaders,
      body_template: showBodySection && bodyTemplate ? bodyTemplate : null,
      response_template: responseTemplate || "",
    };

    await onSubmit(payload);
  };

  return (
    <form
      className="space-y-6 max-w-5xl mx-auto"
      onSubmit={async (event) => {
        event.preventDefault();
        await handleSubmit();
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Integration endpoint
          </p>
          <p className="text-sm text-muted-foreground">
            Define how your campaign calls this external API.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5">
            <span
              className={`h-2 w-2 rounded-full ${
                isActive ? "bg-emerald-500" : "bg-slate-400"
              }`}
            />
            {isActive ? "Active" : "Inactive"}
          </span>
          {initial.lastupdated && (
            <span className="hidden sm:inline">
              Last updated:{" "}
              <span className="font-medium">
                {new Date(initial.lastupdated).toLocaleString()}
              </span>
            </span>
          )}
        </div>
      </div>

      <section className="rounded-xl border bg-background p-4 space-y-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Destination API
            </p>
            <p className="text-sm text-muted-foreground">
              Method, URL and description for this reusable endpoint.
            </p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm font-medium">
            <span>Name</span>
            <input
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Weather forecast"
            />
          </label>
          <label className="space-y-1 text-sm font-medium">
            <span>Method</span>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={method}
              onChange={(event) =>
                setMethod(event.target.value as HttpMethod)
              }
            >
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
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Fetch weather forecast from Open-Meteo"
            />
          </label>
          <label className="space-y-1 text-sm font-medium md:col-span-2">
            <span>URL</span>
            <input
              className="w-full rounded-md border bg-background px-3 py-2 font-mono text-xs"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://api.open-meteo.com/v1/forecast?latitude={{last_answer.lat}}&longitude={{last_answer.lon}}"
            />
            <p className="text-[11px] text-muted-foreground">
              Must start with <code className="font-mono">https://</code>. You can
              interpolate variables with{" "}
              <code className="font-mono">{'{{tokens}}'}</code>.
            </p>
          </label>
          <label className="flex items-center gap-2 text-sm font-medium md:col-span-2">
            <input
              type="checkbox"
              className="rounded border"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
            />
            <span>Endpoint is active</span>
          </label>
        </div>
      </section>

      <section className="rounded-xl border bg-background p-4 space-y-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Authentication</p>
            <p className="text-xs text-muted-foreground">
              Choose between no auth, a bearer header, or a custom API key header.
            </p>
          </div>
          <select
            className="rounded-md border bg-background px-3 py-2 text-sm"
            value={authType}
            onChange={(event) =>
              setAuthType(event.target.value as ApiAuthType)
            }
          >
            <option value="none">No auth</option>
            <option value="bearer_header">Bearer header</option>
            <option value="api_key_header">API key header</option>
          </select>
        </div>
        {showAuthFields && (
          <div className="grid gap-4 md:grid-cols-[1.2fr_1.8fr]">
            <label className="space-y-1 text-sm font-medium">
              <span>Header name</span>
              <input
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={authHeader}
                onChange={(event) => setAuthHeader(event.target.value)}
                placeholder="Authorization"
              />
            </label>
            <label className="space-y-1 text-sm font-medium">
              <span>Token / secret</span>
              <input
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={authToken}
                onChange={(event) => setAuthToken(event.target.value)}
                placeholder="env:API_TOKEN"
              />
              <p className="text-[11px] text-muted-foreground">
                You can reference environment variables (e.g.{" "}
                <code className="font-mono">env:API_TOKEN</code>) in your backend.
              </p>
            </label>
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-background p-4 space-y-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Headers</p>
            <p className="text-xs text-muted-foreground">
              Add static headers that should be sent with every request.
            </p>
          </div>
          <button
            type="button"
            className="rounded-md border bg-background px-3 py-1 text-xs font-medium hover:bg-muted"
            onClick={handleAddHeader}
          >
            + Add header
          </button>
        </div>

        {headers.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No headers added yet. Common examples:{" "}
            <code className="font-mono text-[11px]">
              Content-Type: application/json
            </code>{" "}
            or{" "}
            <code className="font-mono text-[11px]">
              X-API-Key: ******
            </code>
            .
          </p>
        )}

        {headers.length > 0 && (
          <div className="hidden text-[11px] font-medium text-muted-foreground md:grid md:grid-cols-[1.2fr_1.8fr_60px] md:gap-2 md:px-1">
            <span>Header name</span>
            <span>Value</span>
            <span className="text-right">Actions</span>
          </div>
        )}

        <div className="space-y-3">
          {headers.map((header, index) => (
            <div
              key={`${header.key}-${index}`}
              className="rounded-lg border bg-muted/40 p-3 space-y-3"
            >
              <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
                <span>Header #{index + 1}</span>
                <button
                  type="button"
                  className="text-rose-600 hover:underline"
                  onClick={() => handleRemoveHeader(index)}
                >
                  Remove
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-[1.2fr_1.8fr] md:items-center">
                <input
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder="Header key (e.g. Content-Type)"
                  value={header.key}
                  onChange={(event) =>
                    handleHeaderChange(index, "key", event.target.value)
                  }
                />
                <input
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder="Header value (e.g. application/json)"
                  value={header.value}
                  onChange={(event) =>
                    handleHeaderChange(index, "value", event.target.value)
                  }
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {showBodySection && (
        <section className="rounded-xl border bg-background p-4 space-y-3 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium">
                Body template (JSON with <code className="font-mono">{'{{tokens}}'}</code>)
              </p>
              <p className="text-xs text-muted-foreground">
                This JSON will be sent as the request body. Reference answer
                variables (e.g., <code className="font-mono">{"{{ lastAnswer.value }}"}</code>)
                or API response tokens to control what is sent.
              </p>
            </div>
            <div className="flex flex-col gap-1 text-[11px] text-muted-foreground items-end">
              <button
                type="button"
                className="rounded border bg-background px-2 py-1 hover:bg-muted"
                onClick={handleValidateBodyJson}
                disabled={submitting}
              >
                Validate JSON
              </button>
              <button
                type="button"
                className="rounded border bg-background px-2 py-1 hover:bg-muted"
                onClick={handleFormatBodyJson}
                disabled={submitting}
              >
                Format JSON
              </button>
            </div>
          </div>
          <textarea
            className="w-full min-h-[180px] rounded-md border bg-background px-3 py-2 font-mono text-xs leading-relaxed"
            value={bodyTemplate}
            onChange={(event) => {
              setBodyTemplate(event.target.value);
              setBodyInfo(null);
            }}
            placeholder='{"latitude":"{{last_answer.lat}}","longitude":"{{last_answer.lon}}"}'
          />
          {bodyInfo && (
            <p className="text-[11px] text-muted-foreground">{bodyInfo}</p>
          )}
        </section>
      )}

      <section className="rounded-xl border bg-background p-4 space-y-4 shadow-sm">
        <div>
          <p className="text-sm font-medium">Response template</p>
          <p className="text-xs text-muted-foreground">
            Controls what the user sees after an API step. Reference any API field
            via <code className="font-mono">{"{{ response.field }}"}</code> or
            refer to the previous answer with{" "}
            <code className="font-mono">{"{{ lastAnswer.value }}"}</code>. The
            auto-generator will infer the needed formatters for you.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              className="rounded-md border px-3 py-1 text-xs font-semibold"
              onClick={handleAutoGenerate}
              disabled={!hasSampleJson || autoGenerating || submitting}
            >
              {autoGenerating ? "Generating..." : "✨ Auto-generate Template"}
            </button>
            <p className="text-[11px] text-muted-foreground">
              AI inserts formatters like <code className="font-mono">|list</code>, <code className="font-mono">|date</code>, and <code className="font-mono">|number</code> automatically; focus on referencing the tokens it provides.
            </p>
          </div>
          <p className="text-[11px] text-muted-foreground">
            If this endpoint is not yet attached to a campaign step, the AI will generate a neutral response template using only the API response and the last user answer.
          </p>
          <p className="text-[11px] text-muted-foreground">
            Gemini free tier may be rate-limited; try again later if you see an error here.
          </p>
          {!hasSampleJson && (
            <p className="text-[11px] text-muted-foreground">
              Capture a JSON response by running the sample test before generating a template.
            </p>
          )}
          {autoGenError && (
            <p className="text-[11px] text-rose-600">{autoGenError}</p>
          )}
        </div>

        <textarea
          className="w-full min-h-[140px] rounded-md border bg-background px-3 py-2 font-mono text-xs leading-relaxed"
          value={responseTemplate}
          onChange={(e) => setResponseTemplate(e.target.value)}
          placeholder={
            "Example: {{ response.status }} — {{ response.message }}\nAdd more tokens once the AI helper inserts them."
          }
        />

        {sampleResponse !== undefined && (
          <div className="grid gap-4 md:grid-cols-2 items-start">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-muted-foreground">
                  Sample API response
                </p>
                {onRunSample && (
                  <button
                    type="button"
                    className="rounded-md border bg-background px-2 py-1 text-[11px] font-medium hover:bg-muted disabled:opacity-60"
                    onClick={() => onRunSample()}
                    disabled={testingSample || submitting}
                  >
                    {testingSample ? "Running..." : "Run & refresh"}
                  </button>
                )}
              </div>
              <div className="rounded-lg border bg-muted/50 p-2 text-[11px] max-h-[240px] overflow-auto">
                {sampleResponse ? (
                  <pre className="whitespace-pre-wrap">
                    {JSON.stringify(sampleResponse, null, 2)}
                  </pre>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No sample yet. Click{" "}
                    <span className="font-semibold">Run &amp; refresh</span> to
                    execute this API once and capture the response.
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">
                Quick preview
              </p>
              <button
                type="button"
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                onClick={handleTestTemplate}
                disabled={submitting}
              >
                Test template with sample
              </button>
              <div className="rounded-md border bg-background px-2 py-2 text-[11px] min-h-[60px] whitespace-pre-wrap">
                {preview ??
                  "Preview will appear here after running a sample API call or auto-generating a template."}
              </div>
            </div>
          </div>
        )}
      </section>

      <div className="sticky bottom-0 mt-6 flex justify-end gap-3 border-t bg-background/80 px-4 py-3 backdrop-blur-sm">
        {onCancel && (
          <button
            type="button"
            className="rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
          disabled={submitting}
        >
          {submitting ? "Saving..." : "Save endpoint"}
        </button>
      </div>
    </form>
  );
}

// components/EndpointForm.tsx

"use client";

import { useState } from "react";
import { Api } from "@/lib/client";
import { showCenteredAlert } from "@/lib/showAlert";
import type { EndpointConfig, HttpMethod, ApiAuthType } from "@/lib/types";

const USER_INPUT_TOKEN = /{{\s*lastAnswer\b/i;

function findMissingResponseTokens(template: string) {
  if (!template) return [];

  const tokens = Array.from(
    template.matchAll(/{{\s*([^}]+)\s*}}/g),
    (m) => m[1].trim()
  );

  return tokens
    .map((token) => {
      if (token.startsWith("lastAnswer.")) return null;
      if (token.startsWith("response.")) return null;

      const [base, ...formatters] = token.split("|");
      const trimmedBase = base.trim();
      if (!trimmedBase) return null;

      const suggestionBase = trimmedBase.includes("response.")
        ? trimmedBase
        : `response.${trimmedBase}`;
      const suggestionFormatter = formatters
        .map((part) => part.trim())
        .filter(Boolean)
        .join(" | ");
      const suggestion = suggestionFormatter
        ? `${suggestionBase} | ${suggestionFormatter}`
        : suggestionBase;

      return {
        token: token,
        suggestion,
      };
    })
    .filter(Boolean) as { token: string; suggestion: string }[];
}

function renderHighlightedTemplate(
  template: string,
  invalidTokens: { token: string }[]
) {
  if (!template) return <span className="text-[11px] text-muted-foreground italic">Template preview</span>;

  const invalidSet = new Set(invalidTokens.map((item) => item.token));
  const regex = /{{\s*([^}]+)\s*}}/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(template)) !== null) {
    const [full, token] = match;
    const start = match.index;
    const end = regex.lastIndex;
    if (start > lastIndex) {
      nodes.push(template.slice(lastIndex, start));
    }
    const cleanToken = token.trim();
    if (invalidSet.has(cleanToken)) {
      nodes.push(
        <span
          key={start}
          className="border-b border-dashed border-red-500 bg-red-50 text-[11px]"
          title="Missing `response.` prefix"
        >
          {full}
        </span>
      );
    } else {
      nodes.push(full);
    }
    lastIndex = end;
  }
  if (lastIndex < template.length) {
    nodes.push(template.slice(lastIndex));
  }

  return (
    <span className="text-[11px] text-muted-foreground whitespace-pre-wrap">
      {nodes}
    </span>
  );
}

type Props = {
  initial: EndpointConfig;
  submitting?: boolean;
  sampleResponse?: any;
  testingSample?: boolean;
  onRunSample?: (sampleVars?: Record<string, unknown>) => Promise<void> | void;
  onCancel?: () => void;
  onSubmit: (payload: EndpointConfig) => Promise<void> | void;
  campaign?: { name?: string | null; description?: string | null };
  step?: { prompt_text?: string | null };
  lastAnswer?: string | null;
};

const METHOD_OPTIONS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

function renderTemplatePreview(template: string, ctx: any) {
  if (!template) return "";

  return template.replace(/{{\s*([^}]+)\s*}}/g, (_, token) => {
    const path = token.trim().split(".");
    let value: any = ctx;

    for (const key of path) {
      if (value == null) return `{${token}}`;
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
  const endpointIsActive = initial.is_active ?? true;
  const [headers, setHeaders] = useState<{ key: string; value: string }[]>(
    (initial.headers_json as any) || []
  );
  const [bodyTemplate, setBodyTemplate] = useState(initial.body_template ?? "");
  const [responseTemplate, setResponseTemplate] = useState(
    initial.response_template ?? ""
  );
  const missingResponseTokens = findMissingResponseTokens(responseTemplate);
  const [preview, setPreview] = useState<string | null>(null);
  const [bodyInfo, setBodyInfo] = useState<string | null>(null);
  const [autoGenerating, setAutoGenerating] = useState(false);
  const [autoGenError, setAutoGenError] = useState<string | null>(null);
  const [simulatedLastAnswer, setSimulatedLastAnswer] = useState("");

  const showAuthFields = authType !== "none";
  const showBodySection = ["POST", "PUT", "PATCH"].includes(method);
  const hasSampleJson = Boolean(sampleResponse && typeof sampleResponse === "object");
  const requiresUserInput =
    USER_INPUT_TOKEN.test(url) ||
    USER_INPUT_TOKEN.test(bodyTemplate);
  const trimmedSimulatedAnswer = simulatedLastAnswer.trim();

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

  const handleRunSampleClick = async () => {
    if (!onRunSample) return;
    const sampleVars = trimmedSimulatedAnswer
      ? { lastAnswer: { value: trimmedSimulatedAnswer } }
      : undefined;
    await onRunSample(sampleVars);
  };

  const handleAutoGenerate = async () => {
    const canAutoGenerate = Boolean(sampleResponse || lastAnswer);
    if (!canAutoGenerate) {
      setAutoGenError(
        "Auto-generation requires a sample response or an example user answer. Run a sample test or provide a last answer."
      );
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
      const message =
        err?.message?.includes("Template generation requires")
          ? "Please capture a sample API response or provide a last answer before auto-generating."
          : err?.message || "Failed to generate template (Gemini).";
      setAutoGenError(message);
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
        'Body template is not valid JSON. Tokens should be inside quotes, e.g. "{{lastAnswer.lat}}".'
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
      is_active: endpointIsActive,
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
              className={`h-2 w-2 rounded-full ${endpointIsActive ? "bg-emerald-500" : "bg-slate-400"
                }`}
            />
            {endpointIsActive ? "Active" : "Inactive"}
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
              placeholder="https://api.example.com/search?q={{ lastAnswer.value }}"
            />
            <p className="text-[11px] text-muted-foreground">
              Must start with <code className="font-mono">https://</code>.
              If this API depends on what the user typed, use{" "}
              <code className="font-mono">{`{{ lastAnswer.value }}`}</code>.
            </p>

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
                JSON body sent to the API.
                You may reference the user’s previous answer using{" "}
                <code className="font-mono">{`{{ lastAnswer.value }}`}</code>.
                All tokens must be inside quotes.
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
            placeholder='{"latitude":"{{lastAnswer.lat}}","longitude":"{{lastAnswer.lon}}"}'
          />
          {bodyInfo && (
            <p className="text-[11px] text-muted-foreground">{bodyInfo}</p>
          )}
        </section>
      )}

      <section className="rounded-xl border bg-background p-4 space-y-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Response template</p>
            <p className="text-xs text-muted-foreground">
              This message is sent back to the user after the API call.
              <br />
              • API data: <code className="font-mono">{`{{ response.field }}`}</code>
              <br />
              • User input: <code className="font-mono">{`{{ lastAnswer.value }}`}</code>
            </p>
          </div>
          {requiresUserInput && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
              Requires user input
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              className="rounded-md border px-3 py-1 text-xs font-semibold"
              onClick={handleAutoGenerate}
              disabled={autoGenerating || submitting}
            >
              {autoGenerating ? "Generating..." : "✨ Auto-generate Template"}
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            AI will generate a WhatsApp-ready message using available API fields and formatters
            like <code className="font-mono">|number</code>,{" "}
            <code className="font-mono">|currency:myr</code>,{" "}
            <code className="font-mono">|list</code>, and{" "}
            <code className="font-mono">|date</code>.
          </p>
          <p className="text-[11px] text-muted-foreground">
            Gemini free tier may be rate-limited; try again later if you see an error here.
          </p>
          <p className="text-[11px] text-muted-foreground">
            Run a sample API call first so the AI knows what fields are available.
          </p>
          {autoGenError && (
            <p className="text-[11px] text-rose-600">{autoGenError}</p>
          )}
        </div>

        <textarea
          className="w-full min-h-[140px] rounded-md border bg-background px-3 py-2 font-mono text-xs leading-relaxed"
          value={responseTemplate}
          onChange={(e) => setResponseTemplate(e.target.value)}
          placeholder={
            "Example: {{ response.status }} — {{ response.message }}"
          }
        />
        {missingResponseTokens.length > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-800">
            <p className="font-semibold">⚠️ Possible template issue</p>
            <p>
              API fields must start with{" "}
              <code className="font-mono">response.</code>
            </p>
            <p className="font-semibold mt-2 text-[12px]">Suggested fixes</p>
            <div className="space-y-1">
              {missingResponseTokens.map(({ token, suggestion }) => (
                <p key={token} className="text-[11px]">
                  <code className="font-mono">{`{{ ${token} }}`}</code>
                  {" → "}
                  <code className="font-mono">{`{{ ${suggestion} }}`}</code>
                </p>
              ))}
            </div>
            <div className="mt-2 rounded-md border border-dashed border-red-300 bg-red-50/70 px-2 py-1 text-[11px] text-red-700">
              {renderHighlightedTemplate(responseTemplate, missingResponseTokens)}
            </div>
          </div>
        )}

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
                    onClick={handleRunSampleClick}
                    disabled={testingSample || submitting}
                  >
                    {testingSample ? "Running..." : "Run & refresh"}
                  </button>
                )}
              </div>
              {requiresUserInput && (
                <label className="space-y-1 text-sm">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Example user input
                  </span>
                  <input
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    placeholder="e.g. cheras"
                    value={simulatedLastAnswer}
                    onChange={(event) => {
                      setSimulatedLastAnswer(event.target.value);
                    }}
                  />
                </label>
              )}
              <div className="rounded-lg border bg-muted/50 p-2 text-[11px] max-h-[240px] overflow-auto">
                {sampleResponse ? (
                  <pre className="whitespace-pre-wrap">
                    {JSON.stringify(sampleResponse, null, 2)}
                  </pre>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No sample yet. Click{" "}
                    <span className="font-semibold">Run &amp; refresh</span> to
                    execute this API and capture the response.
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

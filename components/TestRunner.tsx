// components/TestRunner.tsx

"use client";

import { useMemo, useState } from "react";
import { Api } from "@/lib/client";
import type { EndpointConfig, TestRunResult } from "@/lib/types";
import { showPrivilegeDenied } from "@/lib/showAlert";

function formatUrl(endpoint: EndpointConfig) {
  return endpoint.url || "-";
}

type Props = {
  endpoints: EndpointConfig[];
  initialEndpointId?: string;
  canRun?: boolean;
};

export default function TestRunner({
  endpoints,
  initialEndpointId = "",
  canRun = true,
}: Props) {
  const [endpointId, setEndpointId] = useState(initialEndpointId);
  const [varsText, setVarsText] = useState(
    JSON.stringify(
      {
        lastAnswer: { user_input_raw: "USER_ANSWER" },
        contact: { phonenum: "60123456789" },
        campaign: { code: "CAMPAIGN_KEYWORD" },
      },
      null,
      2
    )
  );
  const [simulatedInput, setSimulatedInput] = useState("USER_ANSWER");
  const [result, setResult] = useState<TestRunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [varsInfo, setVarsInfo] = useState<string | null>(null);

  const endpointOptions = useMemo(
    () => endpoints.filter((ep) => ep.apiid),
    [endpoints]
  );

  const selectedEndpoint = useMemo(
    () => endpointOptions.find((ep) => String(ep.apiid) === endpointId) || null,
    [endpointId, endpointOptions]
  );

  const duration =
    (result as any)?.timeMs ?? (result as any)?.duration ?? 0;

  const payloadToRender =
    result == null
      ? null
      : result.ok
        ? result.responseJson ??
        ("raw" in (result as any)
          ? { raw: (result as any).raw, formatted: (result as any).formatted ?? null }
          : {})
        : {
          error:
            result.errorMessage ||
            (result as any).error ||
            "Failed to execute test",
        };

  // -----------------------
  // Run test
  // -----------------------
  const handleRun = async () => {
    if (!canRun) {
      await showPrivilegeDenied({
        action: "run endpoint tests",
        resource: "Integrations",
      });
      return;
    }

    setError(null);
    setVarsInfo(null);
    setResult(null);

    if (!endpointId) {
      setError("Please select an endpoint first.");
      return;
    }

    let payloadVars = {};
    try {
      payloadVars = varsText ? JSON.parse(varsText) : {};
    } catch {
      setError("Sample variables must be valid JSON.");
      setVarsInfo("Invalid JSON. Check brackets and quotes.");
      return;
    }

    setRunning(true);
    try {
      const res = await Api.runTest({
        endpointId: Number(endpointId),
        sampleVars: payloadVars,
      });
      setResult(res);
    } catch (err: any) {
      setError(err?.message || "Failed to run test");
    } finally {
      setRunning(false);
    }
  };

  // -----------------------
  // JSON helper buttons
  // -----------------------
  const validateJson = () => {
    setVarsInfo(null);
    try {
      JSON.parse(varsText);
      setVarsInfo("Valid JSON.");
    } catch {
      setVarsInfo("Invalid JSON.");
    }
  };

  const formatJson = () => {
    try {
      const parsed = JSON.parse(varsText);
      setVarsText(JSON.stringify(parsed, null, 2));
      setVarsInfo("Formatted.");
    } catch {
      setVarsInfo("Invalid JSON — cannot format.");
    }
  };

  // -----------------------
  // UI
  // -----------------------
  return (
    <div className="space-y-4">
      {/* Top meta section */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Test configuration
          </p>
          <p className="text-xs text-muted-foreground">
            Run this endpoint manually using custom variables.
          </p>
        </div>

        {selectedEndpoint && (
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${selectedEndpoint.is_active
                ? "bg-emerald-50 text-emerald-700"
                : "bg-slate-100 text-slate-700"
                }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${selectedEndpoint.is_active ? "bg-emerald-500" : "bg-slate-400"
                  }`}
              />
              {selectedEndpoint.is_active ? "Active" : "Inactive"}
            </span>

            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-mono">
              {selectedEndpoint.method} ·{" "}
              <span className="max-w-[150px] truncate">
                {formatUrl(selectedEndpoint)}
              </span>
            </span>
          </div>
        )}
      </div>

      {/* Two-column layout */}
      <div className="grid gap-5 lg:grid-cols-[1fr_1fr] items-start">
        {/* Left side — request */}
        <div className="space-y-4">
          <div className="rounded-lg border bg-background p-3">
            <label className="space-y-1 text-sm font-medium">
              <span>Endpoint</span>
              <select
                className="w-full rounded-md border bg-card px-3 py-2 text-sm"
                value={endpointId}
                onChange={(e) => setEndpointId(e.target.value)}
              >
                <option value="">Select endpoint</option>
                {endpointOptions.map((ep) => (
                  <option key={ep.apiid} value={String(ep.apiid)}>
                    {ep.name} [{ep.method}] — {formatUrl(ep)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* JSON vars */}
          <div className="rounded-lg border bg-background p-3 space-y-2">
            <div className="flex justify-between">
              <p className="text-sm font-medium">Sample variables (JSON)</p>
              <div className="flex flex-col items-end text-[11px] gap-1">
                <button
                  className="px-2 py-1 rounded border hover:bg-muted"
                  onClick={validateJson}
                  disabled={running}
                >
                  Validate
                </button>
                <button
                  className="px-2 py-1 rounded border hover:bg-muted"
                  onClick={formatJson}
                  disabled={running}
                >
                  Format
                </button>
              </div>
            </div>

            <label className="space-y-1 text-sm">
              <span>Simulated user answer</span>
              <input
                className="w-full rounded-md border bg-card px-3 py-2 text-sm"
                placeholder="Type what a user would send"
                value={simulatedInput}
                onChange={(event) => {
                  setSimulatedInput(event.target.value);
                  try {
                    const parsed = varsText ? JSON.parse(varsText) : {};
                    const next = {
                      ...parsed,
                      lastAnswer: {
                        ...(parsed.lastAnswer || {}),
                        user_input_raw: event.target.value,
                      },
                    };
                    setVarsText(JSON.stringify(next, null, 2));
                  } catch {
                    // ignore invalid JSON, let user fix manually
                  }
                }}
              />
            </label>

            <textarea
              className="h-48 w-full rounded-md border bg-card px-3 py-2 font-mono text-xs"
              value={varsText}
              onChange={(e) => {
                setVarsText(e.target.value);
                setVarsInfo(null);
                try {
                  const parsed = e.target.value ? JSON.parse(e.target.value) : {};
                  const nextSimulated =
                    typeof parsed?.lastAnswer?.user_input_raw === "string"
                      ? parsed.lastAnswer.user_input_raw
                      : "";
                  setSimulatedInput(nextSimulated);
                } catch {
                  // ignore invalid JSON, let user fix manually
                }
              }}
            />

            {varsInfo && (
              <p className="text-[11px] text-muted-foreground">{varsInfo}</p>
            )}
          </div>

          {/* Run button */}
          <div className="flex items-center gap-3">
            <button
              className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-60 hover:opacity-90"
              disabled={!endpointId || running}
              onClick={handleRun}
            >
              {running ? "Running..." : "Run test"}
            </button>
            {error && <p className="text-sm text-rose-600">{error}</p>}
          </div>
        </div>

        {/* Right side — response */}
        <div className="rounded-lg border bg-background p-3 space-y-3">
          <div className="flex justify-between items-center">
            <p className="text-sm font-medium">Response</p>

            {result && (
              <div className="flex gap-2 text-xs">
                <span
                  className={`px-2 py-0.5 rounded-full font-semibold ${result.ok
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-rose-50 text-rose-700"
                    }`}
                >
                  {result.ok ? "Success" : "Failed"}
                </span>

                <span className="px-2 py-0.5 rounded-full bg-muted">
                  {duration} ms
                </span>
              </div>
            )}
          </div>

          {!result ? (
            <div className="h-48 flex items-center justify-center text-xs text-muted-foreground border border-dashed rounded bg-muted/40 px-2">
              Run a test to see the API response.
            </div>
          ) : (
            <pre className="max-h-96 overflow-auto rounded bg-muted px-3 py-2 text-xs text-wrap">
              {JSON.stringify(payloadToRender ?? {}, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

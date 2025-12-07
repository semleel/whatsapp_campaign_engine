// components/TestRunner.tsx

"use client";

import { useMemo, useState } from "react";
import { Api } from "@/lib/client";
import type { EndpointConfig, TestRunResult } from "@/lib/types";
import { showPrivilegeDenied } from "@/lib/showAlert";

function formatUrl(endpoint: EndpointConfig) {
  const base = endpoint.base_url?.replace(/\/+$/, "") || "";
  const path = endpoint.path ? `/${endpoint.path.replace(/^\/+/, "")}` : "/";
  return `${base}${path}`;
}

type Props = {
  endpoints: EndpointConfig[];
  initialEndpointId?: string;
  canRun?: boolean;
};

export default function TestRunner({ endpoints, initialEndpointId = "", canRun = true }: Props) {
  const [endpointId, setEndpointId] = useState<string>(initialEndpointId);
  const [varsText, setVarsText] = useState(
    JSON.stringify({ contact: { phonenum: "60123456789" }, campaign: { code: "RAYA2025" } }, null, 2)
  );
  const [result, setResult] = useState<TestRunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endpointOptions = useMemo(() => endpoints.filter((endpoint) => endpoint.apiid), [endpoints]);
  const duration = (result as any)?.timeMs ?? (result as any)?.duration ?? 0;
  const payloadToRender =
    result == null
      ? null
      : result.ok
      ? result.responseJson ??
        ("raw" in (result as any)
          ? { raw: (result as any).raw, formatted: (result as any).formatted ?? null }
          : {})
      : {
          error: result.errorMessage || (result as any).error || "Failed to execute test",
        };

  const handleRun = async () => {
    if (!canRun) {
      await showPrivilegeDenied({ action: "run endpoint tests", resource: "Integrations" });
      return;
    }
    setError(null);
    setResult(null);
    let payloadVars: Record<string, unknown> = {};
    try {
      payloadVars = varsText ? JSON.parse(varsText) : {};
    } catch {
      setError("Sample variables must be valid JSON.");
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

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="space-y-2 text-sm font-medium">
          <span>Endpoint</span>
          <select
            className="w-full rounded-md border px-3 py-2 text-sm"
            value={endpointId}
            onChange={(e) => setEndpointId(e.target.value)}
          >
            <option value="">Select endpoint</option>
            {endpointOptions.map((endpoint) => (
              <option key={endpoint.apiid} value={endpoint.apiid}>
                {endpoint.name} [{endpoint.method}] - {formatUrl(endpoint)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2 text-sm font-medium">
          <span>Sample variables (JSON)</span>
          <textarea
            className="h-40 w-full rounded-md border px-3 py-2 font-mono text-xs"
            value={varsText}
            onChange={(e) => setVarsText(e.target.value)}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          disabled={!endpointId || running || !canRun}
          onClick={handleRun}
        >
          {running ? "Running..." : "Run test"}
        </button>
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </div>

      {result && (
        <div className="space-y-3 rounded-xl border p-4 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${result.ok ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                }`}
            >
              {result.ok ? "Success" : "Failed"}
            </span>
            <span>Status: {result.status}</span>
            <span>Duration: {duration} ms</span>
          </div>
          <pre className="max-h-96 overflow-auto rounded-lg bg-muted px-3 py-2 text-xs">
            {JSON.stringify(payloadToRender ?? {}, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

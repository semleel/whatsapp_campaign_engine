"use client";
import { useMemo, useState } from "react";
import { Api } from "@/lib/client";
import type { EndpointConfig, TestRunResult } from "@/lib/types";

export default function TestRunner({ endpoints }: { endpoints: EndpointConfig[] }) {
    const [endpointId, setEndpointId] = useState<string>("");
    const [varsText, setVarsText] = useState<string>('{"mobile":"60123456789","campaignCode":"RAYA2025"}');
    const [result, setResult] = useState<TestRunResult | null>(null);

    const epOptions = useMemo(() => endpoints, [endpoints]);

    return (
        <div className="rounded-xl border p-4 space-y-3">
            <div className="font-medium">Live Test</div>
            <div className="grid md:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium">Endpoint</label>
                    <select
                        className="rounded-md border px-3 py-2"
                        value={endpointId}
                        onChange={e => setEndpointId(e.target.value)}
                    >
                        <option value="">Select endpoint…</option>
                        {epOptions.map(e => (
                            <option key={String(e.id)} value={String(e.id)}>
                                {e.name} [{e.method}]
                            </option>
                        ))}
                    </select>
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium">Sample Variables (JSON)</label>
                    <textarea
                        className="rounded-md border px-3 py-2 h-24"
                        value={varsText}
                        onChange={e => setVarsText(e.target.value)}
                    />
                </div>
            </div>

            <div className="flex gap-2">
                <button
                    disabled={!endpointId}
                    onClick={async () => {
                        setResult(null);
                        try {
                            const vars = varsText ? JSON.parse(varsText) : {};
                            const r = await Api.runTest({ endpointId, sampleVars: vars });
                            setResult(r);
                        } catch (e: any) {
                            setResult({ ok: false, status: 0, timeMs: 0, errorMessage: e?.message || "Failed" });
                        }
                    }}
                    className="px-3 py-2 rounded-md bg-primary text-primary-foreground disabled:opacity-50"
                >
                    Run
                </button>
            </div>

            {result && (
                <div className="rounded-lg border p-3 text-sm">
                    <div className="flex flex-wrap gap-3 mb-2">
                        <span className={`px-2 py-0.5 rounded ${result.ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                            {result.ok ? "OK" : "FAILED"}
                        </span>
                        <span>Status: {result.status}</span>
                        <span>Time: {result.timeMs} ms</span>
                    </div>
                    <pre className="overflow-auto text-xs bg-zinc-50 dark:bg-zinc-900 rounded p-3">
                        {JSON.stringify(result.responseJson ?? { error: result.errorMessage }, null, 2)}
                    </pre>
                </div>
            )}
        </div>
    );
}

"use client";
import { useState } from "react";
import type { EndpointConfig, HttpMethod, ApiParameter } from "@/lib/types";

type Props = {
    initial: EndpointConfig;
    submitting?: boolean;
    onCancel?: () => void;
    onSubmit: (data: EndpointConfig) => Promise<void> | void;
};

type KV = { key: string; value: string };

export default function EndpointForm({ initial, submitting, onCancel, onSubmit }: Props) {
    const [name, setName] = useState(initial.name);
    const [method, setMethod] = useState<HttpMethod>(initial.method);
    const [url, setUrl] = useState(initial.url);
    const [description, setDescription] = useState(initial.description || "");
    const [headers, setHeaders] = useState<KV[]>(initial.headers || []);
    const [query, setQuery] = useState<KV[]>(initial.query || []);
    const [bodyTemplate, setBodyTemplate] = useState(initial.bodyTemplate || "");
    const [authType, setAuthType] = useState<"none" | "bearer" | "apiKey">(initial.auth?.type ?? "none");
    const [authHeaderName, setAuthHeaderName] = useState(initial.auth?.headerName ?? "Authorization");
    const [authTokenRef, setAuthTokenRef] = useState(initial.auth?.tokenRef ?? "");
    const [timeoutMs, setTimeoutMs] = useState<number>(initial.timeoutMs ?? 8000);
    const [retries, setRetries] = useState<number>(initial.retries ?? 0);
    const [backoffMs, setBackoffMs] = useState<number>(initial.backoffMs ?? 300);
    const [parameters, setParameters] = useState<ApiParameter[]>(initial.parameters || []);

    function setKV(list: KV[], i: number, field: "key" | "value", v: string) {
        const next = list.slice();
        next[i] = { ...next[i], [field]: v };
        return next;
    }
    function addKV(list: KV[]) { return [...list, { key: "", value: "" }]; }
    function removeKV(list: KV[], i: number) { return list.filter((_, idx) => idx !== i); }
    function updateParam(i: number, field: keyof ApiParameter, value: string | boolean) {
        setParameters(prev => {
            const next = prev.slice();
            const existing = next[i] || { key: "", value: "", valueSource: "query", required: false };
            next[i] = { ...existing, [field]: value } as ApiParameter;
            return next;
        });
    }
    function addParam() {
        setParameters(prev => [...prev, { key: "", value: "", valueSource: "query", required: true }]);
    }
    function removeParam(i: number) {
        setParameters(prev => prev.filter((_, idx) => idx !== i));
    }

    async function handleSubmit() {
        const payload: EndpointConfig = {
            ...("id" in initial ? { id: initial.id } : {}),
            name,
            method,
            url,
            description,
            headers,
            query,
            bodyTemplate,
            auth: authType === "none" ? { type: "none" } : {
                type: authType,
                headerName: authHeaderName || (authType === "bearer" ? "Authorization" : "X-API-Key"),
                tokenRef: authTokenRef, // e.g. env var name or secure store key
            },
            timeoutMs,
            retries,
            backoffMs,
            parameters,
        };

        // very light validation
        if (!name.trim()) return alert("Name is required.");
        if (!url.trim()) return alert("URL is required.");

        await onSubmit(payload);
    }

    return (
        <div className="space-y-5">
            <div className="rounded-lg border p-4 space-y-3">
                <div className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">API Connector & Dispatcher</div>
                <div className="grid md:grid-cols-2 gap-3">
                    <input className="rounded-md border px-3 py-2" placeholder="Name"
                        value={name} onChange={e => setName(e.target.value)} />
                    <div className="grid grid-cols-2 gap-3">
                        <select className="rounded-md border px-3 py-2"
                            value={method} onChange={e => setMethod(e.target.value as HttpMethod)}>
                            <option value="GET">GET</option>
                            <option value="POST">POST</option>
                        </select>
                        <input className="rounded-md border px-3 py-2" placeholder="Timeout (ms)"
                            type="number" value={timeoutMs}
                            onChange={e => setTimeoutMs(Number(e.target.value || 0))} />
                    </div>
                    <input className="md:col-span-2 rounded-md border px-3 py-2" placeholder="https://api.example.com/path"
                        value={url} onChange={e => setUrl(e.target.value)} />
                    <textarea className="md:col-span-2 rounded-md border px-3 py-2 min-h-20 text-sm"
                        placeholder="Describe what this endpoint does (e.g. Fetch loyalty balance)"
                        value={description}
                        onChange={e => setDescription(e.target.value)} />
                </div>
            </div>

            {/* auth */}
            <div className="rounded-lg border p-3 space-y-3">
                <div className="font-medium text-sm">Secure Communication</div>
                <div className="grid md:grid-cols-3 gap-3">
                    <select className="rounded-md border px-3 py-2"
                        value={authType} onChange={e => setAuthType(e.target.value as any)}>
                        <option value="none">None</option>
                        <option value="bearer">Bearer</option>
                        <option value="apiKey">API Key (custom header)</option>
                    </select>
                    <input className="rounded-md border px-3 py-2" placeholder="Header name"
                        disabled={authType === "none"}
                        value={authHeaderName}
                        onChange={e => setAuthHeaderName(e.target.value)} />
                    <input className="rounded-md border px-3 py-2" placeholder="Token ref (e.g. ENV_WH_KEY)"
                        disabled={authType === "none"}
                        value={authTokenRef}
                        onChange={e => setAuthTokenRef(e.target.value)} />
                </div>
            </div>

            <ParamEditor
                rows={parameters}
                onAdd={addParam}
                onChange={updateParam}
                onRemove={removeParam}
            />

            {/* headers */}
            <KVEditor
                title="Custom Headers (optional overrides)"
                rows={headers}
                onAdd={() => setHeaders(addKV(headers))}
                onChange={(i, field, v) => setHeaders(setKV(headers, i, field, v))}
                onRemove={(i) => setHeaders(removeKV(headers, i))}
            />

            {/* query */}
            <KVEditor
                title="Query Params (advanced)"
                rows={query}
                onAdd={() => setQuery(addKV(query))}
                onChange={(i, field, v) => setQuery(setKV(query, i, field, v))}
                onRemove={(i) => setQuery(removeKV(query, i))}
            />

            {/* POST body template */}
            <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between">
                    <div className="font-medium text-sm">Body Template (JSON with &#123;&#123; placeholders &#125;&#125;)</div>
                    <span className="text-xs text-zinc-500">Used for POST only</span>
                </div>
                <textarea
                    className="w-full h-36 rounded-md border px-3 py-2 font-mono text-xs"
                    placeholder='{"userId":"{{msisdn}}","campaign":"{{campaignCode}}"}'
                    value={bodyTemplate}
                    onChange={e => setBodyTemplate(e.target.value)}
                />
            </div>

            {/* reliability */}
            <div className="rounded-lg border p-3 space-y-3">
                <div className="font-medium text-sm">Retry</div>
                <div className="grid md:grid-cols-3 gap-3">
                    <input className="rounded-md border px-3 py-2" type="number" placeholder="Retries"
                        value={retries} onChange={e => setRetries(Number(e.target.value || 0))} />
                    <input className="rounded-md border px-3 py-2" type="number" placeholder="Backoff (ms)"
                        value={backoffMs} onChange={e => setBackoffMs(Number(e.target.value || 0))} />
                    <div />
                </div>
            </div>

            <div className="flex gap-2">
                {onCancel && (
                    <button type="button" onClick={onCancel} className="px-3 py-2 rounded-md border">
                        Cancel
                    </button>
                )}
                <button
                    type="button"
                    disabled={!!submitting}
                    onClick={handleSubmit}
                    className="px-3 py-2 rounded-md bg-primary text-primary-foreground disabled:opacity-50"
                >
                    {submitting ? "Saving…" : "Save"}
                </button>
            </div>
        </div>
    );
}

function KVEditor({
    title, rows, onAdd, onChange, onRemove,
}: {
    title: string;
    rows: KV[];
    onAdd: () => void;
    onChange: (i: number, field: "key" | "value", v: string) => void;
    onRemove: (i: number) => void;
}) {
    return (
        <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between">
                <div className="font-medium text-sm">{title}</div>
                <button type="button" className="text-sm underline" onClick={onAdd}>Add</button>
            </div>
            {rows.length === 0 ? (
                <div className="text-xs text-zinc-500">No items</div>
            ) : (
                <div className="space-y-2">
                    {rows.map((row, i) => (
                        <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                            <input className="rounded-md border px-3 py-2" placeholder="Key"
                                value={row.key} onChange={e => onChange(i, "key", e.target.value)} />
                            <input className="rounded-md border px-3 py-2" placeholder="Value"
                                value={row.value} onChange={e => onChange(i, "value", e.target.value)} />
                            <button type="button" className="px-2 py-2 rounded-md border" onClick={() => onRemove(i)}>
                                Remove
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

const PARAM_SOURCES = [
    { value: "query", label: "Query" },
    { value: "header", label: "Header" },
    { value: "body", label: "Body" },
    { value: "path", label: "Path" },
    { value: "context", label: "Context" },
];

function ParamEditor({
    rows,
    onAdd,
    onChange,
    onRemove,
}: {
    rows: ApiParameter[];
    onAdd: () => void;
    onChange: (i: number, field: keyof ApiParameter, value: string | boolean) => void;
    onRemove: (i: number) => void;
}) {
    return (
        <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between">
                <div>
                    <div className="font-medium text-sm">Parameter & Header Injection</div>
                    <p className="text-xs text-muted-foreground">Map campaign/runtime variables into API inputs. Matches Supabase apiparameter schema.</p>
                </div>
                <button type="button" className="text-sm underline" onClick={onAdd}>Add</button>
            </div>
            {rows.length === 0 ? (
                <div className="text-xs text-zinc-500">No parameters configured.</div>
            ) : (
                <div className="space-y-2">
                    {rows.map((param, i) => (
                        <div key={i} className="grid md:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                            <select
                                className="rounded-md border px-3 py-2 text-sm"
                                value={param.valueSource}
                                onChange={e => onChange(i, "valueSource", e.target.value as ApiParameter["valueSource"])}
                            >
                                {PARAM_SOURCES.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                            <input
                                className="rounded-md border px-3 py-2"
                                placeholder="Key"
                                value={param.key}
                                onChange={e => onChange(i, "key", e.target.value)}
                            />
                            <input
                                className="rounded-md border px-3 py-2"
                                placeholder='Value (e.g. {{mobile}})'
                                value={param.value}
                                onChange={e => onChange(i, "value", e.target.value)}
                            />
                            <div className="flex items-center gap-2">
                                <label className="flex items-center gap-2 text-xs">
                                    <input
                                        type="checkbox"
                                        checked={!!param.required}
                                        onChange={e => onChange(i, "required", e.target.checked)}
                                    />
                                    Required
                                </label>
                                <button type="button" className="px-2 py-1 rounded-md border text-xs" onClick={() => onRemove(i)}>
                                    Remove
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

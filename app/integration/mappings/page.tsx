"use client";
import { useEffect, useMemo, useState } from "react";
import { Api } from "@/lib/client";
import type { EndpointConfig, ResponseTemplate, MappingRule } from "@/lib/types";

export default function MappingsPage() {
    const [endpoints, setEndpoints] = useState<EndpointConfig[]>([]);
    const [formatters, setFormatters] = useState<ResponseTemplate[]>([]);
    const [rules, setRules] = useState<MappingRule[]>([]);
    const [loading, setLoading] = useState(true);

    // draft aligned to new MappingRule type
    const [draft, setDraft] = useState<MappingRule>({
        id: "", // will be ignored on create
        campaignCode: "",
        trigger: { type: "keyword", value: "" },
        endpointId: 0,
        paramMap: {},
        templateId: 0,
        fallbackMessage: "We’re unable to retrieve your data at the moment. Please try again later.",
        retry: { enabled: false, count: 1 },
    });

    async function refresh() {
        setLoading(true);
        try {
            const [e, t, m] = await Promise.all([
                Api.listEndpoints(), Api.listResponseTemplates(), Api.listMappings()
            ]);
            setEndpoints(e); setFormatters(t); setRules(m);
        } catch {
            setEndpoints([]); setFormatters([]); setRules([]);
        } finally {
            setLoading(false);
        }
    }
    useEffect(() => { refresh(); }, []);

    const endpointById = useMemo(
        () => Object.fromEntries(endpoints.map(e => [String(e.id), e])),
        [endpoints]
    );
    const formatterById = useMemo(
        () => Object.fromEntries(formatters.map(t => [String(t.id), t])),
        [formatters]
    );

    return (
        <div className="space-y-6">
            <h3 className="text-lg font-semibold">Keyword / Button Mappings</h3>

            {/* Create form */}
            <div className="rounded-xl border p-4 space-y-3">
                <div className="grid md:grid-cols-6 gap-3">
                    <input
                        className="rounded-md border px-3 py-2 md:col-span-2"
                        placeholder="Campaign Code (e.g. RAYA2025)"
                        value={draft.campaignCode}
                        onChange={e => setDraft({ ...draft, campaignCode: e.target.value })}
                    />

                    <select
                        className="rounded-md border px-3 py-2"
                        value={draft.trigger.type}
                        onChange={e => setDraft({ ...draft, trigger: { ...draft.trigger, type: e.target.value as any } })}
                    >
                        <option value="keyword">Keyword</option>
                        <option value="button">Button</option>
                        <option value="list">List</option>
                    </select>

                    <input
                        className="rounded-md border px-3 py-2"
                        placeholder="Trigger value (e.g. CHECK_POINTS)"
                        value={draft.trigger.value}
                        onChange={e => setDraft({ ...draft, trigger: { ...draft.trigger, value: e.target.value } })}
                    />

                    <select
                        className="rounded-md border px-3 py-2"
                        value={String(draft.endpointId || "")}
                        onChange={e => setDraft({ ...draft, endpointId: Number(e.target.value) || 0 })}
                    >
                        <option value="">Select endpoint…</option>
                        {endpoints.map(e => (
                            <option key={String(e.id)} value={String(e.id)}>{e.name}</option>
                        ))}
                    </select>

                    <select
                        className="rounded-md border px-3 py-2"
                        value={String(draft.templateId || "")}
                        onChange={e => setDraft({ ...draft, templateId: Number(e.target.value) || 0 })}
                    >
                        <option value="">No formatter</option>
                        {formatters.map(t => (
                            <option key={String(t.id)} value={String(t.id)}>
                                {t.name} {t.locale ? `(${t.locale})` : ""}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Optional param map quick input */}
                <div className="grid md:grid-cols-2 gap-3">
                    <input
                        className="rounded-md border px-3 py-2"
                        placeholder='Param map JSON (e.g. {"userId":"{{msisdn}}","campaignCode":"{{campaign.code}}"})'
                        onChange={(e) => {
                            try {
                                const obj = JSON.parse(e.target.value || "{}");
                                setDraft({ ...draft, paramMap: obj });
                            } catch { /* ignore typing errors */ }
                        }}
                    />
                    <input
                        className="rounded-md border px-3 py-2"
                        placeholder="Fallback message (optional)"
                        value={draft.fallbackMessage || ""}
                        onChange={e => setDraft({ ...draft, fallbackMessage: e.target.value })}
                    />
                </div>

                <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={!!draft.retry?.enabled}
                            onChange={e => setDraft({ ...draft, retry: { enabled: e.target.checked, count: draft.retry?.count ?? 1 } })}
                        />
                        Retry on failure
                    </label>
                    <button
                        className="px-3 py-2 rounded-md bg-primary text-primary-foreground"
                        onClick={async () => {
                            await Api.createMapping({
                                ...draft,
                                // backend will generate id; send without empty string
                                id: undefined as unknown as string,
                            });
                            setDraft({
                                id: "",
                                campaignCode: "",
                                trigger: { type: "keyword", value: "" },
                                endpointId: 0,
                                paramMap: {},
                                templateId: 0,
                                fallbackMessage: "We’re unable to retrieve your data at the moment. Please try again later.",
                                retry: { enabled: false, count: 1 },
                            });
                            await refresh();
                        }}
                    >
                        Add Mapping
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="rounded-xl border overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-zinc-50 dark:bg-zinc-900">
                        <tr>
                            <th className="text-left px-3 py-2">Campaign</th>
                            <th className="text-left px-3 py-2">Trigger</th>
                            <th className="text-left px-3 py-2">Endpoint</th>
                            <th className="text-left px-3 py-2">Formatter</th>
                            <th className="text-right px-3 py-2">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td className="px-3 py-3" colSpan={5}>Loading…</td></tr>
                        ) : rules.length ? rules.map(r => (
                            <tr key={String(r.id)} className="border-t">
                                <td className="px-3 py-2">{r.campaignCode}</td>
                                <td className="px-3 py-2">
                                    {r.trigger.type}: <span className="font-medium">{r.trigger.value}</span>
                                </td>
                                <td className="px-3 py-2">
                                    {endpointById[String(r.endpointId)]?.name || r.endpointId}
                                </td>
                                <td className="px-3 py-2">
                                    {r.templateId
                                        ? (formatterById[String(r.templateId)]?.name ?? r.templateId)
                                        : <span className="text-zinc-500">—</span>}
                                </td>
                                <td className="px-3 py-2 text-right">
                                    <button
                                        className="px-2 py-1 rounded border"
                                        onClick={async () => { await Api.deleteMapping(r.id as unknown as number); await refresh(); }}
                                    >
                                        Delete
                                    </button>
                                </td>
                            </tr>
                        )) : (
                            <tr><td className="px-3 py-3 text-zinc-500" colSpan={5}>No mappings yet.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}


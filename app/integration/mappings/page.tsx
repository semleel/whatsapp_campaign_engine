"use client";
import { useEffect, useMemo, useState } from "react";
import { Api } from "@/lib/client";
import type { EndpointConfig, ResponseTemplate, MappingRule } from "@/lib/types";

const DEFAULT_FALLBACK = "We're unable to retrieve your data at the moment. Please try again later.";

export default function MappingsPage() {
  const [endpoints, setEndpoints] = useState<EndpointConfig[]>([]);
  const [formatters, setFormatters] = useState<ResponseTemplate[]>([]);
  const [rules, setRules] = useState<MappingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [paramMapText, setParamMapText] = useState("{}");

  const [draft, setDraft] = useState<MappingRule>({
    id: "",
    campaignCode: "",
    trigger: { type: "keyword", value: "" },
    endpointId: 0,
    paramMap: {},
    templateId: 0,
    fallbackMessage: DEFAULT_FALLBACK,
    retry: { enabled: false, count: 1 },
  });

  const resetDraft = () => {
    setDraft({
      id: "",
      campaignCode: "",
      trigger: { type: "keyword", value: "" },
      endpointId: 0,
      paramMap: {},
      templateId: 0,
      fallbackMessage: DEFAULT_FALLBACK,
      retry: { enabled: false, count: 1 },
    });
    setParamMapText("{}");
    setError("");
  };

  async function refresh() {
    setLoading(true);
    try {
      const [e, t, m] = await Promise.all([
        Api.listEndpoints(),
        Api.listResponseTemplates(),
        Api.listMappings(),
      ]);
      setEndpoints(e);
      setFormatters(t);
      setRules(m);
    } catch {
      setEndpoints([]);
      setFormatters([]);
      setRules([]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
  }, []);

  const endpointById = useMemo(
    () => Object.fromEntries(endpoints.map((e) => [String(e.id), e])),
    [endpoints]
  );
  const formatterById = useMemo(
    () => Object.fromEntries(formatters.map((t) => [String(t.id), t])),
    [formatters]
  );

  const handleParamMapChange = (value: string) => {
    setParamMapText(value);
    try {
      const parsed = value ? JSON.parse(value) : {};
      setDraft((prev) => ({ ...prev, paramMap: parsed }));
      setError("");
    } catch {
      setError("Param map must be valid JSON.");
    }
  };

  const handleCreate = async () => {
    if (error) return;
    try {
      await Api.createMapping({
        ...draft,
        id: undefined as unknown as string,
      });
      resetDraft();
      await refresh();
    } catch (err: any) {
      setError(err?.message || "Failed to create mapping");
    }
  };

  const handleDelete = async (id: string | number) => {
    await Api.deleteMapping(id);
    await refresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Keyword & Entry Point Mapping</h3>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Route keywords, buttons, or lists to backend endpoints with formatter responses and friendly fallbacks.
          </p>
        </div>
      </div>

      <section className="rounded-xl border p-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-6">
          <input
            className="rounded-md border px-3 py-2 text-sm md:col-span-2"
            placeholder="Campaign code (e.g. RAYA2025)"
            value={draft.campaignCode}
            onChange={(e) => setDraft({ ...draft, campaignCode: e.target.value })}
          />

          <select
            className="rounded-md border px-3 py-2 text-sm"
            value={draft.trigger.type}
            onChange={(e) => setDraft({ ...draft, trigger: { ...draft.trigger, type: e.target.value as "keyword" | "button" | "list" } })}
          >
            <option value="keyword">Keyword</option>
            <option value="button">Button</option>
            <option value="list">List</option>
          </select>

          <input
            className="rounded-md border px-3 py-2 text-sm"
            placeholder="Trigger value (e.g. CHECK_POINTS)"
            value={draft.trigger.value}
            onChange={(e) => setDraft({ ...draft, trigger: { ...draft.trigger, value: e.target.value } })}
          />

          <select
            className="rounded-md border px-3 py-2 text-sm"
            value={String(draft.endpointId || "")}
            onChange={(e) => setDraft({ ...draft, endpointId: Number(e.target.value) || 0 })}
          >
            <option value="">Select endpoint...</option>
            {endpoints.map((e) => (
              <option key={String(e.id)} value={String(e.id)}>
                {e.name}
              </option>
            ))}
          </select>

          <select
            className="rounded-md border px-3 py-2 text-sm"
            value={String(draft.templateId || "")}
            onChange={(e) => setDraft({ ...draft, templateId: Number(e.target.value) || 0 })}
          >
            <option value="">No formatter</option>
            {formatters.map((t) => (
              <option key={String(t.id)} value={String(t.id)}>
                {t.name} {t.locale ? `(${t.locale})` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <input
            className="rounded-md border px-3 py-2 text-sm"
            placeholder='Param map JSON (e.g. {"userId":"{{msisdn}}"})'
            value={paramMapText}
            onChange={(e) => handleParamMapChange(e.target.value)}
          />
          <input
            className="rounded-md border px-3 py-2 text-sm"
            placeholder="Fallback message (optional)"
            value={draft.fallbackMessage || ""}
            onChange={(e) => setDraft({ ...draft, fallbackMessage: e.target.value })}
          />
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!draft.retry?.enabled}
              onChange={(e) => setDraft({ ...draft, retry: { enabled: e.target.checked, count: draft.retry?.count ?? 1 } })}
            />
            Retry on failure
          </label>
          <button
            type="button"
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90"
            onClick={handleCreate}
          >
            Add mapping
          </button>
        </div>
        {error && <p className="text-xs text-rose-600">{error}</p>}
      </section>

      <section className="rounded-xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Campaign</th>
              <th className="px-3 py-2 text-left font-medium">Trigger</th>
              <th className="px-3 py-2 text-left font-medium">Endpoint</th>
              <th className="px-3 py-2 text-left font-medium">Formatter</th>
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-muted-foreground">
                  Loading...
                </td>
              </tr>
            ) : rules.length ? (
              rules.map((r) => (
                <tr key={String(r.id)} className="border-t">
                  <td className="px-3 py-2">{r.campaignCode}</td>
                  <td className="px-3 py-2">
                    {r.trigger.type}: <span className="font-medium">{r.trigger.value}</span>
                  </td>
                  <td className="px-3 py-2">{endpointById[String(r.endpointId)]?.name || r.endpointId}</td>
                  <td className="px-3 py-2">
                    {r.templateId ? formatterById[String(r.templateId)]?.name || r.templateId : <span className="text-muted-foreground">-</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      className="rounded border px-2 py-1 text-xs font-medium hover:bg-muted"
                      onClick={() => handleDelete(r.id as unknown as number)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-muted-foreground">
                  No mappings yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}



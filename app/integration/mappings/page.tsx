"use client";

import { useEffect, useState } from "react";
import { Api } from "@/lib/client";
import type { CampaignApiMapping, EndpointConfig } from "@/lib/types";

type DraftMapping = {
  campaignid: string;
  contentkeyid: string;
  apiid: string;
  success_contentkeyid: string;
  error_contentkeyid: string;
  is_active: boolean;
};

const EMPTY_DRAFT: DraftMapping = {
  campaignid: "",
  contentkeyid: "",
  apiid: "",
  success_contentkeyid: "",
  error_contentkeyid: "",
  is_active: true,
};

export default function MappingsPage() {
  const [draft, setDraft] = useState<DraftMapping>(EMPTY_DRAFT);
  const [endpoints, setEndpoints] = useState<EndpointConfig[]>([]);
  const [mappings, setMappings] = useState<CampaignApiMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [endpointData, mappingData] = await Promise.all([Api.listEndpoints(), Api.listMappings()]);
      setEndpoints(endpointData);
      setMappings(mappingData);
    } catch (err: any) {
      setError(err?.message || "Unable to load mappings");
      setEndpoints([]);
      setMappings([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const handleCreate = async () => {
    if (!draft.campaignid || !draft.contentkeyid || !draft.apiid) {
      setError("Campaign ID, content key, and API are required.");
      return;
    }
    setError(null);
    await Api.createMapping({
      campaignid: Number(draft.campaignid),
      contentkeyid: draft.contentkeyid.trim(),
      apiid: Number(draft.apiid),
      success_contentkeyid: draft.success_contentkeyid.trim() || null,
      error_contentkeyid: draft.error_contentkeyid.trim() || null,
      is_active: draft.is_active,
    });
    setDraft(EMPTY_DRAFT);
    refresh();
  };

  const endpointLabel = (apiid?: number | null) => {
    if (!apiid) return "—";
    const match = endpoints.find((endpoint) => endpoint.apiid === apiid);
    return match ? `${match.name} (${match.method})` : `API #${apiid}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Campaign ⇄ API mapping</h3>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Each row maps a {`<campaignid, contentkeyid>`} pair to a registered API and optional success/error follow-up nodes.
          </p>
        </div>
      </div>

      {error && <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

      <section className="rounded-xl border p-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1 text-sm font-medium">
            <span>Campaign ID</span>
            <input
              className="w-full rounded-md border px-3 py-2"
              value={draft.campaignid}
              onChange={(e) => setDraft((prev) => ({ ...prev, campaignid: e.target.value }))}
              placeholder="e.g. 12"
            />
          </label>
          <label className="space-y-1 text-sm font-medium">
            <span>Content key</span>
            <input
              className="w-full rounded-md border px-3 py-2"
              value={draft.contentkeyid}
              onChange={(e) => setDraft((prev) => ({ ...prev, contentkeyid: e.target.value }))}
              placeholder="WELCOME_STEP"
            />
          </label>
          <label className="space-y-1 text-sm font-medium">
            <span>API</span>
            <select
              className="w-full rounded-md border px-3 py-2"
              value={draft.apiid}
              onChange={(e) => setDraft((prev) => ({ ...prev, apiid: e.target.value }))}
            >
              <option value="">Select API</option>
              {endpoints.map((endpoint) => (
                <option key={endpoint.apiid ?? endpoint.name} value={endpoint.apiid}>
                  {endpoint.name} ({endpoint.method})
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm font-medium">
            <span>Success content key</span>
            <input
              className="w-full rounded-md border px-3 py-2"
              value={draft.success_contentkeyid}
              onChange={(e) => setDraft((prev) => ({ ...prev, success_contentkeyid: e.target.value }))}
              placeholder="OPTIONAL"
            />
          </label>
          <label className="space-y-1 text-sm font-medium">
            <span>Error content key</span>
            <input
              className="w-full rounded-md border px-3 py-2"
              value={draft.error_contentkeyid}
              onChange={(e) => setDraft((prev) => ({ ...prev, error_contentkeyid: e.target.value }))}
              placeholder="OPTIONAL"
            />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={draft.is_active}
            onChange={(e) => setDraft((prev) => ({ ...prev, is_active: e.target.checked }))}
          />
          Mapping is active
        </label>
        <div>
          <button
            type="button"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            onClick={handleCreate}
            disabled={loading}
          >
            Add mapping
          </button>
        </div>
      </section>

      <section className="rounded-xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Mapping ID</th>
              <th className="px-3 py-2 text-left font-medium">Campaign</th>
              <th className="px-3 py-2 text-left font-medium">Content key</th>
              <th className="px-3 py-2 text-left font-medium">API</th>
              <th className="px-3 py-2 text-left font-medium">Success/Error</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-muted-foreground">
                  Loading mappings...
                </td>
              </tr>
            ) : mappings.length ? (
              mappings.map((mapping) => (
                <tr key={mapping.mappingid} className="border-t">
                  <td className="px-3 py-2 font-mono text-xs">{mapping.mappingid}</td>
                  <td className="px-3 py-2">Campaign #{mapping.campaignid}</td>
                  <td className="px-3 py-2">{mapping.contentkeyid}</td>
                  <td className="px-3 py-2">{endpointLabel(mapping.apiid)}</td>
                  <td className="px-3 py-2 text-xs">
                    <div>Success: {mapping.success_contentkeyid || "—"}</div>
                    <div>Error: {mapping.error_contentkeyid || "—"}</div>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        mapping.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {mapping.is_active ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right space-x-2">
                    <button
                      className="rounded border px-2 py-1 text-xs"
                      onClick={async () => {
                        if (!mapping.mappingid) return;
                        await Api.updateMapping(mapping.mappingid, { ...mapping, is_active: !mapping.is_active });
                        refresh();
                      }}
                    >
                      {mapping.is_active ? "Disable" : "Enable"}
                    </button>
                    <button
                      className="rounded border px-2 py-1 text-xs text-rose-600"
                      onClick={async () => {
                        if (!mapping.mappingid) return;
                        await Api.deleteMapping(mapping.mappingid);
                        refresh();
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-muted-foreground">
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

"use client";

import { useEffect, useState } from "react";
import { Api } from "@/lib/client";
import type { CampaignApiMapping, EndpointConfig } from "@/lib/types";
import { usePrivilege } from "@/lib/permissions";

const EMPTY_DRAFT = {
  campaignid: "",
  contentkeyid: "",
  apiid: "",
  success_contentkeyid: "",
  error_contentkeyid: "",
  is_active: true,
};

export default function MappingsPage() {
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [endpoints, setEndpoints] = useState<EndpointConfig[]>([]);
  const [mappings, setMappings] = useState<CampaignApiMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { canView, canCreate, canUpdate, canArchive, loading: privLoading } =
    usePrivilege("integration");

  async function refresh() {
    if (privLoading) return;
    if (!canView) {
      setError("You do not have permission to view mappings.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [endpointData, mappingData] = await Promise.all([
        Api.listEndpoints(),
        Api.listMappings(),
      ]);
      setEndpoints(endpointData);
      setMappings(mappingData);
    } catch (err: any) {
      setError(err?.message || "Unable to load mappings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [canView, privLoading]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreate) {
      setError("You do not have permission to create mappings.");
      return;
    }
    try {
      const payload = {
        ...draft,
        campaignid: Number(draft.campaignid),
        apiid: Number(draft.apiid),
      };
      await Api.createMapping(payload as any);
      setDraft(EMPTY_DRAFT);
      await refresh();
    } catch (err: any) {
      setError(err?.message || "Failed to create mapping");
    }
  };

  const handleDelete = async (mappingId: number) => {
    if (!canArchive) {
      setError("You do not have permission to delete mappings.");
      return;
    }
    try {
      await Api.deleteMapping(mappingId);
      await refresh();
    } catch (err: any) {
      setError(err?.message || "Failed to delete mapping");
    }
  };

  if (!privLoading && !canView) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
        You do not have permission to view mappings.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Campaign API Mappings</h2>
          <p className="text-sm text-muted-foreground">
            Link content keys to endpoints via campaign_api_mapping.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Create form */}
      {canCreate && (
        <form onSubmit={handleCreate} className="grid gap-3 md:grid-cols-2">
          <input
            className="rounded-md border px-3 py-2 text-sm"
            placeholder="Campaign ID"
            value={draft.campaignid}
            onChange={(e) => setDraft((d) => ({ ...d, campaignid: e.target.value }))}
          />
          <input
            className="rounded-md border px-3 py-2 text-sm"
            placeholder="CONTENT_KEY"
            value={draft.contentkeyid}
            onChange={(e) => setDraft((d) => ({ ...d, contentkeyid: e.target.value }))}
          />
          <select
            className="rounded-md border px-3 py-2 text-sm"
            value={draft.apiid}
            onChange={(e) => setDraft((d) => ({ ...d, apiid: e.target.value }))}
          >
            <option value="">Select endpoint</option>
            {endpoints.map((ep) => (
              <option key={ep.apiid} value={ep.apiid}>
                {ep.name || ep.apiid}
              </option>
            ))}
          </select>
          <input
            className="rounded-md border px-3 py-2 text-sm"
            placeholder="Success CONTENT_KEY"
            value={draft.success_contentkeyid}
            onChange={(e) => setDraft((d) => ({ ...d, success_contentkeyid: e.target.value }))}
          />
          <input
            className="rounded-md border px-3 py-2 text-sm"
            placeholder="Error CONTENT_KEY"
            value={draft.error_contentkeyid}
            onChange={(e) => setDraft((d) => ({ ...d, error_contentkeyid: e.target.value }))}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.is_active}
              onChange={(e) => setDraft((d) => ({ ...d, is_active: e.target.checked }))}
            />
            Active
          </label>
          <div>
            <button
              type="submit"
              className="btn btn-primary"
            >
              Create mapping
            </button>
          </div>
        </form>
      )}

      <div className="rounded-xl border overflow-x-auto bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Campaign</th>
              <th className="px-3 py-2 text-left font-medium">Content key</th>
              <th className="px-3 py-2 text-left font-medium">Endpoint</th>
              <th className="px-3 py-2 text-left font-medium">Success</th>
              <th className="px-3 py-2 text-left font-medium">Error</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {mappings.map((m) => (
              <tr key={m.mappingid ?? `${m.campaignid}-${m.apiid}-${m.contentkeyid}`} className="border-t">
                <td className="px-3 py-2">{m.campaignid}</td>
                <td className="px-3 py-2 font-mono text-xs">{m.contentkeyid}</td>
                <td className="px-3 py-2">{m.apiid}</td>
                <td className="px-3 py-2 font-mono text-xs">{m.success_contentkeyid}</td>
                <td className="px-3 py-2 font-mono text-xs">{m.error_contentkeyid}</td>
                <td className="px-3 py-2 text-xs">
                  {m.is_active ? (
                    <span className="pill bg-emerald-100 text-emerald-700">Active</span>
                  ) : (
                    <span className="pill bg-slate-100 text-slate-700">Disabled</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right space-x-2">
                  {canUpdate ? (
                    <span className="text-muted-foreground text-xs">Edit via API</span>
                  ) : (
                    <span className="text-muted-foreground text-xs">View only</span>
                  )}
                  {canArchive && (
                    <button
                      type="button"
                  onClick={() =>
                    m.mappingid != null
                      ? handleDelete(m.mappingid)
                      : setError("Mapping id is missing.")
                  }
                      className="text-rose-600 hover:underline text-xs"
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Api } from "@/lib/client";
import type { EndpointConfig } from "@/lib/types";
import {
  showCenteredConfirm,
  showPrivilegeDenied,
  showSuccessToast,
} from "@/lib/showAlert";
import { usePrivilege } from "@/lib/permissions";

function formatUrl(endpoint: EndpointConfig) {
  return endpoint.url || "-";
}

function formatDateTime(value?: string | null) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString();
}

export default function ArchivedEndpointsPage() {
  const [endpoints, setEndpoints] = useState<EndpointConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { canView, canArchive, loading: privLoading } = usePrivilege("integration");

  useEffect(() => {
    const load = async () => {
      if (privLoading) return;
      if (!canView) {
        setLoading(false);
        setEndpoints([]);
        return;
      }
      try {
        setError(null);
        setLoading(true);
        const data = await Api.listArchivedEndpoints?.();
        setEndpoints(data || []);
      } catch (err: any) {
        setError(err?.message || "Failed to load archived endpoints");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [canView, privLoading]);

  const handleRestore = async (endpoint: EndpointConfig) => {
    if (!canArchive) {
      await showPrivilegeDenied({ action: "restore endpoints", resource: "Integrations" });
      setError("You do not have permission to restore endpoints.");
      return;
    }
    if (endpoint.apiid == null) {
      setError("Endpoint id is missing.");
      return;
    }
    const confirmed = await showCenteredConfirm(
      `Restore endpoint "${endpoint.name || endpoint.apiid}"? It will remain disabled.`
    );
    if (!confirmed) return;
    try {
      await Api.restoreEndpoint(endpoint.apiid);
      setEndpoints((prev) => prev.filter((item) => item.apiid !== endpoint.apiid));
      showSuccessToast(`Restored endpoint "${endpoint.name || endpoint.apiid}"`);
    } catch (err: any) {
      setError(err?.message || "Failed to restore endpoint");
    }
  };

  if (!privLoading && !canView) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
        You do not have permission to view archived endpoints.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Archived endpoints</h2>
          <p className="text-sm text-muted-foreground">
            Archived APIs are kept for auditing and cannot be executed until restored.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="rounded-xl border overflow-x-auto bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Name</th>
              <th className="px-3 py-2 text-left font-medium">Method</th>
              <th className="px-3 py-2 text-left font-medium">URL</th>
              <th className="px-3 py-2 text-left font-medium">Last updated</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-muted-foreground">
                  Loading archived endpoints...
                </td>
              </tr>
            ) : endpoints.length ? (
              endpoints.map((endpoint) => (
                <tr
                  key={endpoint.apiid}
                  className="border-t transition-colors hover:bg-muted/60 hover:text-slate-900"
                >
                  <td className="px-3 py-2 font-medium">
                    <div className="flex flex-col gap-1">
                      <span>{endpoint.name || endpoint.apiid}</span>
                      {endpoint.description && (
                        <span className="text-[11px] text-muted-foreground">
                          {endpoint.description}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {(endpoint.method || "GET").toUpperCase()}
                  </td>
                  <td className="px-3 py-2 text-sm font-mono text-muted-foreground">
                    {formatUrl(endpoint)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {formatDateTime(endpoint.lastupdated)}
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-rose-600">
                      Archived
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right space-x-2">
                    {canArchive ? (
                      <button
                        type="button"
                        onClick={() => handleRestore(endpoint)}
                        className="rounded border border-emerald-400 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                      >
                        Restore
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">No actions</span>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-muted-foreground">
                  No archived endpoints.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// app/integration/endpoints/page.tsx

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Api } from "@/lib/client";
import type { EndpointConfig } from "@/lib/types";
import { showCenteredConfirm, showPrivilegeDenied } from "@/lib/showAlert";
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

export default function EndpointsPage() {
  const [endpoints, setEndpoints] = useState<EndpointConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { canView, canCreate, canUpdate, canArchive, loading: privLoading } = usePrivilege("integration");

  async function refresh() {
    try {
      if (privLoading) return;
      if (!canView) {
        setError("You do not have permission to view endpoints.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      const data = await Api.listEndpoints?.();
      setEndpoints(data || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load endpoints");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [canView, privLoading]);

  const handleArchive = async (endpoint: EndpointConfig) => {
    if (!canArchive) {
      await showPrivilegeDenied({ action: "archive endpoints", resource: "Integrations" });
      setError("You do not have permission to archive endpoints.");
      return;
    }
    const confirmed = await showCenteredConfirm(
      `Archive endpoint '${endpoint.name || endpoint.apiid}'? This will disable it but keep logs.`
    );
    if (!confirmed) return;
    try {
      if (endpoint.apiid == null) {
        setError("Endpoint id is missing.");
        return;
      }
      await Api.deleteEndpoint(endpoint.apiid);
      await refresh();
    } catch (err: any) {
      setError(err?.message || "Failed to archive endpoint");
    }
  };

  const activeCount = useMemo(
    () => endpoints.filter((endpoint) => endpoint.is_active).length,
    [endpoints]
  );

  const handleToggleActive = async (endpoint: EndpointConfig) => {
    if (!canUpdate) {
      setError("You do not have permission to update endpoints.");
      return;
    }
    if (endpoint.is_deleted) {
      setError("Archived endpoints cannot be reactivated.");
      return;
    }
    if (endpoint.apiid == null) {
      setError("Endpoint id is missing.");
      return;
    }

    const next = !endpoint.is_active;
    const payload = { ...endpoint, is_active: next };
    try {
      await Api.updateEndpoint(endpoint.apiid, payload);
      setEndpoints((prev) =>
        prev.map((item) =>
          item.apiid === endpoint.apiid ? { ...item, is_active: next } : item
        )
      );
    } catch (err: any) {
      setError(err?.message || "Failed to update endpoint active state");
    }
  };

  if (!privLoading && !canView) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
        You do not have permission to view endpoints.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Endpoints</h2>
          <p className="text-sm text-muted-foreground">
            API definitions for campaign engine. Stored in <code>api</code> table.
          </p>
        </div>
        {(canView || canCreate) && (
          <div className="flex flex-wrap gap-2">
            {canView && (
              <Link
                href="/integration/endpoints/archived"
                className="inline-flex items-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/80"
              >
                Archived APIs
              </Link>
            )}
            {canCreate && (
              <Link
                href="/integration/endpoints/create"
                className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90"
              >
                New endpoint
              </Link>
            )}
          </div>
        )}
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
              <th className="px-3 py-2 text-left font-medium">Active</th>
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-muted-foreground">
                  Loading endpoints...
                </td>
              </tr>
            ) : endpoints.length ? (
              endpoints.map((endpoint) => {
                const isActive = Boolean(endpoint.is_active);
                return (
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
                      <button
                        type="button"
                        onClick={() => handleToggleActive(endpoint)}
                        disabled={!canUpdate || endpoint.is_deleted}
                        className={`relative h-6 w-11 overflow-hidden rounded-full border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 ${
                          isActive
                            ? "bg-emerald-500 border-emerald-600"
                            : "bg-slate-200 border-slate-300"
                        } ${!canUpdate || endpoint.is_deleted ? "cursor-not-allowed opacity-60" : "hover:opacity-90"}`}
                        aria-pressed={isActive}
                        aria-label={isActive ? "Deactivate endpoint" : "Activate endpoint"}
                        aria-disabled={!canUpdate || endpoint.is_deleted}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                            isActive ? "translate-x-5" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right space-x-2">
                      <Link
                        href={`/integration/endpoints/${endpoint.apiid}`}
                        className="rounded border px-2 py-1 text-xs font-medium hover:bg-muted"
                      >
                        {canUpdate ? "Edit" : "View"}
                      </Link>
                      {canArchive ? (
                        <button
                          type="button"
                          onClick={() => handleArchive(endpoint)}
                          className="rounded border px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                        >
                          Archive
                        </button>
                      ) : (
                        !canUpdate && (
                          <span className="text-xs text-muted-foreground">No actions</span>
                        )
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-muted-foreground">
                  No endpoints found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border p-4 text-sm text-muted-foreground flex flex-wrap items-center justify-between gap-3">
        <div>Active endpoints: {activeCount}</div>
      </div>
    </div>
  );
}

// app/integration/endpoints/page.tsx

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Api } from "@/lib/client";
import type { EndpointConfig } from "@/lib/types";
import { showCenteredConfirm, showPrivilegeDenied } from "@/lib/showAlert";
import { usePrivilege } from "@/lib/permissions";

function formatUrl(endpoint: EndpointConfig) {
  return endpoint.url || "-";
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

  const handleDelete = async (endpoint: EndpointConfig) => {
    if (!canArchive) {
      await showPrivilegeDenied({ action: "delete endpoints", resource: "Integrations" });
      setError("You do not have permission to delete endpoints.");
      return;
    }
    const confirmed = await showCenteredConfirm(
      `Delete endpoint "${endpoint.name || endpoint.apiid}"?`
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
      setError(err?.message || "Failed to delete endpoint");
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
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Endpoints</h2>
          <p className="text-sm text-muted-foreground">
            API definitions for campaign engine. Stored in <code>api</code> table.
          </p>
        </div>
        {canCreate && (
          <Link
            href="/integration/endpoints/create"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90"
          >
            New endpoint
          </Link>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading endpoints...</div>
      ) : endpoints.length === 0 ? (
        <div className="text-sm text-muted-foreground">No endpoints found.</div>
      ) : (
        <div className="rounded-xl border overflow-x-auto bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Name</th>
                <th className="px-3 py-2 text-left font-medium">Method</th>
                <th className="px-3 py-2 text-left font-medium">URL</th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {endpoints.map((endpoint) => (
                <tr
                  key={endpoint.apiid}
                  className="border-t transition-colors hover:bg-muted/60 hover:text-slate-900"
                >
                  <td className="px-3 py-2 font-medium">{endpoint.name || endpoint.apiid}</td>
                  <td className="px-3 py-2 text-muted-foreground">{endpoint.method || "GET"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{formatUrl(endpoint)}</td>
                  <td className="px-3 py-2 text-right space-x-2">
                    <Link
                      href={`/integration/endpoints/${endpoint.apiid}`}
                      className="text-primary hover:underline"
                    >
                      {canUpdate ? "Edit" : "View"}
                    </Link>
                    {canArchive && (
                      <button
                        type="button"
                        onClick={() => handleDelete(endpoint)}
                        className="text-rose-600 hover:underline"
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
      )}
    </div>
  );
}

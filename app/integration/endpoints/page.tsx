"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Api } from "@/lib/client";
import type { EndpointConfig } from "@/lib/types";
import { showCenteredConfirm } from "@/lib/showAlert";

function formatUrl(endpoint: EndpointConfig) {
  const base = endpoint.base_url?.replace(/\/+$/, "") || "";
  const path = endpoint.path ? `/${endpoint.path.replace(/^\/+/, "")}` : "/";
  return `${base}${path}`;
}

export default function EndpointsPage() {
  const [endpoints, setEndpoints] = useState<EndpointConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const data = await Api.listEndpoints();
      setEndpoints(data);
    } catch (err: any) {
      setError(err?.message || "Unable to load endpoints");
      setEndpoints([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Endpoint catalog</h3>
          <p className="text-sm text-muted-foreground max-w-2xl">
            These HTTPS definitions power every API call triggered inside WhatsApp flows. Keep them aligned with the schema and retry policies from the database.
          </p>
        </div>
        <Link
          href="/integration/endpoints/create"
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90"
        >
          New endpoint
        </Link>
      </div>

      {error && <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

      <div className="rounded-xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Name</th>
              <th className="px-3 py-2 text-left font-medium">Method</th>
              <th className="px-3 py-2 text-left font-medium">URL</th>
              <th className="px-3 py-2 text-left font-medium">Auth</th>
              <th className="px-3 py-2 text-left font-medium">Retry</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-muted-foreground">
                  Loading endpoints...
                </td>
              </tr>
            ) : endpoints.length ? (
              endpoints.map((endpoint) => (
                <tr key={endpoint.apiid ?? endpoint.name} className="border-t">
                  <td className="px-3 py-2">
                    <div className="font-medium">{endpoint.name}</div>
                    <div className="text-xs text-muted-foreground">{endpoint.description || "—"}</div>
                  </td>
                  <td className="px-3 py-2">{endpoint.method}</td>
                  <td className="px-3 py-2 font-mono text-xs">{formatUrl(endpoint)}</td>
                  <td className="px-3 py-2">{endpoint.auth_type || "none"}</td>
                  <td className="px-3 py-2">
                    {endpoint.retry_enabled ? `${endpoint.retry_count ?? 0}x` : "Disabled"}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        endpoint.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {endpoint.is_active ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right space-x-2">
                    <Link className="rounded border px-2 py-1" href={`/integration/endpoints/${endpoint.apiid}`}>
                      Edit
                    </Link>
                    <button
                      className="rounded border px-2 py-1 text-rose-600"
                      onClick={async () => {
                        if (!endpoint.apiid) return;
                        const confirmed = await showCenteredConfirm(`Delete ${endpoint.name}?`);
                        if (!confirmed) return;
                        await Api.deleteEndpoint(endpoint.apiid);
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
                  No endpoints yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

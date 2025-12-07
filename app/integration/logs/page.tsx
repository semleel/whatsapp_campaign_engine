// app/integration/logs/page.tsx

"use client";

import { useEffect, useState } from "react";
import { Api } from "@/lib/client";
import type { ApiLogEntry } from "@/lib/types";
import { usePrivilege } from "@/lib/permissions";

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export default function LogsPage() {
  const [logs, setLogs] = useState<ApiLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { canView, loading: privLoading } = usePrivilege("integration");

  useEffect(() => {
    if (privLoading) return;
    if (!canView) {
      setError("You do not have permission to view integration logs.");
      setLoading(false);
      return;
    }
    Api.listLogs(200)
      .then(setLogs)
      .catch((err) => setError(err?.message || "Failed to load logs"))
      .finally(() => setLoading(false));
  }, [canView, privLoading]);

  if (!privLoading && !canView) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
        You do not have permission to view integration logs.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Integration Logs</h3>
          <p className="text-sm text-muted-foreground">Latest entries from api_log.</p>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading logs...</div>
      ) : logs.length === 0 ? (
        <div className="text-sm text-muted-foreground">No logs yet.</div>
      ) : (
        <div className="rounded-xl border overflow-x-auto bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Endpoint</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-left font-medium">Method</th>
                <th className="px-3 py-2 text-left font-medium">Path</th>
                <th className="px-3 py-2 text-left font-medium">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.logid} className="border-t">
                  <td className="px-3 py-2">{log.endpoint}</td>
                  <td className="px-3 py-2">{log.status_code}</td>
                  <td className="px-3 py-2">{log.method}</td>
                  <td className="px-3 py-2">{log.path}</td>
                  <td className="px-3 py-2 text-muted-foreground">{formatDate(log.createdat)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

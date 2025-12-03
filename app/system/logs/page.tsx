"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE_URL, clearStoredSession, getStoredToken } from "@/lib/auth";
import { usePrivilege } from "@/lib/permissions";

type LogRow = {
  logid: number;
  tokenid: number | null;
  action: string | null;
  ipaddress: string | null;
  useragent: string | null;
  logtime: string | null;
  role: string | null;
  admin: { id: number; name: string | null; email: string; role: string | null } | null;
};

export default function SecurityLogsPage() {
  const router = useRouter();
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(200);
  const { canView, loading: privLoading } = usePrivilege("system");

  function formatRole(role: string | null | undefined) {
    const r = (role || "").trim();
    if (!r) return "-";
    return r.charAt(0).toUpperCase() + r.slice(1).toLowerCase();
  }

  if (!privLoading && !canView) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
        You do not have permission to view security logs.
      </div>
    );
  }

  useEffect(() => {
    loadLogs();
  }, [limit, canView, privLoading]);

  async function loadLogs() {
    try {
      if (privLoading) return;
      if (!canView) {
        setError("You do not have permission to view security logs.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      const token = getStoredToken();
      if (!token) {
        router.replace("/login");
        return;
      }

      const res = await fetch(`${API_BASE_URL}/api/system/security-logs?limit=${limit}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) {
        clearStoredSession();
        router.replace("/login");
        return;
      }
      if (res.status === 403) {
        setError("You need admin permissions to view security logs.");
        return;
      }
      if (!res.ok) throw new Error(`Failed to load logs (${res.status})`);

      const data = await res.json();
      setLogs(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message || "Failed to load logs");
    } finally {
      setLoading(false);
    }
  }

  const displayed = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return logs;
    return logs.filter((log) => {
      return (
        (log.admin?.email || "").toLowerCase().includes(term) ||
        (log.admin?.name || "").toLowerCase().includes(term) ||
        (log.action || "").toLowerCase().includes(term) ||
        (log.ipaddress || "").toLowerCase().includes(term) ||
        (log.useragent || "").toLowerCase().includes(term)
      );
    });
  }, [logs, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Security logs</h3>
          <p className="text-sm text-muted-foreground">Audit trail from token_log.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="rounded-md border px-3 py-2 text-sm"
            placeholder="Search action/email/ip/user agent"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="rounded-md border px-2 py-2 text-sm"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
          >
            {[50, 100, 200, 500].map((v) => (
              <option key={v} value={v}>
                Last {v}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading logs...</p>}
      {error && !loading && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && (
        <div className="rounded-xl border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left font-medium">When</th>
                <th className="px-3 py-2 text-left font-medium">Action</th>
                <th className="px-3 py-2 text-left font-medium">Admin</th>
                <th className="px-3 py-2 text-left font-medium">Role</th>
                <th className="px-3 py-2 text-left font-medium">Token</th>
                <th className="px-3 py-2 text-left font-medium">IP</th>
                <th className="px-3 py-2 text-left font-medium">User agent</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((log) => (
                <tr key={log.logid} className="border-t align-middle">
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {log.logtime ? new Date(log.logtime).toLocaleString() : "-"}
                  </td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700 text-xs">
                      {log.action || "-"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{log.admin?.name || "-"}</div>
                    <div className="text-xs text-muted-foreground">{log.admin?.email || "-"}</div>
                  </td>
                  <td className="px-3 py-2 text-xs">{formatRole(log.role || log.admin?.role)}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">#{log.tokenid || "-"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{log.ipaddress || "-"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground max-w-xs truncate">{log.useragent || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

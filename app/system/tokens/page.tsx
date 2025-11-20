"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE_URL, clearStoredSession, getStoredToken } from "@/lib/auth";

type TokenRow = {
  tokenid: number;
  adminid: number | null;
  admin: { id: number; name: string | null; email: string; role: string | null } | null;
  roletype: string | null;
  issuedat: string | null;
  expiryat: string | null;
  lastusedat: string | null;
  is_revoked: boolean | null;
  createdby: string | null;
};

export default function TokensPage() {
  const router = useRouter();
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<"recent" | "oldest">("recent");

  function formatRole(role: string | null | undefined) {
    const r = (role || "").trim();
    if (!r) return "-";
    return r.charAt(0).toUpperCase() + r.slice(1).toLowerCase();
  }

  useEffect(() => {
    loadTokens();
  }, []);

  async function loadTokens() {
    try {
      setLoading(true);
      setError(null);
      const token = getStoredToken();
      if (!token) {
        router.replace("/login");
        return;
      }

      const res = await fetch(`${API_BASE_URL}/api/system/tokens`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) {
        clearStoredSession();
        router.replace("/login");
        return;
      }
      if (res.status === 403) {
        setError("You need admin permissions to view tokens.");
        return;
      }
      if (!res.ok) throw new Error(`Failed to load tokens (${res.status})`);

      const data = await res.json();
      setTokens(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message || "Failed to load tokens");
    } finally {
      setLoading(false);
    }
  }

  function parseDate(value: string | null) {
    const t = value ? Date.parse(value) : NaN;
    return Number.isNaN(t) ? 0 : t;
  }

  const displayed = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = !term
      ? tokens
      : tokens.filter((t) => {
          return (
            (t.admin?.name || "").toLowerCase().includes(term) ||
            (t.admin?.email || "").toLowerCase().includes(term) ||
            (t.roletype || "").toLowerCase().includes(term) ||
            (t.createdby || "").toLowerCase().includes(term)
          );
        });

    return [...filtered].sort((a, b) => {
      const da = parseDate(a.issuedat);
      const db = parseDate(b.issuedat);
      const diff = sortKey === "recent" ? db - da : da - db;
      if (diff !== 0) return diff;
      return (a.admin?.email || "").localeCompare(b.admin?.email || "");
    });
  }, [tokens, search, sortKey]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Token sessions</h3>
          <p className="text-sm text-muted-foreground">Active tokens issued to admins.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="rounded-md border px-3 py-2 text-sm"
            placeholder="Search name/email/role"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="rounded-md border px-2 py-2 text-sm"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
          >
            <option value="recent">Newest</option>
            <option value="oldest">Oldest</option>
          </select>
        </div>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading tokens...</p>}
      {error && !loading && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && (
        <div className="rounded-xl border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Token</th>
                <th className="px-3 py-2 text-left font-medium">Admin</th>
                <th className="px-3 py-2 text-left font-medium">Role</th>
                <th className="px-3 py-2 text-left font-medium">Issued</th>
                <th className="px-3 py-2 text-left font-medium">Last used</th>
                <th className="px-3 py-2 text-left font-medium">Expires</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((token) => (
                <tr key={token.tokenid} className="border-t align-middle">
                  <td className="px-3 py-2">
                    <div className="text-xs text-muted-foreground">#{token.tokenid}</div>
                    <div className="text-xs text-muted-foreground">Created by: {token.createdby || "system"}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{token.admin?.name || "-"}</div>
                    <div className="text-xs text-muted-foreground">{token.admin?.email || "-"}</div>
                  </td>
                  <td className="px-3 py-2">{formatRole(token.admin?.role || token.roletype)}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {token.issuedat ? new Date(token.issuedat).toLocaleString() : "-"}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {token.lastusedat ? new Date(token.lastusedat).toLocaleString() : "-"}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {token.expiryat ? new Date(token.expiryat).toLocaleString() : "-"}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {token.is_revoked ? (
                      <span className="rounded-full bg-rose-100 px-3 py-1 text-rose-700">Revoked</span>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">Active</span>
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

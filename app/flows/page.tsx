"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Api } from "@/lib/client";
import type { FlowListItem } from "@/lib/types";
import { usePrivilege } from "@/lib/permissions";

type Stat = { label: string; value: number };

export default function FlowListPage() {
  const [flows, setFlows] = useState<FlowListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { canView, canCreate, canUpdate, loading: privLoading } = usePrivilege("flows");

  useEffect(() => {
    let cancelled = false;

    if (privLoading) return;
    if (!canView) {
      setError("You do not have permission to view flows.");
      setLoading(false);
      return;
    }

    Api.listFlows()
      .then((data) => {
        if (!cancelled) setFlows(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load flows.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canView, privLoading]);

  const stats = useMemo<Stat[]>(() => {
    if (!flows.length) {
      return [
        { label: "Published flows", value: 0 },
        { label: "Drafts", value: 0 },
        { label: "Nodes tracked", value: 0 },
      ];
    }

    const published = flows.filter(
      (f) => f.status === "Active" || f.status === "Published"
    ).length;
    const drafts = flows.length - published;
    const nodes = flows.reduce((sum, f) => sum + (f.nodeCount ?? 0), 0);

    return [
      { label: "Published flows", value: published },
      { label: "Drafts", value: drafts },
      { label: "Nodes tracked", value: nodes },
    ];
  }, [flows]);

  const formatTs = (ts: string | null | undefined) => {
    if (!ts) return "-";
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return ts;
    return d.toLocaleString();
  };

  if (!privLoading && !canView) {
    return (
      <div className="p-6 text-sm text-amber-700 border border-amber-200 bg-amber-50 rounded-lg">
        You do not have permission to view flows.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Loading flows...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-sm text-rose-600">{error}</div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">User flows</h2>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Each row maps to a <code>userflow</code> record. Inside a flow, nodes are
            backed by <code>keymapping</code> plus <code>allowedinput</code>,{" "}
            <code>branchrule</code>, and <code>fallback</code> for input validation
            &amp; branching.
          </p>
        </div>
        {canCreate && (
          <Link
            href="/flows/create"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90"
          >
            New Flow
          </Link>
        )}
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="card p-4">
            <div className="text-sm text-muted-foreground">{s.label}</div>
            <div className="text-2xl font-semibold">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border overflow-x-auto bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="px-3 py-2 text-left font-medium">ID</th>
              <th className="px-3 py-2 text-left font-medium">Name</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-left font-medium">Updated</th>
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {flows.map((flow) => (
              <tr key={flow.userflowid} className="border-t">
                <td className="px-3 py-2 text-muted-foreground">{flow.userflowid}</td>
                <td className="px-3 py-2 font-medium">{flow.userflowname}</td>
                <td className="px-3 py-2">{flow.status}</td>
                <td className="px-3 py-2 text-muted-foreground">{formatTs(flow.updatedAt)}</td>
                <td className="px-3 py-2 text-right space-x-2">
                  <Link
                    href={`/flows/${flow.userflowid}`}
                    className="text-primary hover:underline"
                  >
                    {canUpdate ? "Edit" : "View"}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

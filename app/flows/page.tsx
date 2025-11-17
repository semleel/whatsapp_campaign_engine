"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Api } from "@/lib/client";
import type { FlowListItem } from "@/lib/types";

type Stat = { label: string; value: number };

export default function FlowListPage() {
  const [flows, setFlows] = useState<FlowListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    Api.listFlows()
      .then((data) => {
        if (!cancelled) setFlows(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load flows."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
    if (!ts) return "—";
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return ts;
    return d.toLocaleString();
  };

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
        <Link
          href="/flows/create"
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          New flow
        </Link>
      </div>

      {/* Stats */}
      <div className="grid gap-3 md:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-xl border p-4">
            <div className="text-sm text-muted-foreground">{stat.label}</div>
            <div className="text-2xl font-semibold">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Table / states */}
      <div className="rounded-xl border overflow-x-auto">
        {loading ? (
          <div className="p-4 text-sm text-muted-foreground">
            Loading flows…
          </div>
        ) : error ? (
          <div className="p-4 text-sm text-red-600">
            Failed to load flows: {error}
          </div>
        ) : flows.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">
            No flows yet. Click <span className="font-medium">New flow</span> to
            create your first one.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Flow</th>
                <th className="px-3 py-2 text-left font-medium">Entry key</th>
                <th className="px-3 py-2 text-left font-medium">Fallback</th>
                <th className="px-3 py-2 text-left font-medium">Nodes</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-left font-medium">Updated</th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {flows.map((flow) => (
                <tr key={flow.userflowid} className="border-t">
                  <td className="px-3 py-2 font-medium">
                    {flow.userflowname}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {flow.entryKey ?? "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {flow.fallbackKey ?? "—"}
                  </td>
                  <td className="px-3 py-2">{flow.nodeCount}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${flow.status === "Active" || flow.status === "Published"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-200 text-slate-700"
                        }`}
                    >
                      {flow.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {formatTs(flow.updatedAt)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/flows/${flow.userflowid}`}
                      className="rounded border px-3 py-1"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

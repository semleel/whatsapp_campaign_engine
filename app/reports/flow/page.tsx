"use client";

import { useEffect, useMemo, useState } from "react";
import { Api } from "@/lib/client";
import type { FlowStat } from "@/lib/types";

export default function FlowReportPage() {
  const [rows, setRows] = useState<FlowStat[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await Api.listFlowStats();
        setRows(data);
        setError(null);
      } catch (e: any) {
        setError(e?.message || "Failed to load flow stats.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return rows.filter((r) => r.name.toLowerCase().includes(q));
  }, [rows, query]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">Flow report</h3>
          <p className="text-sm text-muted-foreground">
            Sessions and completion rates grouped by campaign.
          </p>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search campaign"
          className="w-56 rounded-md border px-2 py-1 text-sm"
        />
      </div>

      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : loading ? (
        <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
          Loading flow stats...
        </div>
      ) : (
        <div className="rounded-xl border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Campaign</th>
                <th className="px-3 py-2 text-left font-medium">Sessions</th>
                <th className="px-3 py-2 text-left font-medium">Completed</th>
                <th className="px-3 py-2 text-left font-medium">Completion</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    className="px-3 py-4 text-sm text-muted-foreground"
                    colSpan={4}
                  >
                    No flow stats yet.
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={`${row.campaignid ?? "n/a"}-${row.name}`} className="border-t">
                    <td className="px-3 py-2">{row.name}</td>
                    <td className="px-3 py-2">{row.sessions}</td>
                    <td className="px-3 py-2">{row.completed}</td>
                    <td className="px-3 py-2">
                      <span className="pill">{row.completionRate}%</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

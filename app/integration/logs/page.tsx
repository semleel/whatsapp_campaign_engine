// app/integration/logs/page.tsx

"use client";

import { useEffect, useMemo, useState } from "react";
import { Api } from "@/lib/client";
import type { ApiLogEntry } from "@/lib/types";
import { usePrivilege } from "@/lib/permissions";

const formatDateTime = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
};

const normalizeNumberString = (value: string) => value.trim();

export default function LogsPage() {
  const { canView, loading: privLoading } = usePrivilege("integration");
  const [logs, setLogs] = useState<ApiLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterEndpointId, setFilterEndpointId] = useState("");
  const [filterCampaignId, setFilterCampaignId] = useState("");
  const [filterContactId, setFilterContactId] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "success" | "error">("all");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  useEffect(() => {
    if (privLoading) return;
    if (!canView) {
      setError("You do not have permission to view integration logs.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    Api.listLogs({ limit: 200 })
      .then((rows) => setLogs(rows || []))
      .catch((err) => setError(err?.message || "Failed to load logs"))
      .finally(() => setLoading(false));
  }, [canView, privLoading]);

  const endpointOptions = useMemo(() => {
    const map = new Map<number, ApiLogEntry>();
    logs.forEach((log) => {
      if (log.apiid != null && !map.has(log.apiid)) {
        map.set(log.apiid, log);
      }
    });
    return Array.from(map.values()).map((log) => ({
      value: log.apiid ?? 0,
      label: `${(log.method || "CALL").toUpperCase()} — ${log.endpoint || log.request_url || `#${log.apiid}`
        }`,
    }));
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const fromTimestamp =
      filterFrom && !Number.isNaN(new Date(filterFrom).getTime())
        ? new Date(filterFrom).setHours(0, 0, 0, 0)
        : null;
    const toTimestamp =
      filterTo && !Number.isNaN(new Date(filterTo).getTime())
        ? new Date(filterTo).setHours(23, 59, 59, 999)
        : null;

    return logs.filter((log) => {
      if (filterEndpointId && String(log.apiid) !== normalizeNumberString(filterEndpointId)) {
        return false;
      }
      if (filterCampaignId && String(log.campaignid) !== normalizeNumberString(filterCampaignId)) {
        return false;
      }
      if (filterContactId && String(log.contactid) !== normalizeNumberString(filterContactId)) {
        return false;
      }
      if (filterStatus !== "all" && log.status !== filterStatus) {
        return false;
      }
      if (fromTimestamp || toTimestamp) {
        const calledAt = log.called_at ? new Date(log.called_at).getTime() : null;
        if (calledAt != null) {
          if (fromTimestamp != null && calledAt < fromTimestamp) return false;
          if (toTimestamp != null && calledAt > toTimestamp) return false;
        }
      }
      return true;
    });
  }, [logs, filterEndpointId, filterCampaignId, filterContactId, filterStatus, filterFrom, filterTo]);

  const sortedLogs = useMemo(
    () =>
      [...filteredLogs].sort(
        (a, b) =>
          (new Date(b.called_at).getTime() || 0) - (new Date(a.called_at).getTime() || 0)
      ),
    [filteredLogs]
  );

  const totalCount = logs.length;
  const filteredCount = filteredLogs.length;
  const successCount = useMemo(
    () => filteredLogs.filter((log) => log.status === "success").length,
    [filteredLogs]
  );
  const errorCount = useMemo(
    () => filteredLogs.filter((log) => log.status === "error").length,
    [filteredLogs]
  );

  const handleClearFilters = () => {
    setFilterEndpointId("");
    setFilterCampaignId("");
    setFilterContactId("");
    setFilterStatus("all");
    setFilterFrom("");
    setFilterTo("");
  };

  if (!privLoading && !canView) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
        You do not have permission to view integration logs.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Integration logs</h3>
          <p className="text-sm text-muted-foreground">
            Inspect recent API calls, with campaign and contact context.
          </p>
        </div>
      </div>

      {/* Summary + Filters */}
      <div className="space-y-3">
        {/* Summary strip */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1">
            <span className="font-semibold">{filteredCount}</span>
            <span className="text-muted-foreground">
              {filteredCount === 1 ? "log shown" : "logs shown"}
              {totalCount > 0 && filteredCount !== totalCount
                ? ` of ${totalCount} total`
                : ""}
            </span>
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className="font-semibold">{successCount}</span>
            <span className="text-emerald-800/80">success</span>
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-1 text-rose-700">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
            <span className="font-semibold">{errorCount}</span>
            <span className="text-rose-800/80">error</span>
          </span>
        </div>

        {/* Filters panel */}
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Filters
              </p>
              <p className="text-xs text-muted-foreground">
                Narrow down logs by endpoint, campaign, contact, status or date range.
              </p>
            </div>
            <button
              type="button"
              onClick={handleClearFilters}
              className="rounded-md border bg-background px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
            >
              Clear filters
            </button>
          </div>

          <div className="mt-3 space-y-3">
            <div className="grid gap-3 lg:grid-cols-4">
              <label className="text-xs space-y-1">
                <span className="text-muted-foreground">Endpoint</span>
                <select
                  className="w-full rounded border bg-background px-2 py-1 text-sm"
                  value={filterEndpointId}
                  onChange={(e) => setFilterEndpointId(e.target.value)}
                >
                  <option value="">All</option>
                  {endpointOptions.map((option) => (
                    <option key={option.value} value={String(option.value)}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs space-y-1">
                <span className="text-muted-foreground">Campaign ID</span>
                <input
                  type="text"
                  className="w-full rounded border bg-background px-2 py-1 text-sm"
                  value={filterCampaignId}
                  onChange={(e) => setFilterCampaignId(e.target.value)}
                  placeholder="e.g. 123"
                />
              </label>
              <label className="text-xs space-y-1">
                <span className="text-muted-foreground">Contact ID</span>
                <input
                  type="text"
                  className="w-full rounded border bg-background px-2 py-1 text-sm"
                  value={filterContactId}
                  onChange={(e) => setFilterContactId(e.target.value)}
                  placeholder="e.g. 456"
                />
              </label>
              <label className="text-xs space-y-1">
                <span className="text-muted-foreground">Status</span>
                <select
                  className="w-full rounded border bg-background px-2 py-1 text-sm"
                  value={filterStatus}
                  onChange={(e) =>
                    setFilterStatus(e.target.value as "all" | "success" | "error")
                  }
                >
                  <option value="all">All</option>
                  <option value="success">Success</option>
                  <option value="error">Error</option>
                </select>
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs space-y-1">
                <span className="text-muted-foreground">From</span>
                <input
                  type="date"
                  className="w-full rounded border bg-background px-2 py-1 text-sm"
                  value={filterFrom}
                  onChange={(e) => setFilterFrom(e.target.value)}
                />
              </label>
              <label className="text-xs space-y-1">
                <span className="text-muted-foreground">To</span>
                <input
                  type="date"
                  className="w-full rounded border bg-background px-2 py-1 text-sm"
                  value={filterTo}
                  onChange={(e) => setFilterTo(e.target.value)}
                />
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading logs...</div>
      ) : sortedLogs.length === 0 ? (
        <div className="rounded-xl border bg-card px-4 py-6 text-sm text-muted-foreground text-center">
          No logs match the selected filters.
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
          <div className="grid grid-cols-[minmax(0,2.5fr)_minmax(0,1.5fr)_minmax(0,1.5fr)_minmax(0,1.5fr)] gap-2 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Endpoint</span>
            <span>Campaign</span>
            <span>Contact</span>
            <span className="text-right">Time / Status</span>
          </div>
          <div className="divide-y">
            {sortedLogs.map((log) => (
              <div
                key={log.logid}
                className="grid grid-cols-[minmax(0,2.5fr)_minmax(0,1.5fr)_minmax(0,1.5fr)_minmax(0,1.5fr)] gap-2 px-4 py-3 text-xs hover:bg-muted/40"
              >
                {/* Endpoint / details */}
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span>
                      {log.status === "success" ? "✅" : log.status === "error" ? "⚠️" : "ℹ️"}
                    </span>
                    <span className="font-medium">
                      {(log.method || "CALL").toUpperCase()}{" "}
                      {log.endpoint || log.request_url || `#${log.apiid}`}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                    <span>Source: {log.source || "n/a"}</span>
                    {log.stepid != null && <span>• Step #{log.stepid}</span>}
                    {log.template_used && <span>• Template: {log.template_used}</span>}
                  </div>
                  {log.error_message && (
                    <div className="mt-1 text-[11px] text-rose-600">
                      {log.error_message}
                    </div>
                  )}
                </div>

                {/* Campaign */}
                <div className="text-[11px] text-muted-foreground">
                  {log.campaignname
                    ? `${log.campaignname} (#${log.campaignid ?? "-"})`
                    : log.campaignid != null
                      ? `#${log.campaignid}`
                      : "-"}
                </div>

                {/* Contact */}
                <div className="text-[11px] text-muted-foreground">
                  {log.contact_phone || "-"}
                  {log.contactid != null && ` (#${log.contactid})`}
                </div>

                {/* Time / status */}
                <div className="text-right text-[11px] text-muted-foreground">
                  <div>{formatDateTime(log.called_at)}</div>
                  <div className="mt-1 flex justify-end gap-1">
                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5">
                      <span className="text-[10px]">
                        Code: {log.response_code ?? "-"}
                      </span>
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${log.status === "success"
                          ? "bg-emerald-50 text-emerald-700"
                          : log.status === "error"
                            ? "bg-rose-50 text-rose-700"
                            : "bg-slate-100 text-slate-700"
                        }`}
                    >
                      {log.status ?? "-"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

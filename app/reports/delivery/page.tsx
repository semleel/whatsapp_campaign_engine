"use client";

import { useEffect, useMemo, useState } from "react";
import { Api } from "@/lib/client";
import type { DeliveryReportRow } from "@/lib/types";

function formatDate(value: string | null) {
  if (!value) return "--";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function statusTone(status: string | null) {
  const s = (status || "").toLowerCase();
  if (s === "delivered" || s === "sent" || s === "read") {
    return "bg-emerald-100 text-emerald-700";
  }
  if (s === "failed" || s === "error") {
    return "bg-rose-100 text-rose-700";
  }
  return "bg-amber-100 text-amber-700";
}

export default function DeliveryReportPage() {
  const [deliveries, setDeliveries] = useState<DeliveryReportRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await Api.listDeliveryReport(200);
        setDeliveries(data);
        setError(null);
      } catch (e: any) {
        setError(e?.message || "Failed to load delivery report.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const summary = useMemo(() => {
    const total = deliveries.length;
    const lower = deliveries.map((d) => (d.status || "").toLowerCase());
    const success = lower.filter((s) => ["delivered", "sent", "read"].includes(s)).length;
    const failed = lower.filter((s) => ["failed", "error"].includes(s)).length;
    const pending = total - success - failed;
    const successRate = total ? Number(((success / total) * 100).toFixed(1)) : 0;
    return { total, success, failed, pending, successRate };
  }, [deliveries]);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Delivery report</h3>
        <p className="text-sm text-muted-foreground">
          Joined from <code>message</code> + <code>deliverlog</code>.
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : loading ? (
        <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
          Loading delivery report...
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-border bg-card px-4 py-3">
              <div className="text-xs text-muted-foreground">Total</div>
              <div className="text-2xl font-semibold">{summary.total}</div>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div className="text-xs text-emerald-700">Delivered/Read/Sent</div>
              <div className="text-2xl font-semibold text-emerald-800">
                {summary.success}
              </div>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <div className="text-xs text-amber-700">Pending</div>
              <div className="text-2xl font-semibold text-amber-800">{summary.pending}</div>
            </div>
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3">
              <div className="text-xs text-rose-700">Failed/Error</div>
              <div className="text-2xl font-semibold text-rose-800">{summary.failed}</div>
              <div className="text-xs text-rose-700 mt-1">
                Success rate: {summary.successRate}%
              </div>
            </div>
          </div>

          <div className="rounded-xl border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Message</th>
                  <th className="px-3 py-2 text-left font-medium">Campaign</th>
                  <th className="px-3 py-2 text-left font-medium">Contact</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-left font-medium">Retries</th>
                  <th className="px-3 py-2 text-left font-medium">Sent at</th>
                  <th className="px-3 py-2 text-left font-medium">Error</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-sm text-muted-foreground" colSpan={7}>
                      No delivery records yet.
                    </td>
                  </tr>
                ) : (
                  deliveries.map((row) => (
                    <tr key={row.messageid} className="border-t">
                      <td className="px-3 py-2 font-mono text-xs">#{row.messageid}</td>
                      <td className="px-3 py-2">{row.campaign || "--"}</td>
                      <td className="px-3 py-2">{row.contact || "--"}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(
                            row.status
                          )}`}
                        >
                          {row.status || "pending"}
                        </span>
                      </td>
                      <td className="px-3 py-2">{row.retrycount ?? 0}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {formatDate(row.sentAt)}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {row.error_message || "--"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Api } from "@/lib/client";
import type { ReportSummary } from "@/lib/types";

export default function ReportsLandingPage() {
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await Api.getReportSummary();
        setSummary(data);
        setError(null);
      } catch (e: any) {
        setError(e?.message || "Failed to load report summary.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const trending = useMemo(() => summary?.trending ?? [], [summary]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">Reporting</h3>
          <p className="text-sm text-muted-foreground">
            Pull insights directly from <code>message</code>, <code>deliverlog</code>, and{" "}
            <code>sessionlog</code>.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/reports/delivery" className="btn btn-ghost text-sm px-3">
            Delivery
          </Link>
          <Link href="/reports/flow" className="btn btn-primary text-sm px-3">
            Flow
          </Link>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : loading ? (
        <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
          Loading summary...
        </div>
      ) : summary ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border p-4">
              <div className="text-sm text-muted-foreground">Messages (total)</div>
              <div className="text-2xl font-semibold">{summary.metrics.messagesTotal}</div>
              <div className="text-xs text-muted-foreground">
                Last 24h: {summary.metrics.messagesLast24}
              </div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="text-sm text-muted-foreground">Delivery rate (7d)</div>
              <div className="text-2xl font-semibold">{summary.metrics.deliveryRate}%</div>
              <div className="text-xs text-muted-foreground">
                {summary.metrics.deliveriesSuccess} ok / {summary.metrics.deliveriesFailed} failed
              </div>
            </div>
            <div className="rounded-xl border p-4">
              <div className="text-sm text-muted-foreground">Active campaigns</div>
              <div className="text-2xl font-semibold">{summary.metrics.activeCampaigns}</div>
            </div>
          </div>

          <section className="rounded-xl border p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-base font-semibold">Trending campaigns (last 7d)</h4>
            </div>
            <div className="space-y-3">
              {trending.length === 0 ? (
                <div className="text-sm text-muted-foreground">No campaigns yet.</div>
              ) : (
                trending.map((campaign) => (
                  <div
                    key={`${campaign.campaignid ?? "n/a"}-${campaign.name}`}
                    className="rounded-lg border px-3 py-2 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-medium">{campaign.name}</div>
                        <div className="text-xs text-muted-foreground">Sent: {campaign.sent}</div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Delivered {campaign.delivered}/{campaign.sent} ({campaign.deliveredRate}%)
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

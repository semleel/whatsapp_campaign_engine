"use client";

import { usePrivilege } from "@/lib/permissions";

type StatCard = {
  label: string;
  value: string;
  desc: string;
  tone?: "alert" | "info";
};

type TimelineEvent = {
  title: string;
  time: string;
};

type HealthRow = {
  name: string;
  pct: number;
  warn?: boolean;
};

const statCards: StatCard[] = [
  { label: "Active Campaigns", value: "12", desc: "Running right now" },
  { label: "Messages Sent", value: "24.1k", desc: "Last 30 days" },
  { label: "Delivery Rate", value: "98.4%", desc: "Across all channels" },
  { label: "Conversion Rate", value: "4.8%", desc: "Click to goal", tone: "alert" },
  { label: "Opt-outs", value: "1.2%", desc: "Last 30 days" },
];

const recentEvents: TimelineEvent[] = [
  { title: "Campaign \"Diwali Blast\" scheduled", time: "2h ago" },
  { title: "Flow \"Onboarding\" updated", time: "4h ago" },
  { title: "New template approved", time: "Yesterday" },
];

const campaignHealth: HealthRow[] = [
  { name: "Opt-in freshness", pct: 78 },
  { name: "Template approvals", pct: 92 },
  { name: "Spam reports", pct: 3, warn: true },
];

const channelPerformance: HealthRow[] = [
  { name: "WhatsApp", pct: 88 },
  { name: "Email", pct: 64 },
  { name: "SMS", pct: 52 },
];

const flowDropoffs: HealthRow[] = [
  { name: "Welcome flow", pct: 6 },
  { name: "Reactivation", pct: 12, warn: true },
  { name: "Win-back", pct: 9 },
];

export default function Home() {
  const {
    canView,
    canCreate: canCreateCampaign,
    loading: campaignLoading,
  } = usePrivilege("campaigns");
  const {
    canCreate: canCreateContent,
    canUpdate: canUpdateContent,
  } = usePrivilege("content");
  const {
    canCreate: canCreateIntegration,
  } = usePrivilege("integration");

  if (!campaignLoading && !canView) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
        You do not have permission to view the overview.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold tracking-tight">Overview</h2>
        <div className="flex gap-2">
          <button className="btn btn-ghost">Export</button>
          {canCreateCampaign && (
            <button className="btn btn-primary">Create Campaign</button>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 md:grid-cols-4 xl:grid-cols-5">
        {statCards.map((card) => (
          <div key={card.label} className="card card-hover p-4">
            <div className={`pill mb-2 ${card.tone === "alert" ? "bg-red-50 text-red-600" : ""}`}>
              {card.label}
            </div>
            <div className="text-3xl font-semibold">{card.value}</div>
            <div className="mt-1 text-sm text-muted-foreground">{card.desc}</div>
          </div>
        ))}
      </div>

      {/* Two-up layout */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card card-hover p-4">
          <h3 className="text-sm font-medium mb-3">Recent Events</h3>
          <ul className="space-y-2">
            {recentEvents.map((event, i) => (
              <li
                key={i}
                className="flex items-center justify-between rounded-md bg-secondary px-3 py-2"
              >
                <span className="text-sm">{event.title}</span>
                <span className="pill">{event.time}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="card card-hover p-4">
          <h3 className="text-sm font-medium mb-3">Campaign Health</h3>
          <div className="space-y-3">
            {campaignHealth.map((row) => (
              <div key={row.name}>
                <div className="flex items-center justify-between">
                  <div className="text-sm">{row.name}</div>
                  <div className={`text-xs ${row.warn ? "text-red-600" : "text-muted-foreground"}`}>
                    {row.pct}%
                  </div>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full ${row.warn ? "bg-red-500" : "bg-primary"}`}
                    style={{ width: `${row.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card card-hover p-4">
          <h3 className="text-sm font-medium mb-3">Channel Performance</h3>
          <div className="space-y-3">
            {channelPerformance.map((row) => (
              <div key={row.name}>
                <div className="flex items-center justify-between">
                  <div className="text-sm">{row.name}</div>
                  <div className="text-xs text-muted-foreground">{row.pct}%</div>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary" style={{ width: `${row.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card card-hover p-4">
          <h3 className="text-sm font-medium mb-3">Flow Drop-offs</h3>
          <div className="space-y-3">
            {flowDropoffs.map((row) => (
              <div key={row.name}>
                <div className="flex items-center justify-between">
                  <div className="text-sm">{row.name}</div>
                  <div className={`text-xs ${row.warn ? "text-red-600" : "text-muted-foreground"}`}>
                    {row.pct}% exit
                  </div>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full ${row.warn ? "bg-red-500" : "bg-primary"}`}
                    style={{ width: `${row.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Palette / actions */}
        <div className="card card-hover p-4 md:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div className="font-semibold">Quick Actions</div>
            <div className="pill text-xs text-muted-foreground">SLA: 99.9% (24h)</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canCreateContent && <button className="btn btn-primary">New Template</button>}
            {canUpdateContent && <button className="btn btn-ghost">Validate Content</button>}
            {canCreateCampaign && (
              <button className="btn btn-ghost">Schedule Campaign</button>
            )}
            {canCreateIntegration && <button className="btn btn-ghost">Live API Test</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

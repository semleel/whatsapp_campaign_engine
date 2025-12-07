"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Api } from "@/lib/client";
import type {
  TemplateActivityItem,
  TemplateExpiryItem,
  TemplateUsageItem,
  TemplatesOverviewResponse,
  TemplateOverviewCounts,
} from "@/lib/types";

type TemplatePipelineCounts = TemplatesOverviewResponse["pipeline"];

const EMPTY_COUNTS: TemplateOverviewCounts = {
  total: 0,
  approved: 0,
  pendingMeta: 0,
  draft: 0,
  expired: 0,
  rejected: 0,
};

const EMPTY_PIPELINE: TemplatePipelineCounts = {
  draft: 0,
  pendingMeta: 0,
  approved: 0,
  rejected: 0,
  expired: 0,
};

function formatTimeAgo(dateString?: string | null): string {
  if (!dateString) return "-";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "-";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 7) return date.toLocaleDateString();
  if (days >= 1) return `${days} day${days > 1 ? "s" : ""} ago`;
  if (hours >= 1) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  if (minutes >= 1) return `${minutes} min${minutes > 1 ? "s" : ""} ago`;
  return "Just now";
}

function formatDate(dateString?: string | null): string {
  if (!dateString) return "-";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatExpiryLabel(dateString?: string | null): string {
  if (!dateString) return "-";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "-";
  const diffDays = Math.round((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "Expired";
  if (diffDays === 0) return "Expires today";
  if (diffDays === 1) return "Expires tomorrow";
  return `Expires in ${diffDays} days`;
}

function statusLabel(status?: string | null): string {
  if (!status) return "Approved";
  const trimmed = status.trim();
  const lower = trimmed.toLowerCase();
  if (lower === "pending_meta" || lower === "pending meta") return "Pending Meta";
  if (lower === "approved") return "Approved";
  if (lower === "expired") return "Expired";
  if (lower === "reject" || lower === "rejected") return "Rejected";
  if (lower === "draft") return "Draft";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function statusTone(status?: string | null): string {
  const lower = (status || "").toLowerCase();
  if (lower.startsWith("draft")) return "text-amber-600";
  if (lower.startsWith("pending")) return "text-blue-600";
  if (lower.startsWith("reject")) return "text-rose-600";
  if (lower.startsWith("expired")) return "text-slate-600";
  return "text-emerald-600";
}

function useTemplatesOverview() {
  const [data, setData] = useState<TemplatesOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await Api.getTemplatesOverview();
        if (!active) return;
        setData(res);
      } catch (err: any) {
        console.error("Failed to fetch templates overview:", err);
        if (active) setError(err?.message || "Failed to load data");
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, []);

  return { data, loading, error };
}

function TemplateStatsCards({ counts }: { counts: TemplateOverviewCounts }) {
  const items = [
    { label: "Total Templates", value: counts.total },
    { label: "Approved", value: counts.approved },
    { label: "Pending Meta", value: counts.pendingMeta },
    { label: "Draft", value: counts.draft },
    { label: "Expired", value: counts.expired },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {items.map((item) => (
        <Card key={item.label} className="shadow-sm">
          <CardContent className="px-4 py-3">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className="text-2xl font-semibold">{item.value ?? 0}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function RecentActivities({ items }: { items: TemplateActivityItem[] }) {
  return (
    <Card className="shadow-sm h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Recent Activities</CardTitle>
        <CardDescription>Latest template edits and approvals.</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No recent changes yet. Create or update a template to see it here.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-3">
                <span
                  className={`h-2.5 w-2.5 rounded-full bg-current ${statusTone(item.status)}`}
                />
                <div className="min-w-0">
                  <Link
                    href={`/content/templates/${item.id}`}
                    className="block text-sm font-medium hover:underline truncate"
                    title={item.title}
                  >
                    {item.title}
                  </Link>
                  <p className={`text-xs ${statusTone(item.status)}`}>
                    {statusLabel(item.status)}
                  </p>
                </div>
                <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
                  {formatTimeAgo(item.updatedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ApprovalPipeline({
  pipeline,
}: {
  pipeline: TemplatePipelineCounts;
}) {
  const steps = [
    { key: "draft", label: "Draft", value: pipeline.draft, color: "bg-amber-400" },
    { key: "pendingMeta", label: "Pending Meta", value: pipeline.pendingMeta, color: "bg-blue-500" },
    { key: "approved", label: "Approved", value: pipeline.approved, color: "bg-emerald-500" },
    { key: "rejected", label: "Rejected", value: pipeline.rejected, color: "bg-rose-500" },
    { key: "expired", label: "Expired", value: pipeline.expired, color: "bg-slate-400" },
  ];

  const total = steps.reduce((sum, s) => sum + (s.value || 0), 0) || 1;

  return (
    <Card className="shadow-sm h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Template Approval Pipeline</CardTitle>
        <CardDescription>Live distribution across lifecycle states.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex w-full h-3 overflow-hidden rounded-full bg-muted">
          {steps.map((s) => (
            <div
              key={s.key}
              style={{ width: `${((s.value || 0) / total) * 100}%` }}
              className={`${s.color} transition-all`}
            />
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          {steps.map((s) => (
            <div key={s.key} className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${s.color}`} />
              <span className="text-muted-foreground">{s.label}</span>
              <span className="ml-auto font-semibold">{s.value ?? 0}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function TopTemplates({ items }: { items: TemplateUsageItem[] }) {
  if (!items.length) {
    return (
      <Card className="shadow-sm h-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Most Used Templates</CardTitle>
          <CardDescription>
            No usage data yet. Once templates are used in flows, they will appear here.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const maxUsage = Math.max(...items.map((i) => i.usageCount), 1);

  return (
    <Card className="shadow-sm h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Most Used Templates</CardTitle>
        <CardDescription>Top templates used across campaigns.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.map((item) => {
          const width = `${(item.usageCount / maxUsage) * 100}%`;
          return (
            <div key={item.id} className="space-y-2">
              <div className="flex items-start gap-2">
                <div className="min-w-0">
                  <Link
                    href={`/content/templates/${item.id}`}
                    className="text-sm font-medium hover:underline truncate block"
                    title={item.title}
                  >
                    {item.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {item.type ? item.type.toUpperCase() : "MESSAGE"} · {statusLabel(item.status)}
                  </p>
                </div>
                <span className="ml-auto text-sm font-semibold text-muted-foreground">
                  {item.usageCount} use{item.usageCount === 1 ? "" : "s"}
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary rounded-full" style={{ width }} />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function UpcomingExpiries({ items }: { items: TemplateExpiryItem[] }) {
  return (
    <Card className="shadow-sm h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Upcoming Expiries</CardTitle>
        <CardDescription>Templates expiring within 30 days.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No templates are expiring soon.
          </p>
        ) : (
          <ul className="space-y-3 text-sm">
            {items.map((item) => (
              <li key={item.id} className="flex items-start gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/content/templates/${item.id}`}
                    className="font-medium hover:underline block truncate"
                    title={item.title}
                  >
                    {item.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {statusLabel(item.status)}
                  </p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-xs text-muted-foreground">
                    {formatExpiryLabel(item.expiresAt)}
                  </p>
                  <p className="text-sm font-semibold text-amber-700">
                    {formatDate(item.expiresAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default function ContentEngineOverviewPage() {
  const { data, loading, error } = useTemplatesOverview();
  const counts = data?.counts ?? EMPTY_COUNTS;
  const pipeline = data?.pipeline ?? EMPTY_PIPELINE;

  return (
    <div className="px-4 md:px-8 py-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Content Engine</h1>
          <p className="text-sm text-muted-foreground">
            Overview of WhatsApp templates and content usage.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/content/templates">Open Template Library</Link>
          </Button>
          <Button asChild>
            <Link href="/content/templates/create">+ New Template</Link>
          </Button>
        </div>
      </div>

      {loading && (
        <div className="text-sm text-muted-foreground">Loading analytics...</div>
      )}
      {error && !loading && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load overview: {error}
        </div>
      )}

      {data && (
        <div className="space-y-6">
          <TemplateStatsCards counts={counts} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RecentActivities items={data.recent} />
            <ApprovalPipeline pipeline={pipeline} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TopTemplates items={data.mostUsed} />
            <UpcomingExpiries items={data.upcomingExpiries} />
          </div>
        </div>
      )}

      {!loading && !data && !error && (
        <div className="text-sm text-muted-foreground">
          No overview data available yet.
        </div>
      )}
    </div>
  );
}

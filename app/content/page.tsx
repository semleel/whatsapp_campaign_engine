"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Api } from "@/lib/client";
import type { TemplateListItem } from "@/lib/types";

// ------------------------------
// Types
// ------------------------------

type TemplateStats = {
  total: number;
  approved: number;
  pendingMeta: number;
  draft: number;
  expired: number;
};

type RecentActivity = {
  id: string | number;
  templateName: string;
  action: string;          // e.g. "approved", "updated", "expired"
  timestamp: string;       // ISO string from backend
};

type TemplateUsage = {
  id: string | number;
  templateName: string;
  usageCount: number;
};

type ExpiringTemplate = {
  id: string | number;
  templateName: string;
  expiresAt: string;       // ISO string
};

type TemplatesOverviewResponse = {
  stats: TemplateStats;
  recentActivities: RecentActivity[];
  topTemplates: TemplateUsage[];
  upcomingExpiries: ExpiringTemplate[];
};

type TemplateRecord = TemplateListItem & {
  createdat?: string | null;
  expiresat?: string | null;
  isdeleted?: boolean | null;
};

// ------------------------------
// Helpers
// ------------------------------

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 7) {
    return date.toLocaleDateString();
  } else if (days >= 1) {
    return `${days} day${days > 1 ? "s" : ""} ago`;
  } else if (hours >= 1) {
    return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  } else if (minutes >= 1) {
    return `${minutes} min${minutes > 1 ? "s" : ""} ago`;
  }
  return "Just now";
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function buildOverview(templates: TemplateRecord[]): TemplatesOverviewResponse {
  const now = Date.now();
  const activeTemplates = templates.filter((t) => !t.isdeleted);
  const stats: TemplateStats = {
    total: activeTemplates.length,
    approved: 0,
    pendingMeta: 0,
    draft: 0,
    expired: 0,
  };

  activeTemplates.forEach((t) => {
    const status = (t.status || "").toLowerCase();
    if (status === "draft") stats.draft += 1;
    else if (status === "active" || status === "approved") stats.approved += 1;
    else if (status.includes("pending")) stats.pendingMeta += 1;

    const expTs = t.expiresat ? new Date(t.expiresat).getTime() : NaN;
    if (!Number.isNaN(expTs) && expTs < now) {
      stats.expired += 1;
    }
  });

  const recentActivities: RecentActivity[] = [...activeTemplates]
    .map((t) => {
      const ts =
        t.updatedat ||
        t.lastupdated ||
        t.createdat ||
        new Date().toISOString();

      return {
        id: t.contentid,
        templateName: t.title || `Template ${t.contentid}`,
        action: t.status || "updated",
        timestamp: ts,
      };
    })
    .sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    )
    .slice(0, 6);

  const upcomingExpiries: ExpiringTemplate[] = activeTemplates
    .filter((t) => {
      if (!t.expiresat) return false;
      const ts = new Date(t.expiresat).getTime();
      return !Number.isNaN(ts) && ts > now;
    })
    .sort(
      (a, b) =>
        new Date(a.expiresat ?? "").getTime() -
        new Date(b.expiresat ?? "").getTime(),
    )
    .slice(0, 5)
    .map((t) => ({
      id: t.contentid,
      templateName: t.title || `Template ${t.contentid}`,
      expiresAt: t.expiresat as string,
    }));

  return {
    stats,
    recentActivities,
    topTemplates: [],
    upcomingExpiries,
  };
}

// ------------------------------
// API fetch hook
// ------------------------------

function useTemplatesOverview() {
  const [data, setData] = useState<TemplatesOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const templates = (await Api.listTemplates(true)) as TemplateRecord[];
        if (isMounted) {
          setData(buildOverview(templates));
        }
      } catch (err: any) {
        console.error("Failed to fetch templates overview:", err);
        if (isMounted) {
          setError(err?.message || "Failed to load data");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, []);

  return { data, loading, error };
}

// ------------------------------
// UI Components
// ------------------------------

function TemplateStatsCards({ stats }: { stats: TemplateStats }) {
  const items = [
    { label: "Total Templates", value: stats.total },
    { label: "Approved", value: stats.approved },
    { label: "Pending Meta", value: stats.pendingMeta },
    { label: "Draft", value: stats.draft },
    { label: "Expired", value: stats.expired },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="p-4 bg-white border rounded-lg shadow-sm flex flex-col"
        >
          <span className="text-xs md:text-sm text-gray-500">
            {item.label}
          </span>
          <span className="mt-1 text-xl md:text-2xl font-semibold">
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function RecentActivities({ items }: { items: RecentActivity[] }) {
  if (!items.length) {
    return (
      <div className="bg-white p-5 rounded-lg border shadow-sm">
        <h2 className="text-lg font-semibold mb-4">Recent Activities</h2>
        <p className="text-sm text-gray-500">
          No recent changes yet. Create or update a template to see it here.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white p-5 rounded-lg border shadow-sm">
      <h2 className="text-lg font-semibold mb-4">Recent Activities</h2>
      <ul className="space-y-3">
        {items.map((x) => (
          <li key={x.id} className="flex items-center gap-2 text-sm">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="font-medium">{x.templateName}</span>
            <span className="text-gray-600">
              {x.action.charAt(0).toUpperCase() + x.action.slice(1)}
            </span>
            <span className="ml-auto text-gray-400">
              {formatTimeAgo(x.timestamp)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ApprovalPipeline({ stats }: { stats: TemplateStats }) {
  const steps = [
    { key: "draft", label: "Draft", value: stats.draft },
    { key: "pending", label: "Pending Meta", value: stats.pendingMeta },
    { key: "approved", label: "Approved", value: stats.approved },
    { key: "expired", label: "Expired", value: stats.expired },
  ];

  const total =
    stats.draft + stats.pendingMeta + stats.approved + stats.expired || 1;

  return (
    <div className="bg-white p-5 rounded-lg border shadow-sm">
      <h2 className="text-lg font-semibold mb-4">Template Approval Pipeline</h2>

      <div className="flex flex-col gap-3">
        <div className="flex w-full h-3 overflow-hidden rounded-full bg-gray-100">
          {steps.map((s) => {
            const width = `${(s.value / total) * 100}%`;
            const base =
              s.key === "approved"
                ? "bg-emerald-500"
                : s.key === "pending"
                ? "bg-blue-500"
                : s.key === "draft"
                ? "bg-amber-400"
                : "bg-gray-400";
            return (
              <div
                key={s.key}
                style={{ width }}
                className={`${base} transition-all`}
              />
            );
          })}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs md:text-sm">
          {steps.map((s) => (
            <div key={s.key} className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  s.key === "approved"
                    ? "bg-emerald-500"
                    : s.key === "pending"
                    ? "bg-blue-500"
                    : s.key === "draft"
                    ? "bg-amber-400"
                    : "bg-gray-400"
                }`}
              />
              <span className="text-gray-700">{s.label}</span>
              <span className="ml-auto font-semibold">{s.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TopTemplates({ items }: { items: TemplateUsage[] }) {
  if (!items.length) {
    return (
      <div className="bg-white p-5 rounded-lg border shadow-sm">
        <h2 className="text-lg font-semibold mb-2">Most Used Templates</h2>
        <p className="text-sm text-gray-500">
          No usage data yet. Once templates are used in flows, they will appear
          here.
        </p>
      </div>
    );
  }

  const maxUsage = Math.max(...items.map((i) => i.usageCount)) || 1;

  return (
    <div className="bg-white p-5 rounded-lg border shadow-sm">
      <h2 className="text-lg font-semibold mb-4">Most Used Templates</h2>
      <ul className="space-y-3">
        {items.map((x) => {
          const width = `${(x.usageCount / maxUsage) * 100}%`;
          return (
            <li key={x.id} className="text-sm">
              <div className="flex justify-between mb-1">
                <span className="font-medium">{x.templateName}</span>
                <span className="text-gray-500">{x.usageCount} uses</span>
              </div>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full"
                  style={{ width }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function UpcomingExpiries({ items }: { items: ExpiringTemplate[] }) {
  if (!items.length) {
    return (
      <div className="bg-white p-5 rounded-lg border shadow-sm">
        <h2 className="text-lg font-semibold mb-2">Upcoming Expiries</h2>
        <p className="text-sm text-gray-500">
          No templates are expiring soon.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white p-5 rounded-lg border shadow-sm">
      <h2 className="text-lg font-semibold mb-4">Upcoming Expiries</h2>
      <ul className="space-y-3 text-sm">
        {items.map((x) => (
          <li key={x.id} className="flex items-center">
            <span className="font-medium">{x.templateName}</span>
            <span className="ml-auto text-amber-600 font-semibold">
              {formatDate(x.expiresAt)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ------------------------------
// Page Component
// ------------------------------

export default function ContentEngineOverviewPage() {
  const { data, loading, error } = useTemplatesOverview();

  return (
    <div className="px-4 md:px-8 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Content Engine</h1>
          <p className="text-sm text-gray-500">
            Overview of WhatsApp templates and content usage.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/content/template-library"
            className="px-3 py-2 text-sm border rounded-lg hover:bg-gray-50"
          >
            Open Template Library
          </Link>
          <Link
            href="/content/template-library/create"
            className="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700"
          >
            + New Template
          </Link>
        </div>
      </div>

      {/* Loading / Error states */}
      {loading && (
        <div className="text-sm text-gray-500">Loading analytics...</div>
      )}
      {error && !loading && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load overview: {error}
        </div>
      )}

      {/* Content */}
      {data && (
        <div className="space-y-6">
          {/* Stats */}
          <TemplateStatsCards stats={data.stats} />

          {/* Middle row: recent + pipeline */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RecentActivities items={data.recentActivities} />
            <ApprovalPipeline stats={data.stats} />
          </div>

          {/* Bottom row: top templates + upcoming expiries */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TopTemplates items={data.topTemplates} />
            <UpcomingExpiries items={data.upcomingExpiries} />
          </div>
        </div>
      )}
    </div>
  );
}


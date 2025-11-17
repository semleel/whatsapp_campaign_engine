import Link from "next/link";
import { Api } from "@/lib/client";
import type { EndpointConfig, ApiLogEntry } from "@/lib/types";

const INTRO =
  "Connect WhatsApp user journeys to downstream APIs with a clean separation between campaign logic, parameter binding, and formatter fallbacks.";

const OBJECTIVES = [
  "Maintain a catalog of HTTPS endpoints stored in the api table.",
  "Inject contact/campaign variables into headers, query, path, or body via apiparameter.",
  "Map keymapping nodes to specific APIs with campaign_api_mapping, including success/error handoffs.",
  "Observe latency, retry, and error behaviour inside api_log without SSH-ing into servers.",
];

const FEATURE_CARDS = [
  {
    title: "Endpoint catalog",
    copy: "Re-usable definitions for each upstream API (base_url, path, auth, retry policy).",
    href: "/integration/endpoints",
  },
  {
    title: "Parameter binding",
    copy: "Per-parameter rules describing where each value comes from (contact, campaign, constant).",
    href: "/integration/endpoints",
  },
  {
    title: "Campaign mapping",
    copy: "Link content nodes or keywords to the correct API and define success/error follow-ups.",
    href: "/integration/mappings",
  },
  {
    title: "Observability",
    copy: "Inspect api_log entries to understand failures, latency, and payloads.",
    href: "/integration/logs",
  },
];

export default async function IntegrationHome() {
  let endpoints: EndpointConfig[] = [];
  let logs: ApiLogEntry[] = [];
  try {
    endpoints = await Api.listEndpoints();
  } catch {
    endpoints = [];
  }
  try {
    logs = await Api.listLogs(10);
  } catch {
    logs = [];
  }

  const stats = [
    { label: "Configured endpoints", value: endpoints.length },
    { label: "Retry enabled", value: endpoints.filter((ep) => ep.retry_enabled).length },
    { label: "Logs (latest)", value: logs.length },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-card p-6 space-y-4">
        <div className="space-y-2">
          <h3 className="text-base font-semibold">What this module covers</h3>
          <p className="text-sm text-muted-foreground">{INTRO}</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {OBJECTIVES.map((objective) => (
            <div key={objective} className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
              {objective}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border p-5 space-y-3">
        <h4 className="text-base font-semibold">Module stats</h4>
        <div className="grid gap-3 sm:grid-cols-3">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-lg border border-dashed px-3 py-2">
              <div className="text-sm text-muted-foreground">{stat.label}</div>
              <div className="text-xl font-semibold">{stat.value}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {FEATURE_CARDS.map((card) => (
          <article key={card.title} className="rounded-xl border p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h4 className="text-base font-semibold">{card.title}</h4>
                <p className="text-sm text-muted-foreground">{card.copy}</p>
              </div>
              <Link href={card.href} className="text-sm font-medium text-primary hover:underline">
                Open
              </Link>
            </div>
          </article>
        ))}
      </section>

      <section className="rounded-xl border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-base font-semibold">Recent api_log entries</h4>
          <Link href="/integration/logs" className="text-sm font-medium text-primary hover:underline">
            View all
          </Link>
        </div>
        <div className="space-y-3 text-sm">
          {logs.length ? (
            logs.map((log) => (
              <div key={log.logid} className="rounded-lg border px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="font-medium">API #{log.apiid ?? "—"}</div>
                  <span className="text-xs text-muted-foreground">{new Date(log.called_at || "").toLocaleString()}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-3 text-xs">
                  <span>Campaign #{log.campaignid ?? "—"}</span>
                  <span>Status: {log.status || "unknown"}</span>
                  <span>HTTP {log.response_code ?? "—"}</span>
                </div>
                {log.error_message && <div className="text-xs text-rose-600">{log.error_message}</div>}
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No logs captured yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}

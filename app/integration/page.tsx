import { Api } from "@/lib/client";
import type { EndpointConfig, LogEntry } from "@/lib/types";
import TestRunner from "@/components/TestRunner";
import Link from "next/link";

const modules = [
  {
    title: "API Connector & Request Dispatcher",
    description: "Creates secure HTTPS calls (GET/POST) to partner backends with token injection and retry rules.",
    bullets: [
      "Attach auth headers, tokens or API keys per endpoint.",
      "Inject context (campaignId, msisdn) into params/body before dispatch.",
      "Control retries + timeouts so WhatsApp UX stays snappy.",
    ],
    cta: { label: "Manage endpoints", href: "/integration/endpoints" },
  },
  {
    title: "Response Handler & Formatter",
    description: "Turns JSON/XML payloads into WhatsApp-friendly copy using formatter templates.",
    bullets: [
      "Map nested fields like response.customer.points -> {{points}}.",
      "Apply currency/date formatting via formatter helpers.",
      "Guarantee consistent tone before the reply reaches Content Engine.",
    ],
    cta: { label: "Response formatters", href: "/integration/formatters" },
  },
  {
    title: "Campaign API Mapping Layer",
    description: "Connects keywords/buttons to endpoints so every campaign can reuse the same integration stack.",
    bullets: [
      "Map triggers (keyword/button/list) to specific endpoints + formatter IDs.",
      "Versioned configs so multiple campaigns (RAYA2025 vs MERDEKA) stay isolated.",
      "No code changes required—ops updates the mapping table.",
    ],
    cta: { label: "Keyword mappings", href: "/integration/mappings" },
  },
  {
    title: "Error Handling & Fallback Responder",
    description: "Keeps users informed when upstream APIs fail, with optional retry for critical journeys.",
    bullets: [
      "Categorize 5xx/timeout/invalid payload errors and log them.",
      "Surface helpful fallback copy instead of raw error data.",
      "Optional auto-retry for redemption or high-value requests.",
    ],
    cta: { label: "View logs", href: "/integration/logs" },
  },
];

export default async function IntegrationHome() {
  let endpoints: EndpointConfig[] = [];
  let logs: LogEntry[] = [];
  try {
    endpoints = await Api.listEndpoints();
  } catch {
    endpoints = [];
  }
  try {
    logs = await Api.listLogs(20);
  } catch {
    logs = [];
  }

  const stats = [
    { label: "Configured endpoints", value: endpoints.length },
    { label: "Last 24h logs", value: logs.length },
    { label: "Retry-enabled APIs", value: endpoints.filter((e) => (e.retries ?? 0) > 0).length },
  ];

  return (
    <div className="space-y-6">
      <section className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border bg-card p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold">Backend Integration & Live API</h3>
              <p className="text-sm text-muted-foreground">
                Wire WhatsApp flows to partner systems, format the responses, and keep every campaign isolated yet reusable.
                Jump into endpoints, mappings, or run a live test below.
              </p>
            </div>
            <div className="flex gap-2">
              <Link href="/integration/endpoints" className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted">
                Endpoints
              </Link>
              <Link
                href="/integration/mappings"
                className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90"
              >
                Mappings
              </Link>
            </div>
          </div>
        </div>
        <div className="rounded-xl border p-6 space-y-3">
          {stats.map((stat) => (
            <div key={stat.label} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{stat.label}</span>
              <span className="text-lg font-semibold">{stat.value}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {modules.map((module) => (
          <article key={module.title} className="rounded-xl border p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h4 className="text-base font-semibold">{module.title}</h4>
                <p className="text-sm text-muted-foreground">{module.description}</p>
              </div>
              <Link href={module.cta.href} className="text-sm font-medium text-primary hover:underline">
                {module.cta.label}
              </Link>
            </div>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {module.bullets.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border p-5">
          <div className="mb-4">
            <h4 className="text-base font-semibold">Live test runner</h4>
            <p className="text-sm text-muted-foreground">
              Pick any endpoint, pass sample variables, and preview the outbound payload + formatted response.
            </p>
          </div>
          <TestRunner endpoints={endpoints as any} />
        </div>

        <div className="rounded-xl border p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-base font-semibold">Recent logs</h4>
            <Link href="/integration/logs" className="text-sm font-medium text-primary hover:underline">
              View all
            </Link>
          </div>
          <div className="space-y-3 text-sm">
            {logs.slice(0, 6).map((log) => (
              <div key={log.id} className="flex items-start gap-3">
                <span
                  className={`mt-1 h-2.5 w-2.5 rounded-full ${
                    log.level === "error" ? "bg-rose-500" : log.level === "warn" ? "bg-amber-500" : "bg-emerald-500"
                  }`}
                />
                <div>
                  <div className="font-medium">
                    {log.source} · {log.level}
                  </div>
                  <div className="text-muted-foreground">{log.message}</div>
                  <div className="text-xs text-muted-foreground">{new Date(log.ts).toLocaleString()}</div>
                </div>
              </div>
            ))}
            {!logs.length && <div className="text-muted-foreground text-sm">No logs yet.</div>}
          </div>
        </div>
      </section>
    </div>
  );
}

import { Api } from "@/lib/client";
import type { EndpointConfig, LogEntry } from "@/lib/types";
import Link from "next/link";

const introduction =
  "Connect WhatsApp flows directly to loyalty systems, e-wallets, and customer profiles so users receive live, personalized replies without leaving the conversation.";

const objectives = [
  "Integrate backend APIs with WhatsApp conversations in real time.",
  "Personalize responses using data returned from secure HTTPS calls.",
  "Let admins map triggers to endpoints without code deployments.",
  "Automate common requests to reduce dependency on support teams.",
  "Keep integrations secure, reusable, and monitored with logging.",
];

const featureCards = [
  {
    title: "API Connector & Dispatcher",
    bullets: [
      "Supports GET/POST with token-based authentication.",
      "Injects user/campaign parameters into headers, query, or body.",
      "Handles timeouts and retries so flows stay responsive.",
    ],
    example: "Example: User types \"Check Points\" ? call /loyalty/points?msisdn=6012... via HTTPS and reply with their balance.",
    href: "/integration/endpoints",
  },
  {
    title: "Response Handler & Formatter",
    bullets: [
      "Extracts only relevant fields from JSON/XML payloads.",
      "Applies formatter templates for brand-safe WhatsApp copy.",
      "Validates types (currency, dates) before replying to users.",
    ],
    example: "Example: Raw JSON {points:120,status:'Eligible'} ? \"You have 120 points. Redeem a RM10 voucher?\"",
    href: "/integration/formatters",
  },
  {
    title: "Campaign API Mapping Layer",
    bullets: [
      "Link keywords, buttons, or menu selections to endpoints.",
      "Versioned configs keep RAYA2025 vs MERDEKA isolated.",
      "Admin updates require no backend redeployments.",
    ],
    example: "Example: Keyword \"voucher\" ? Endpoint #12 (POST /rewards/redeem) with Formatter #4 for reply copy.",
    href: "/integration/mappings",
  },
  {
    title: "Error Handling & Fallbacks",
    bullets: [
      "Detect timeouts, 500s, or malformed responses automatically.",
      "Serve friendly fallback copy instead of raw error data.",
      "Optional retry logic for high-value redemptions.",
    ],
    example: "Example: Timeout detected ? send \"We'ree unable to retrieve your data right now. Please try again later.\"",
    href: "/integration/logs",
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
    { label: "Retry-enabled APIs", value: endpoints.filter((e) => (e.retries ?? 0) > 0).length },
    { label: "Logs (24h)", value: logs.length },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-card p-6 space-y-4">
        <div className="space-y-2">
          <h3 className="text-base font-semibold">What this module does</h3>
          <p className="text-sm text-muted-foreground">{introduction}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {objectives.map((objective) => (
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
              <div className="text-lg font-semibold">{stat.value}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {featureCards.map((card) => (
          <article key={card.title} className="rounded-xl border p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-base font-semibold">{card.title}</h4>
              <Link href={card.href} className="text-sm font-medium text-primary hover:underline">
                Open
              </Link>
            </div>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {card.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
            <div className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              {card.example}
            </div>
          </article>
        ))}
      </section>

      <section className="rounded-xl border p-5 space-y-4">
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
                  {log.source} ? {log.level}
                </div>
                <div className="text-muted-foreground">{log.message}</div>
                <div className="text-xs text-muted-foreground">{new Date(log.ts).toLocaleString()}</div>
              </div>
            </div>
          ))}
          {!logs.length && <div className="text-muted-foreground text-sm">No logs yet.</div>}
        </div>
      </section>
    </div>
  );
}



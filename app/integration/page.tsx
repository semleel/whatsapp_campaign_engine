"use client";

import Link from "next/link";
import { usePrivilege } from "@/lib/permissions";

const INTRO =
  "Connect WhatsApp user journeys to downstream APIs with a clean separation between campaign logic, parameter binding, and formatter fallbacks.";

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

export default function IntegrationHome() {
  const { canView, canCreate, canUpdate, loading } = usePrivilege("integration");

  if (!loading && !canView) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
        You do not have permission to view integrations.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Integrations</p>
          <h1 className="text-2xl font-semibold">Backend Integration & API Mappings</h1>
          <p className="text-sm text-muted-foreground max-w-3xl">{INTRO}</p>
        </header>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {FEATURE_CARDS.map((card) => (
            <Link
              key={`${card.href}-${card.title}`}
              href={card.href}
              className="card card-hover block p-4 space-y-2"
            >
              <div className="text-sm font-semibold">{card.title}</div>
              <p className="text-sm text-muted-foreground">{card.copy}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-xl border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Shortcuts</p>
            <p className="text-sm text-muted-foreground">Jump to endpoints, mappings, or recent logs.</p>
          </div>
          <div className="flex gap-2">
            {canCreate && (
              <Link href="/integration/endpoints/create" className="btn btn-primary">
                New endpoint
              </Link>
            )}
            {canUpdate && (
              <Link href="/integration/mappings" className="btn btn-ghost">
                Manage mappings
              </Link>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="pill">Endpoints catalog</span>
          <span className="pill">Mappings</span>
          <span className="pill">Logs</span>
          <span className="pill">Formatters</span>
          <span className="pill">Test runner</span>
        </div>
      </section>
    </div>
  );
}

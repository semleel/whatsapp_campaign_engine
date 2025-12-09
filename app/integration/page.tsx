"use client";

import Link from "next/link";
import { usePrivilege } from "@/lib/permissions";

const INTRO =
  "Manage HTTP endpoints, run live tests, and view execution logs so campaign logic can call downstream APIs with confidence.";

const FEATURE_CARDS = [
  {
    title: "Endpoints",
    copy: "Create, edit, and activate HTTPS definitions with authentication, headers, and body templates.",
    href: "/integration/endpoints",
  },
  {
    title: "Test Runner",
    copy: "Exercise any endpoint with sample variables before wiring it into flows.",
    href: "/integration/test-runner",
  },
  {
    title: "Logs",
    copy: "Inspect recent api_log entries to understand requests, responses, and errors.",
    href: "/integration/logs",
  },
];

export default function IntegrationHome() {
  const { canView, canCreate, loading } = usePrivilege("integration");

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
          <h1 className="text-2xl font-semibold">Backend integrations</h1>
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
            <p className="text-sm text-muted-foreground">
              Jump to endpoints, the test runner, or recent logs.
            </p>
          </div>
          <div className="flex gap-2">
            {canCreate && (
              <Link href="/integration/endpoints/create" className="btn btn-primary">
                New endpoint
              </Link>
            )}
            <Link href="/integration/test-runner" className="btn btn-ghost">
              Run test
            </Link>
            <Link href="/integration/logs" className="btn btn-ghost">
              View logs
            </Link>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="pill">Endpoints catalog</span>
          <span className="pill">Test runner</span>
          <span className="pill">Logs</span>
        </div>
      </section>
    </div>
  );
}

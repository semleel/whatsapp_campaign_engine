"use client";

import { useEffect, useState } from "react";
import { Api } from "@/lib/client";
import type { EndpointConfig } from "@/lib/types";
import TestRunner from "@/components/TestRunner";
import { usePrivilege } from "@/lib/permissions";

export default function LiveTestRunnerPage() {
  const { canView, loading: privLoading } = usePrivilege("integration");
  const [endpoints, setEndpoints] = useState<EndpointConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (privLoading) return;
    if (!canView) {
      setError("You do not have permission to view the test runner.");
      setLoading(false);
      return;
    }

    Api.listEndpoints()
      .then(setEndpoints)
      .catch((err) => setError(err?.message || "Failed to load endpoints"))
      .finally(() => setLoading(false));
  }, [canView, privLoading]);

  if (!privLoading && !canView) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
        You do not have permission to view the test runner.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Live test runner</h2>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Execute a single endpoint using on-demand variables before wiring it into a flow. Requests reuse the same HTTPS configuration stored in the database.
          </p>
        </div>
      </div>

      <section className="rounded-xl border p-5 space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading endpoints...</p>
        ) : error ? (
          <p className="text-sm text-rose-600">{error}</p>
        ) : endpoints.length === 0 ? (
          <p className="text-sm text-muted-foreground">No endpoints available yet.</p>
        ) : (
          <TestRunner endpoints={endpoints} />
        )}
      </section>
    </div>
  );
}

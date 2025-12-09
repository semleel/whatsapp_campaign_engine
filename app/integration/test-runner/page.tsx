// app/integration/test-runner/page.tsx

"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Api } from "@/lib/client";
import type { EndpointConfig } from "@/lib/types";
import TestRunner from "@/components/TestRunner";
import { usePrivilege } from "@/lib/permissions";

export default function LiveTestRunnerPage() {
  const { canView, canUpdate, loading: privLoading } = usePrivilege("integration");
  const searchParams = useSearchParams();
  const initialEndpointId = searchParams.get("endpointId") ?? "";
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
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Live test runner</h2>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Execute an endpoint with sample variables before wiring it into a flow.
            Requests reuse the same HTTPS configuration stored in the database.
          </p>
        </div>
      </div>

      {/* Main card */}
      <section className="rounded-xl border bg-card p-5 space-y-4 shadow-sm">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading endpoints...</p>
        ) : error ? (
          <p className="text-sm text-rose-600">{error}</p>
        ) : endpoints.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No endpoints available yet. Create one first under{" "}
            <span className="font-medium">Integration → Endpoints</span>.
          </p>
        ) : (
          <TestRunner
            endpoints={endpoints}
            initialEndpointId={initialEndpointId}
            canRun={canUpdate || canView}
          />
        )}
      </section>
    </div>
  );
}

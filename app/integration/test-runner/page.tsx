import { Api } from "@/lib/client";
import type { EndpointConfig } from "@/lib/types";
import TestRunner from "@/components/TestRunner";

export default async function LiveTestRunnerPage() {
  let endpoints: EndpointConfig[] = [];
  try {
    endpoints = await Api.listEndpoints();
  } catch {
    endpoints = [];
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
        {endpoints.length === 0 ? (
          <p className="text-sm text-muted-foreground">No endpoints available yet.</p>
        ) : (
          <TestRunner endpoints={endpoints} />
        )}
      </section>
    </div>
  );
}

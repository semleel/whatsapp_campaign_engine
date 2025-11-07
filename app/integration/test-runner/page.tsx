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
          <h2 className="text-xl font-semibold">Live Test Runner</h2>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Pick an integration endpoint, inject sample variables, and preview the outbound payload and formatted WhatsApp response
            before wiring campaigns to it.
          </p>
        </div>
      </div>

      <section className="rounded-xl border p-5 space-y-4">
        <div>
          <h3 className="text-base font-semibold">Run a test</h3>
          <p className="text-sm text-muted-foreground">
            All requests execute against the configured /api/integration/endpoints definitions using HTTPS.
          </p>
        </div>
        <TestRunner endpoints={endpoints as any} />
      </section>
    </div>
  );
}

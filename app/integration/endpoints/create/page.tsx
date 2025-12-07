// app/integration/endpoints/create/page.tsx

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import EndpointForm from "@/components/EndpointForm";
import type { EndpointConfig } from "@/lib/types";
import { Api } from "@/lib/client";

const INITIAL_ENDPOINT: EndpointConfig = {
  name: "",
  description: "",
  base_url: "https://",
  path: "/",
  method: "GET",
  auth_type: "none",
  timeout_ms: 5000,
  retry_enabled: false,
  retry_count: 0,
  is_active: true,
  parameters: [],
};

export default function NewEndpointPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Register endpoint</h3>
          <p className="text-sm text-muted-foreground">
            Capture the HTTPS destination so campaigns can call downstream systems without redeploying code.
          </p>
        </div>
      </div>

      <EndpointForm
        initial={INITIAL_ENDPOINT}
        submitting={saving}
        onCancel={() => router.push("/integration/endpoints")}
        onSubmit={async (data) => {
          setSaving(true);
          try {
            await Api.createEndpoint(data);
            router.push("/integration/endpoints");
          } finally {
            setSaving(false);
          }
        }}
      />
    </div>
  );
}

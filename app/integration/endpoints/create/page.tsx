// app/integration/endpoints/create/page.tsx

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import EndpointForm from "@/components/EndpointForm";
import type { EndpointConfig } from "@/lib/types";
import { Api } from "@/lib/client";
import { usePrivilege } from "@/lib/permissions";
import { showPrivilegeDenied } from "@/lib/showAlert";

const INITIAL_ENDPOINT: EndpointConfig = {
  name: "",
  description: "",
  method: "GET",
  url: "https://",
  auth_type: "none",
  auth_header_name: "Authorization",
  auth_token: "",
  is_active: true,
  headers_json: [],
  body_template: "",
  response_template: "",
};

export default function NewEndpointPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const { canCreate, loading: privLoading } = usePrivilege("integration");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Register endpoint</h3>
          <p className="text-sm text-muted-foreground">
            Define an HTTPS endpoint so campaigns can call downstream systems without redeploying code.
          </p>
        </div>
      </div>

      <EndpointForm
        initial={INITIAL_ENDPOINT}
        submitting={saving}
        onCancel={() => router.push("/integration/endpoints")}
        onSubmit={async (data) => {
          if (privLoading || !canCreate) {
            await showPrivilegeDenied({ action: "create endpoints", resource: "Integrations" });
            return;
          }
          setSaving(true);
          try {
            const created = await Api.createEndpoint(data);
            const endpointId =
              created.apiid ??
              (created as any).api_id ??
              (created as any).id;
            router.push(
              endpointId
                ? `/integration/endpoints/${endpointId}`
                : "/integration/endpoints"
            );
          } finally {
            setSaving(false);
          }
        }}
      />
    </div>
  );
}

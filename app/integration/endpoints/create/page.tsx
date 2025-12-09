"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import EndpointForm from "@/components/EndpointForm";
import type { EndpointConfig } from "@/lib/types";
import { Api } from "@/lib/client";
import { usePrivilege } from "@/lib/permissions";
import { showPrivilegeDenied } from "@/lib/showAlert";

export default function CreateEndpointPage() {
  const router = useRouter();
  const { canCreate, loading: privLoading } = usePrivilege("integration");

  const [saving, setSaving] = useState(false);

  const blankInitial: EndpointConfig = {
    apiid: undefined, // new endpoint
    name: "",
    description: "",
    method: "GET",
    url: "https://",
    is_active: true,
    auth_type: "none",
    auth_header_name: null,
    auth_token: null,
    headers_json: [],
    body_template: null,
    response_template: "",
  };

  if (!privLoading && !canCreate) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
        You do not have permission to create endpoints.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Create endpoint</h3>
        <p className="text-sm text-muted-foreground">
          Define an external API that campaigns can call.
        </p>
      </div>

      <EndpointForm
        initial={blankInitial}
        submitting={saving}
        sampleResponse={undefined}   // NO TEST RUNNER ON CREATE
        testingSample={false}
        onRunSample={undefined}
        onCancel={() => router.push("/integration/endpoints")}
        onSubmit={async (payload) => {
          if (!canCreate) {
            await showPrivilegeDenied({
              action: "create endpoints",
              resource: "Integrations",
            });
            return;
          }

          setSaving(true);
          try {
            await Api.createEndpoint(payload);
            router.push("/integration/endpoints");
          } finally {
            setSaving(false);
          }
        }}
      />
    </div>
  );
}

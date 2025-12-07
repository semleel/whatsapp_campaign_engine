// app/integration/endpoints/[id]/page.tsx

"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import EndpointForm from "@/components/EndpointForm";
import type { EndpointConfig } from "@/lib/types";
import { Api } from "@/lib/client";
import { usePrivilege } from "@/lib/permissions";
import { showPrivilegeDenied } from "@/lib/showAlert";

export default function EditEndpointPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [initial, setInitial] = useState<EndpointConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { canView, canUpdate, loading: privLoading } = usePrivilege("integration");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (privLoading) return;
        if (!canView) {
          setError("You do not have permission to view endpoints.");
          setLoading(false);
          return;
        }
        const data = await Api.getEndpoint(id);
        if (mounted) setInitial(data);
      } catch (err: any) {
        if (mounted) setError(err?.message || "Failed to load endpoint");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [id]);

  if (!privLoading && !canView)
    return <div className="text-sm text-amber-700 border border-amber-200 bg-amber-50 px-3 py-2 rounded">You do not have permission to view endpoints.</div>;
  if (loading) return <div className="text-sm text-muted-foreground">Loading endpoint...</div>;
  if (error) return <div className="text-sm text-rose-600">{error}</div>;
  if (!initial) return <div className="text-sm text-muted-foreground">Endpoint not found.</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Edit endpoint</h3>
          <p className="text-sm text-muted-foreground">{initial.name}</p>
        </div>
      </div>

      <EndpointForm
        initial={initial}
        submitting={saving}
        onCancel={() => router.push("/integration/endpoints")}
        onSubmit={async (data) => {
          if (!canUpdate) {
            await showPrivilegeDenied({ action: "update endpoints", resource: "Integrations" });
            return;
          }
          setSaving(true);
          try {
            await Api.updateEndpoint(id, data);
            router.push("/integration/endpoints");
          } finally {
            setSaving(false);
          }
        }}
      />
    </div>
  );
}

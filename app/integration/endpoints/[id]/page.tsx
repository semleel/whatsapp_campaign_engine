"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import EndpointForm from "@/components/EndpointForm";
import type { EndpointConfig, ApiLogEntry } from "@/lib/types";
import { Api } from "@/lib/client";
import { usePrivilege } from "@/lib/permissions";
import { showPrivilegeDenied } from "@/lib/showAlert";

export default function EditEndpointPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { canView, canUpdate, loading: privLoading } = usePrivilege("integration");

  const [initial, setInitial] = useState<EndpointConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sampleResponse, setSampleResponse] = useState<any>(null);
  const [testingSample, setTestingSample] = useState(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      if (privLoading) return;
      if (!canView) {
        setError("You do not have permission to view endpoints.");
        setLoading(false);
        return;
      }

      try {
        const data = await Api.getEndpoint(id);
        if (!mounted) return;

        if (!data) {
          setInitial(null);
          setError("Endpoint not found");
          return;
        }

        setInitial(data);

        // Try to load a recent API log sample
        try {
          const apiId = (data as any).apiid ?? null;
          const logs: ApiLogEntry[] = await Api.listLogs({ limit: 50 });

          const match = apiId
            ? logs.find(
              (log) =>
                (log as any).apiid === apiId ||
                (log as any).api_id === apiId
            )
            : logs[0];

          if (match?.response_body) {
            try {
              setSampleResponse(JSON.parse(match.response_body));
            } catch {
              setSampleResponse(match.response_body);
            }
          } else {
            setSampleResponse(null);
          }
        } catch {
          setSampleResponse(null);
        }
      } catch (err: any) {
        if (mounted) {
          setError(err?.message || "Failed to load endpoint");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [id, canView, privLoading]);

  const handleRunSample = async () => {
    if (!initial?.apiid) return;
    setTestingSample(true);
    setError(null);

    try {
      const res = await Api.runTest({
        endpointId: initial.apiid,
        sampleVars: {},
      });

      const raw =
        res?.responseJson?.raw ??
        res?.raw ??
        res?.responseJson ??
        null;

      setSampleResponse(raw);
    } catch (err: any) {
      setError(err?.message || "Failed to run test");
    } finally {
      setTestingSample(false);
    }
  };

  if (!privLoading && !canView) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
        You do not have permission to view endpoints.
      </div>
    );
  }

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading endpoint...</div>;
  }

  if (error) {
    return <div className="text-sm text-rose-600">{error}</div>;
  }

  if (!initial) {
    return <div className="text-sm text-muted-foreground">Endpoint not found.</div>;
  }

  if (!canUpdate) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
        You do not have permission to update integration settings.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Edit endpoint</h3>
        <p className="text-sm text-muted-foreground">{initial.name}</p>
      </div>

      <EndpointForm
        initial={initial}
        submitting={saving}
        sampleResponse={sampleResponse}
        testingSample={testingSample}
        onRunSample={handleRunSample}
        onCancel={() => router.push("/integration/endpoints")}
        onSubmit={async (payload) => {
          if (!canUpdate) {
            await showPrivilegeDenied({
              action: "update endpoints",
              resource: "Integrations",
            });
            return;
          }

          setSaving(true);
          try {
            await Api.updateEndpoint(id, payload);
            router.push("/integration/endpoints");
          } finally {
            setSaving(false);
          }
        }}
      />
    </div>
  );
}

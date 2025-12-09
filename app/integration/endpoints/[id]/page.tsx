// app/integration/endpoints/[id]/page.tsx

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
  const [responseTemplate, setResponseTemplate] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [sampleResponse, setSampleResponse] = useState<any>(null);
  const [templatePreview, setTemplatePreview] = useState<string | null>(null);

  const renderTemplatePreview = (tmpl: string, payload: any) => {
    if (!tmpl) return "";
    return tmpl.replace(/{{\s*([^}]+)\s*}}/g, (_, token) => {
      const path = token.trim().split(".");
      let value: any = payload;
      for (const key of path) {
        if (value == null) break;
        value = value[key];
      }
      return value == null ? `{${token}}` : String(value);
    });
  };

  // Fetch latest sample response from api_log
  const refreshSample = async (apiIdOverride?: number | null) => {
    try {
      const apiId = apiIdOverride ?? initial?.apiid ?? null;
      const logs: ApiLogEntry[] = await Api.listLogs(50);

      const match = apiId
        ? logs.find((log) => log.apiid === apiId)
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
    } catch (err: any) {
      setError(err?.message || "Failed to load sample response.");
    }
  };

  const testTemplate = () => {
    if (!responseTemplate) {
      setTemplatePreview(null);
      return;
    }
    setTemplatePreview(
      renderTemplatePreview(responseTemplate, { response: sampleResponse })
    );
  };

  const handleSaveTemplate = async () => {
    setSavingTemplate(true);
    setError(null);
    try {
      await Api.updateApiTemplate(initial?.apiid ?? Number(id), {
        response_template: responseTemplate,
      });
    } catch (err: any) {
      setError(err?.message || "Failed to save template.");
    } finally {
      setSavingTemplate(false);
    }
  };

  // Single useEffect to load endpoint AND kick off initial sample fetch
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
        if (!mounted) return;

        if (!data) {
          setInitial(null);
          setError("Endpoint not found");
          return;
        }

        setInitial(data);
        setResponseTemplate((data as any).response_template || "");

        // Immediately fetch sample response for this API
        const apiId = (data as any).apiid ?? null;
        if (apiId) {
          await refreshSample(apiId);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!privLoading && !canView)
    return <div className="text-sm text-amber-700 border border-amber-200 bg-amber-50 px-3 py-2 rounded">You do not have permission to view endpoints.</div>;
  if (loading) return <div className="text-sm text-muted-foreground">Loading endpoint...</div>;
  if (error) return <div className="text-sm text-rose-600">{error}</div>;
  if (!initial)
    return (
      <div className="text-sm text-muted-foreground">Endpoint not found.</div>
    );

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

      {/* Response Template editor */}
      <section className="mt-8 space-y-3">
        <h4 className="text-md font-semibold">Response Template</h4>
        <p className="text-sm text-muted-foreground">
          Use <code>{"{{ tokens }}"}</code> such as{" "}
          <code>{"{{response.current_weather.temperature}}"}</code>. This
          controls what users see after the API action.
        </p>

        <textarea
          className="w-full min-h-[160px] border rounded-md p-2 font-mono text-sm"
          value={responseTemplate}
          onChange={(e) => setResponseTemplate(e.target.value)}
        />

        <button
          className="px-4 py-2 bg-primary text-white rounded-md"
          onClick={handleSaveTemplate}
          disabled={savingTemplate}
        >
          {savingTemplate ? "Saving..." : "Save Template"}
        </button>
      </section>

      {/* Sample API Response */}
      <section className="mt-8 space-y-3">
        <h4 className="text-md font-semibold">Sample API Response</h4>
        <p className="text-sm text-muted-foreground">
          Latest recorded API response from <code>api_log</code>. Use this to
          understand available fields for templating.
        </p>

        <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto max-h-[300px]">
          {sampleResponse
            ? JSON.stringify(sampleResponse, null, 2)
            : "No logs yet."}
        </pre>

        <button
          className="px-4 py-2 bg-secondary rounded-md"
          onClick={() => refreshSample()}
        >
          Refresh Sample
        </button>
      </section>

      {/* Template Preview */}
      <section className="mt-8 space-y-3">
        <h4 className="text-md font-semibold">Template Preview</h4>

        <button
          className="px-4 py-2 bg-primary rounded-md text-white"
          onClick={testTemplate}
        >
          Run Test Preview
        </button>

        <div className="bg-muted p-3 rounded-lg text-sm min-h-[60px] whitespace-pre-wrap">
          {templatePreview ?? "Preview will appear here."}
        </div>
      </section>
    </div>
  );
}

// app/integration/formatters/page.tsx

"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Api } from "@/lib/client";
import { usePrivilege } from "@/lib/permissions";

export default function FormatterPlayground() {
  const { canView, loading } = usePrivilege("integration");
  const searchParams = useSearchParams();

  const [apiList, setApiList] = useState<any[]>([]);
  const [selectedApi, setSelectedApi] = useState<number | null>(null);

  const [template, setTemplate] = useState("");
  const [payloadText, setPayloadText] = useState("{}");
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Load API list
  useEffect(() => {
    Api.listApis()
      .then((list) => {
        setApiList(list || []);
        const paramId = searchParams.get("apiId");
        if (paramId) {
          const idNum = Number(paramId);
          if (!Number.isNaN(idNum)) {
            setSelectedApi(idNum);
          }
        }
      })
      .catch(() => setApiList([]));
  }, [searchParams]);

  // Load template + sample response when API selected
  useEffect(() => {
    if (!selectedApi) return;

    (async () => {
      try {
        const apiDetails = await Api.getEndpoint(selectedApi);
        setTemplate(apiDetails.response_template || "");

        const logs = await Api.listLogs(20);
        const log = logs.find((x: any) => x.apiid === selectedApi);
        if (log?.response_body) {
          try {
            setPayloadText(JSON.stringify(JSON.parse(log.response_body), null, 2));
          } catch {
            setPayloadText(String(log.response_body));
          }
        } else {
          setPayloadText("{}");
        }
      } catch (err: any) {
        setError(err?.message || "Failed to load API details.");
      }
    })();
  }, [selectedApi]);

  // Live preview
  useEffect(() => {
    try {
      const json = payloadText ? JSON.parse(payloadText) : {};
      const ctx: any =
        json && typeof json === "object" && json !== null && "response" in json
          ? json
          : { response: json };

      const formatted = template.replace(/{{\s*([^}]+)\s*}}/g, (_, token) => {
        const path = token.trim().split(".");
        let value: any = ctx;
        for (const key of path) {
          value = value?.[key];
          if (value == null) return "{missing}";
        }
        return String(value);
      });

      setPreview(formatted);
      setError("");
    } catch (err: any) {
      setError(err.message);
    }
  }, [template, payloadText]);

  const handleSaveTemplate = async () => {
    if (!selectedApi) return;
    try {
      setSavingTemplate(true);
      await Api.updateApiTemplate(selectedApi, {
        response_template: template,
      });
      alert("Template saved.");
    } catch (e: any) {
      alert(e?.message || "Failed to save template.");
    } finally {
      setSavingTemplate(false);
    }
  };

  if (!loading && !canView) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
        You do not have permission to view formatters.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Formatter playground</h3>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Select an API, load its latest response, and preview your template using {"{{ tokens }}"}.
          </p>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Select API</label>
        <select
          className="mt-1 block w-full rounded-md border px-3 py-2"
          value={selectedApi ?? ""}
          onChange={(e) => setSelectedApi(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">— Choose API —</option>
          {apiList.map((api: any) => (
            <option key={api.api_id} value={api.api_id}>
              {api.name}
            </option>
          ))}
        </select>
      </div>

      <section className="rounded-xl border p-4 space-y-3">
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="space-y-2 text-sm font-medium">
            <span>Template body</span>
            <textarea
              className="min-h-[180px] w-full rounded-md border px-3 py-2"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              placeholder="e.g. Weather is {{response.current_weather.temperature}}°C"
            />
          </label>
          <label className="space-y-2 text-sm font-medium">
            <span>Sample payload (JSON)</span>
            <textarea
              className="min-h-[180px] w-full rounded-md border px-3 py-2 font-mono text-xs"
              value={payloadText}
              onChange={(e) => setPayloadText(e.target.value)}
            />
          </label>
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </section>

      <section className="rounded-xl border p-4 space-y-2">
        <p className="text-sm font-medium">Preview</p>
        <div className="rounded-lg bg-muted px-3 py-4 text-sm whitespace-pre-line">
          {preview || "—"}
        </div>
      </section>
      <div className="flex justify-end">
        <button
          type="button"
          disabled={!selectedApi || savingTemplate}
          onClick={handleSaveTemplate}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {savingTemplate ? "Saving..." : "Save template"}
        </button>
      </div>
    </div>
  );
}

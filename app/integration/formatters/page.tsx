// app/integration/formatters/page.tsx

"use client";

import { useMemo, useState } from "react";
import { usePrivilege } from "@/lib/permissions";

function renderPreview(template: string, payload: any) {
  return template.replace(/{{\s*([^}]+)\s*}}/g, (_, token) => {
    const path = token.trim().split(".");
    let value: any = payload;
    for (const key of path) {
      if (value == null) break;
      value = value[key];
    }
    return value == null ? `{${token}}` : String(value);
  });
}

export default function FormatterPlayground() {
  const { canView, loading } = usePrivilege("integration");
  const [template, setTemplate] = useState("Hi {{contact.name}}, your balance is {{loyalty.points}} points.");
  const [payloadText, setPayloadText] = useState(
    JSON.stringify(
      {
        contact: { name: "Aisyah" },
        loyalty: { points: 1200, tier: "Gold" },
      },
      null,
      2
    )
  );

  const { preview, error } = useMemo(() => {
    try {
      const data = payloadText ? JSON.parse(payloadText) : {};
      return { preview: renderPreview(template, data), error: null as string | null };
    } catch (err: any) {
      return { preview: "", error: err?.message || "Invalid JSON" };
    }
  }, [template, payloadText]);

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
            Map API payloads to WhatsApp-friendly copy before saving them as <code>content</code> records referenced by <code>contentkeyid</code>.
          </p>
        </div>
      </div>

      <section className="rounded-xl border p-4 space-y-3">
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="space-y-2 text-sm font-medium">
            <span>Template body</span>
            <textarea
              className="min-h-[180px] w-full rounded-md border px-3 py-2"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
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
        <div className="rounded-lg bg-muted px-3 py-4 text-sm">{preview || "—"}</div>
      </section>
    </div>
  );
}

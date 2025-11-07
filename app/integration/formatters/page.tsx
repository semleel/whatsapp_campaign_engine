"use client";

import { useEffect, useState } from "react";
import { Api } from "@/lib/client";
import type { ResponseTemplate } from "@/lib/types";

export default function ResponseFormattersPage() {
  const [list, setList] = useState<ResponseTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<ResponseTemplate>({
    name: "",
    locale: "en",
    body: "Hi {{name}}, your points are {{points}}.",
    variables: ["name", "points"],
  });

  async function refresh() {
    setLoading(true);
    try {
      setList(await Api.listResponseTemplates());
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Response Formatter Library</h3>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Convert raw API payloads into WhatsApp-ready copy with locale-aware templates and reusable placeholder definitions.
          </p>
        </div>
      </div>

      <div className="rounded-xl border p-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-3">
          <input
            className="rounded-md border px-3 py-2"
            placeholder="Formatter name"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <select
            className="rounded-md border px-3 py-2 uppercase"
            value={draft.locale}
            onChange={(e) => setDraft({ ...draft, locale: e.target.value })}
          >
            <option value="en">EN</option>
            <option value="ms">MS</option>
            <option value="zh">ZH</option>
          </select>
          <input
            className="rounded-md border px-3 py-2"
            placeholder="Variables (comma separated)"
            value={(draft.variables || []).join(", ")}
            onChange={(e) =>
              setDraft({
                ...draft,
                variables: e.target
                  .value.split(",")
                  .map((v) => v.trim())
                  .filter(Boolean),
              })
            }
          />
        </div>
        <textarea
          className="h-28 w-full rounded-md border px-3 py-2"
          placeholder="Hi {{name}}, you have {{points}} points left."
          value={draft.body}
          onChange={(e) => setDraft({ ...draft, body: e.target.value })}
        />
        <div className="flex gap-2">
          <button
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
            onClick={async () => {
              await Api.createResponseTemplate(draft);
              setDraft({ name: "", locale: "en", body: "", variables: [] });
              await refresh();
            }}
          >
            Add formatter
          </button>
        </div>
      </div>

      <div className="rounded-xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Name</th>
              <th className="px-3 py-2 text-left font-medium">Locale</th>
              <th className="px-3 py-2 text-left font-medium">Variables</th>
              <th className="px-3 py-2 text-left font-medium">Body</th>
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : list.length ? (
              list.map((t) => (
                <tr key={String(t.id)} className="border-t">
                  <td className="px-3 py-2">{t.name}</td>
                  <td className="px-3 py-2 uppercase">{t.locale}</td>
                  <td className="px-3 py-2 text-muted-foreground">{(t.variables || []).join(", ") || "—"}</td>
                  <td className="px-3 py-2">{t.body}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      className="rounded border px-2 py-1"
                      onClick={async () => {
                        await Api.deleteResponseTemplate(t.id!);
                        await refresh();
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-muted-foreground">
                  No formatters yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}



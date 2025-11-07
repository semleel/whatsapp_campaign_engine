"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type TemplateItem = {
  contentid: number;
  title: string;
  type: string;
  status: string;
  defaultlang: string;
  category: string | null;
  currentversion: number | null;
  updatedat?: string | null;
  lastupdated?: string | null;
};

export default function TemplateLibraryPage() {
  const [items, setItems] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("http://localhost:3000/api/template/list");
        const ct = res.headers.get("content-type") || "";
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(txt || `HTTP ${res.status}`);
        }
        const data: TemplateItem[] = ct.includes("application/json")
          ? await res.json()
          : JSON.parse(await res.text());
        setItems(data);
      } catch (e: any) {
        setError(e?.message || "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const renderStatus = (status: string) => {
    const normalized = status?.toLowerCase();
    const styles =
      normalized === "active"
        ? "bg-emerald-100 text-emerald-700"
        : normalized === "draft"
        ? "bg-amber-100 text-amber-700"
        : "bg-slate-100 text-slate-700";
    return (
      <span className={`rounded-full px-3 py-1 text-xs font-medium ${styles}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Template Library</h3>
          <p className="text-sm text-muted-foreground">
            Track approval status, ownership, and multilingual coverage for every WhatsApp asset.
          </p>
        </div>
        <Link
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90"
          href="/content/templates/create"
        >
          New Template
        </Link>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading templates…</p>}
      {error && <p className="text-sm text-destructive">Error: {error}</p>}

      <div className="rounded-xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="px-3 py-2 text-left font-medium">ID</th>
              <th className="px-3 py-2 text-left font-medium">Title</th>
              <th className="px-3 py-2 text-left font-medium">Type</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-left font-medium">Language</th>
              <th className="px-3 py-2 text-left font-medium">Category</th>
              <th className="px-3 py-2 text-left font-medium">Version</th>
              <th className="px-3 py-2 text-left font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-3 py-4 text-muted-foreground">
                  Fetching data…
                </td>
              </tr>
            ) : items.length ? (
              items.map((t) => (
                <tr key={t.contentid} className="border-t">
                  <td className="px-3 py-2 text-muted-foreground">{t.contentid}</td>
                  <td className="px-3 py-2">
                    <Link href={`/content/templates/${t.contentid}`} className="font-medium text-primary hover:underline">
                      {t.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground capitalize">{t.type}</td>
                  <td className="px-3 py-2">{renderStatus(t.status)}</td>
                  <td className="px-3 py-2 uppercase">{t.defaultlang}</td>
                  <td className="px-3 py-2">{t.category || "-"}</td>
                  <td className="px-3 py-2">{t.currentversion ?? "-"}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {t.updatedat || t.lastupdated
                      ? new Date(t.updatedat || (t.lastupdated as string)).toLocaleString()
                      : "-"}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="px-3 py-4 text-muted-foreground">
                  No templates yet. Create one to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

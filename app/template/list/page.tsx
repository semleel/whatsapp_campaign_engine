"use client";

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

export default function TemplateListPage() {
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

  return (
    <div className="max-w-5xl mx-auto mt-10 p-6 bg-white rounded-2xl shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Templates</h1>
        <a
          className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          href="/template/create"
        >
          New Template
        </a>
      </div>

      {loading && <p>Loading...</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && !error && (
        <div className="overflow-x-auto">
          <table className="min-w-full border">
            <thead>
              <tr className="bg-gray-100">
                <th className="text-left p-2 border">ID</th>
                <th className="text-left p-2 border">Title</th>
                <th className="text-left p-2 border">Type</th>
                <th className="text-left p-2 border">Status</th>
                <th className="text-left p-2 border">Lang</th>
                <th className="text-left p-2 border">Category</th>
                <th className="text-left p-2 border">Version</th>
                <th className="text-left p-2 border">Updated</th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.contentid} className="hover:bg-gray-50">
                  <td className="p-2 border">{t.contentid}</td>
                  <td className="p-2 border">
                    <a className="text-blue-600 hover:underline" href={`/template/${t.contentid}`}>{t.title}</a>
                  </td>
                  <td className="p-2 border">{t.type}</td>
                  <td className="p-2 border">{t.status}</td>
                  <td className="p-2 border">{t.defaultlang}</td>
                  <td className="p-2 border">{t.category || "-"}</td>
                  <td className="p-2 border">{t.currentversion ?? "-"}</td>
                  <td className="p-2 border">
                    {t.updatedat || t.lastupdated ? new Date(t.updatedat || (t.lastupdated as string)).toLocaleString() : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

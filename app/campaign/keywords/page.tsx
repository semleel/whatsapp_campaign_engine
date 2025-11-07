"use client";

import { useState } from "react";

type KeywordRoute = {
  keyword: string;
  campaign: string;
  entryPoint: string;
};

const initialRoutes: KeywordRoute[] = [
  { keyword: "promo", campaign: "RAYA 2025", entryPoint: "promo_flow" },
  { keyword: "quiz", campaign: "Knowledge Quiz", entryPoint: "quiz_flow" },
  { keyword: "menu", campaign: "Menu Router", entryPoint: "menu" },
];

export default function KeywordEntryModule() {
  const [routes, setRoutes] = useState(initialRoutes);
  const [fallback, setFallback] = useState("Sorry, I didn't understand that. Type MENU to see available campaigns.");
  const [draft, setDraft] = useState<KeywordRoute>({ keyword: "", campaign: "", entryPoint: "" });

  const addRoute = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.keyword || !draft.campaign || !draft.entryPoint) return;
    setRoutes((prev) => [{ keyword: draft.keyword.toLowerCase(), campaign: draft.campaign, entryPoint: draft.entryPoint }, ...prev]);
    setDraft({ keyword: "", campaign: "", entryPoint: "" });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Keyword & Entry Point Handler</h3>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Map user keywords into the correct campaign, fall back gracefully on unknown input, and keep operators in control of the routing logic.
          </p>
        </div>
      </div>

      <section className="rounded-xl border p-5 space-y-4">
        <div>
          <h4 className="text-base font-semibold">Add keyword</h4>
          <p className="text-sm text-muted-foreground">Updates are stored centrally so all entry points stay in sync.</p>
        </div>
        <form onSubmit={addRoute} className="grid gap-4 md:grid-cols-3">
          <input
            className="rounded-md border px-3 py-2 text-sm"
            placeholder="Keyword (e.g. promo)"
            value={draft.keyword}
            onChange={(e) => setDraft({ ...draft, keyword: e.target.value })}
          />
          <input
            className="rounded-md border px-3 py-2 text-sm"
            placeholder="Campaign"
            value={draft.campaign}
            onChange={(e) => setDraft({ ...draft, campaign: e.target.value })}
          />
          <input
            className="rounded-md border px-3 py-2 text-sm"
            placeholder="Entry point ID"
            value={draft.entryPoint}
            onChange={(e) => setDraft({ ...draft, entryPoint: e.target.value })}
          />
          <div className="md:col-span-3 flex justify-end">
            <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm">
              Save mapping
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Keyword</th>
              <th className="px-3 py-2 text-left font-medium">Campaign</th>
              <th className="px-3 py-2 text-left font-medium">Entry point</th>
            </tr>
          </thead>
          <tbody>
            {routes.map((route) => (
              <tr key={route.keyword} className="border-t">
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{route.keyword}</td>
                <td className="px-3 py-2">{route.campaign}</td>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{route.entryPoint}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-xl border p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-base font-semibold">Fallback message</h4>
            <p className="text-sm text-muted-foreground">Displayed whenever the keyword doesn\'t match an active entry point.</p>
          </div>
        </div>
        <textarea
          className="w-full rounded-md border px-3 py-2 text-sm"
          value={fallback}
          onChange={(e) => setFallback(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">This copy is injected into WhatsApp immediately when no keyword matches.</p>
      </section>
    </div>
  );
}

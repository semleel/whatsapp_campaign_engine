"use client";

import { useEffect, useState } from "react";

type Region = { regionid: number; regionname: string };
type Flow = { userflowid: number; userflowname: string };

export default function TargetsAndFlowsPage() {
  const [regions, setRegions] = useState<Region[]>([]);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [newRegion, setNewRegion] = useState("");
  const [newFlow, setNewFlow] = useState("");

  async function loadAll() {
    setLoading(true);
    setError("");
    try {
      const [r, f] = await Promise.all([
        fetch("http://localhost:3000/api/reference/regions"),
        fetch("http://localhost:3000/api/reference/userflows"),
      ]);
      if (!r.ok) throw new Error("Failed to load regions");
      if (!f.ok) throw new Error("Failed to load user flows");
      setRegions(await r.json());
      setFlows(await f.json());
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function addRegion() {
    setMessage("");
    setError("");
    const name = newRegion.trim();
    if (!name) return;
    try {
      const res = await fetch("http://localhost:3000/api/reference/regions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regionName: name }),
      });
      if (!res.ok) throw new Error(await res.text());
      setNewRegion("");
      setMessage("Region added.");
      await loadAll();
    } catch (e: any) {
      console.error(e);
      setError("Failed to add region");
    }
  }

  async function addFlow() {
    setMessage("");
    setError("");
    const name = newFlow.trim();
    if (!name) return;
    try {
      const res = await fetch("http://localhost:3000/api/reference/userflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userFlowName: name }),
      });
      if (!res.ok) throw new Error(await res.text());
      setNewFlow("");
      setMessage("User flow added.");
      await loadAll();
    } catch (e: any) {
      console.error(e);
      setError("Failed to add user flow");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Target / User Flow</h3>
          <p className="text-sm text-muted-foreground">Manage target regions and user flows used by campaigns.</p>
        </div>
      </div>

      {(message || error) && (
        <div className="text-sm">
          {message && <span className="text-emerald-700 mr-3">{message}</span>}
          {error && <span className="text-rose-600">{error}</span>}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-base font-semibold">Target Regions</h4>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newRegion}
              onChange={(e) => setNewRegion(e.target.value)}
              placeholder="Region name (e.g., MY, SG)"
              className="flex-1 rounded-md border px-3 py-2 text-sm"
            />
            <button onClick={addRegion} className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">
              Add
            </button>
          </div>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">ID</th>
                  <th className="px-3 py-2 text-left font-medium">Name</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={2} className="px-3 py-3 text-muted-foreground">
                      Loading regions...
                    </td>
                  </tr>
                ) : regions.length ? (
                  regions.map((r) => (
                    <tr key={r.regionid} className="border-t">
                      <td className="px-3 py-2">{r.regionid}</td>
                      <td className="px-3 py-2">{r.regionname}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={2} className="px-3 py-3 text-muted-foreground">
                      No regions yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-base font-semibold">User Flows</h4>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newFlow}
              onChange={(e) => setNewFlow(e.target.value)}
              placeholder="User flow name (e.g., Promo, Quiz)"
              className="flex-1 rounded-md border px-3 py-2 text-sm"
            />
            <button onClick={addFlow} className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">
              Add
            </button>
          </div>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">ID</th>
                  <th className="px-3 py-2 text-left font-medium">Name</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={2} className="px-3 py-3 text-muted-foreground">
                      Loading user flows...
                    </td>
                  </tr>
                ) : flows.length ? (
                  flows.map((f) => (
                    <tr key={f.userflowid} className="border-t">
                      <td className="px-3 py-2">{f.userflowid}</td>
                      <td className="px-3 py-2">{f.userflowname}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={2} className="px-3 py-3 text-muted-foreground">
                      No user flows yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}


"use client";

import { useEffect, useState } from "react";
import { Api } from "@/lib/client";
import type {
  RegionRef,
  UserFlowRef,
} from "@/lib/types";

export default function TargetsAndFlowsPage() {
  const [regions, setRegions] = useState<RegionRef[]>([]);
  const [flows, setFlows] = useState<UserFlowRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [newRegionName, setNewRegionName] = useState("");
  const [newRegionCode, setNewRegionCode] = useState("");
  const [newFlow, setNewFlow] = useState("");

  async function loadAll() {
    setLoading(true);
    setError("");
    try {
      const [r, f] = await Promise.all([
        Api.listRegions(),
        Api.listUserFlows(),
      ]);
      setRegions(r);
      setFlows(f);
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
    const name = newRegionName.trim();
    const code = newRegionCode.trim();
    if (!name || !code) return;
    try {
      await Api.createRegion(name, code);
      setNewRegionName("");
      setNewRegionCode("");
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
      await Api.createUserFlow(name);
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
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={newRegionName}
              onChange={(e) => setNewRegionName(e.target.value)}
              placeholder="Region name (e.g., Malaysia)"
              className="flex-1 rounded-md border px-3 py-2 text-sm"
              required
            />
            <input
              type="text"
              value={newRegionCode}
              onChange={(e) => setNewRegionCode(e.target.value)}
              placeholder="Region code (e.g., MY)"
              className="flex-1 rounded-md border px-3 py-2 text-sm"
              required
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
                  <th className="px-3 py-2 text-left font-medium">Code</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-3 text-muted-foreground">
                      Loading regions...
                    </td>
                  </tr>
                ) : regions.length ? (
                  regions.map((r) => (
                    <tr key={r.regionid} className="border-t">
                      <td className="px-3 py-2">{r.regionid}</td>
                      <td className="px-3 py-2">{r.regionname}</td>
                      <td className="px-3 py-2">{r.regioncode || "—"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="px-3 py-3 text-muted-foreground">
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
              required
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


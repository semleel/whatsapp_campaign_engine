"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Region {
  regionid: string;
  regionname: string;
}

interface UserFlow {
  userflowid: string;
  userflowname: string;
}

export default function CampaignCreatePage() {
  const [formData, setFormData] = useState({
    campaignName: "",
    objective: "",
    targetRegionID: "",
    userFlowID: "",
  });

  const [regions, setRegions] = useState<{ id: string; name: string }[]>([]);
  const [userFlows, setUserFlows] = useState<{ id: string; name: string }[]>([]);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("http://localhost:3000/api/reference/regions")
      .then((res) => res.json())
      .then((data: Region[]) => setRegions(data.map((r) => ({ id: r.regionid, name: r.regionname }))))
      .catch((err) => console.error("Error fetching regions:", err));

    fetch("http://localhost:3000/api/reference/userflows")
      .then((res) => res.json())
      .then((data: UserFlow[]) => setUserFlows(data.map((u) => ({ id: u.userflowid, name: u.userflowname }))))
      .catch((err) => console.error("Error fetching user flows:", err));
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage("Submitting...");

    const payload = Object.fromEntries(
      Object.entries(formData).map(([key, value]) => [key, value === "" ? null : value])
    );

    try {
      const res = await fetch("http://localhost:3000/api/campaign/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage("Campaign created successfully.");
        setFormData({ campaignName: "", objective: "", targetRegionID: "", userFlowID: "" });
      } else {
        setMessage(`Error: ${data.error || "Unknown error"}`);
      }
    } catch (err) {
      console.error(err);
      setMessage("Network error.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">New Campaign</h3>
          <p className="text-sm text-muted-foreground">
            Define campaign intent, targeting, and the user flow it should trigger inside WhatsApp.
          </p>
        </div>
        <Link href="/campaign/campaigns" className="text-sm font-medium text-primary hover:underline">
          Back to list
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="rounded-xl border bg-card p-6 space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm font-medium">
            <span>Campaign name</span>
            <input
              type="text"
              name="campaignName"
              value={formData.campaignName}
              onChange={handleChange}
              className="w-full rounded-md border px-3 py-2"
              placeholder="e.g. Festive Loyalty Boost"
              required
            />
          </label>
          <label className="space-y-1 text-sm font-medium">
            <span>Objective</span>
            <input
              type="text"
              name="objective"
              value={formData.objective}
              onChange={handleChange}
              className="w-full rounded-md border px-3 py-2"
              placeholder="Drive redemptions, re-engage, etc."
              required
            />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm font-medium">
            <span>Target region</span>
            <select
              name="targetRegionID"
              value={formData.targetRegionID}
              onChange={handleChange}
              className="w-full rounded-md border px-3 py-2"
              required
            >
              <option value="">Select region</option>
              {regions.map((region) => (
                <option key={region.id} value={region.id}>
                  {region.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium">
            <span>User flow</span>
            <select
              name="userFlowID"
              value={formData.userFlowID}
              onChange={handleChange}
              className="w-full rounded-md border px-3 py-2"
              required
            >
              <option value="">Select flow</option>
              {userFlows.map((flow) => (
                <option key={flow.id} value={flow.id}>
                  {flow.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <Link href="/campaign/campaigns" className="text-sm font-medium text-muted-foreground hover:text-foreground">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? "Saving..." : "Create campaign"}
          </button>
        </div>
      </form>

      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}

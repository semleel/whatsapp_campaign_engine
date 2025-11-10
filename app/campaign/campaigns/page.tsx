"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

interface Campaign {
  campaignid: number;
  campaignname: string;
  userflowname: string;
  regionname: string;
  currentstatus: string;
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  new: "bg-emerald-100 text-emerald-700",
  paused: "bg-amber-100 text-amber-700",
  scheduled: "bg-sky-100 text-sky-700",
  expired: "bg-rose-100 text-rose-700",
};

export default function CampaignsPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("http://localhost:3000/api/campaign/list");
        if (!res.ok) throw new Error("Failed to load campaigns");
        setCampaigns(await res.json());
      } catch (err) {
        console.error(err);
        setMessage("Unable to load campaigns right now.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleEdit = (id: number) => router.push(`/campaign/campaigns/${id}`);

  const handleArchive = async (id: number) => {
    if (!confirm("Archive this campaign?")) return;
    try {
      const res = await fetch(`http://localhost:3000/api/campaign/archive/${id}`, { method: "PUT" });
      if (!res.ok) throw new Error("Archive failed");
      setMessage("Campaign archived successfully.");
      setCampaigns((prev) => prev.filter((c) => c.campaignid !== id));
    } catch (err) {
      console.error(err);
      setMessage("Failed to archive campaign.");
    }
  };

  const activeCount = useMemo(
    () => campaigns.filter((c) => c.currentstatus?.toLowerCase() === "active").length,
    [campaigns]
  );

  const filteredCampaigns = useMemo(() => {
    if (statusFilter === "all") return campaigns;
    const wanted = statusFilter.toLowerCase();
    return campaigns.filter((c) => (c.currentstatus || "").toLowerCase() === wanted);
  }, [campaigns, statusFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Campaign Management</h3>
          <p className="text-sm text-muted-foreground">
            Manage live journeys, inspect targeting, and nudge campaigns through approvals without leaving this view.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <label className="text-sm text-muted-foreground mr-2">Filter by status</label>
          <select
            className="rounded-md border px-2 py-1 text-sm mr-4"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All</option>
            <option value="New">New</option>
            <option value="Active">Active</option>
            <option value="On Hold">On Hold</option>
            <option value="Paused">Paused</option>
            <option value="Inactive">Inactive</option>
          </select>
          <Link
            href="/campaign/campaigns/archieved"
            className="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted">
            Archived Campaigns
          </Link>
          <Link
            href="/campaign/campaigns/create"
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90">
            New Campaign
          </Link>
        </div>
      </div>

      <div className="rounded-xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Campaign</th>
              <th className="px-3 py-2 text-left font-medium">User flow</th>
              <th className="px-3 py-2 text-left font-medium">Region</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-muted-foreground">
                  Loading campaigns...
                </td>
              </tr>
            ) : filteredCampaigns.length ? (
              filteredCampaigns.map((c) => {
                const badge = STATUS_STYLES[c.currentstatus?.toLowerCase()] || "bg-slate-100 text-slate-700";
                return (
                  <tr key={c.campaignid} className="border-t">
                    <td className="px-3 py-2 font-medium">{c.campaignname}</td>
                    <td className="px-3 py-2 text-muted-foreground">{c.userflowname}</td>
                    <td className="px-3 py-2 text-muted-foreground">{c.regionname}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-medium ${badge}`}>{c.currentstatus}</span>
                    </td>
                    <td className="px-3 py-2 text-right space-x-2">
                      <button
                        onClick={() => handleEdit(c.campaignid)}
                        className="rounded border px-2 py-1 text-xs font-medium hover:bg-muted"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleArchive(c.campaignid)}
                        className="rounded border px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                      >
                        Archive
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-muted-foreground">
                  No campaigns yet. Create one to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border p-4 text-sm text-muted-foreground flex flex-wrap items-center justify-between gap-3">
        <div>Active journeys: {activeCount}</div>
        {message && <div className="text-xs">{message}</div>}
      </div>
    </div>
  );
}

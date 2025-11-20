"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Api } from "@/lib/client";
import { showCenteredConfirm } from "@/lib/showAlert";

interface Campaign {
  campaignid: number;
  campaignname: string;
  objective: string | null;
  regionname?: string | null;
  currentstatus?: string | null;
  start_at?: string | null;
  end_at?: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  archived: "bg-slate-200 text-slate-700",
  inactive: "bg-slate-200 text-slate-700",
};

export default function ArchivedCampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const data = await Api.listArchivedCampaigns();
        setCampaigns(data);
      } catch (error: any) {
        console.error("Error fetching archived campaigns:", error);
        setMessage(error?.message || "Unable to load archived campaigns.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleRestore = async (id: number) => {
    const confirmed = await showCenteredConfirm("Restore this campaign?");
    if (!confirmed) return;
    try {
      await Api.restoreCampaign(id);
      setMessage("Campaign restored successfully.");
      setCampaigns((prev) => prev.filter((c) => c.campaignid !== id));
    } catch (err: any) {
      console.error(err);
      setMessage(err?.message || "Network error.");
    }
  };

  const formatDateTime = (value?: string | null) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString();
  };

  const archivedCount = useMemo(() => campaigns.length, [campaigns]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Archived campaigns</h3>
          <p className="text-sm text-muted-foreground">
            View and restore campaigns that were previously archived.
          </p>
        </div>
        <Link href="/campaign" className="inline-flex items-center rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
          Back to active list
        </Link>
      </div>

      {message && <div className="text-sm text-muted-foreground">{message}</div>}

      <div className="rounded-xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Campaign</th>
              <th className="px-3 py-2 text-left font-medium">Region</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-left font-medium">Start</th>
              <th className="px-3 py-2 text-left font-medium">End</th>
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-muted-foreground">
                  Loading archived campaigns...
                </td>
              </tr>
            ) : campaigns.length ? (
              campaigns.map((c) => {
                const badge = STATUS_STYLES[c.currentstatus?.toLowerCase() || "archived"] || "bg-slate-200 text-slate-700";
                return (
                  <tr key={c.campaignid} className="border-t">
                    <td className="px-3 py-2">
                      <div className="font-medium">{c.campaignname}</div>
                      <div className="text-xs text-muted-foreground">{c.objective || "—"}</div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{c.regionname || "N/A"}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-medium ${badge}`}>{c.currentstatus || "Archived"}</span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{formatDateTime(c.start_at)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{formatDateTime(c.end_at)}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => handleRestore(c.campaignid)}
                        className="rounded border px-2 py-1 text-xs font-medium hover:bg-muted"
                      >
                        Restore
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-muted-foreground">
                  No archived campaigns.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border p-4 text-sm text-muted-foreground flex flex-wrap items-center justify-between gap-3">
        <div>Archived campaigns: {archivedCount}</div>
        {message && <div className="text-xs">{message}</div>}
      </div>
    </div>
  );
}

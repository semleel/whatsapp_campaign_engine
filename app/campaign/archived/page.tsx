"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Api } from "@/lib/client";
import { usePrivilege } from "@/lib/permissions";
import { showCenteredAlert, showCenteredConfirm, showPrivilegeDenied } from "@/lib/showAlert";

interface Campaign {
  campaignid: number;
  campaignname: string;
  objective: string | null;
  userflowname?: string | null;
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
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const { canView, canArchive, loading: privLoading } = usePrivilege("campaigns");
  const navLinkClass =
    "inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1.5 text-sm font-semibold text-primary shadow-sm hover:bg-secondary/80";
  const backIcon = (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M11.5 5.5 7 10l4.5 4.5 1.4-1.4L9.8 10l3.1-3.1z" />
    </svg>
  );

  useEffect(() => {
    (async () => {
      if (privLoading) return;
      if (!canView) {
        setMessage("You do not have permission to view archived campaigns.");
        setLoading(false);
        return;
      }
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
    if (!canArchive) {
      await showPrivilegeDenied({ action: "restore campaigns", resource: "Campaigns" });
      return;
    }
    const confirmed = await showCenteredConfirm("Restore this campaign?");
    if (!confirmed) return;
    try {
      await Api.restoreCampaign(id);
      setMessage("Campaign restored successfully.");
      setCampaigns((prev) => prev.filter((c) => c.campaignid !== id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (err: any) {
      console.error(err);
      setMessage(err?.message || "Network error.");
    }
  };

  const handleDelete = async (id: number) => {
    if (!canArchive) {
      await showPrivilegeDenied({ action: "delete campaigns", resource: "Campaigns" });
      return;
    }
    const confirmed = await showCenteredConfirm(
      "Permanently delete this archived campaign? This cannot be undone."
    );
    if (!confirmed) return;
    try {
      await Api.deleteArchivedCampaign(id);
      setCampaigns((prev) => prev.filter((c) => c.campaignid !== id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setMessage("Campaign permanently deleted.");
    } catch (err: any) {
      console.error(err);
      setMessage(err?.message || "Failed to delete campaign.");
    }
  };

  const handleBulkDelete = async () => {
    if (!canArchive) {
      await showPrivilegeDenied({ action: "delete campaigns", resource: "Campaigns" });
      return;
    }
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    const confirmed = await showCenteredConfirm(
      `Permanently delete ${ids.length} archived campaign(s)? This cannot be undone.`
    );
    if (!confirmed) return;
    try {
      const res = await Api.deleteArchivedCampaigns(ids);
      setCampaigns((prev) =>
        prev.filter((c) => !selectedIds.has(c.campaignid))
      );
      setSelectedIds(new Set());
      setMessage(res.message);
      await showCenteredAlert(res.message);
    } catch (err: any) {
      console.error(err);
      setMessage(err?.message || "Failed to delete archived campaigns.");
    }
  };

  const handleBulkRestore = async () => {
    if (!canArchive) {
      await showPrivilegeDenied({ action: "restore campaigns", resource: "Campaigns" });
      return;
    }
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    const confirmed = await showCenteredConfirm(
      `Restore ${ids.length} archived campaign(s)?`
    );
    if (!confirmed) return;
    try {
      await Promise.all(ids.map((id) => Api.restoreCampaign(id)));
      setCampaigns((prev) => prev.filter((c) => !selectedIds.has(c.campaignid)));
      setSelectedIds(new Set());
      setMessage("Selected campaigns restored.");
      await showCenteredAlert("Selected campaigns restored.");
    } catch (err: any) {
      console.error(err);
      setMessage(err?.message || "Failed to bulk restore campaigns.");
    }
  };

  const formatDateTime = (value?: string | null) => {
    if (!value) return "--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--";
    return date.toLocaleString();
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      if (prev.size === campaigns.length) {
        return new Set();
      }
      return new Set(campaigns.map((c) => c.campaignid));
    });
  };

  const archivedCount = useMemo(() => campaigns.length, [campaigns]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Archived campaigns</h3>
          <p className="text-sm text-muted-foreground">
            View, restore, or permanently delete campaigns that were previously
            archived.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleBulkRestore}
            disabled={!selectedIds.size}
            className={`rounded border px-3 py-2 text-sm font-medium ${
              selectedIds.size
                ? "text-emerald-700 hover:bg-emerald-50 border-emerald-200"
                : "text-muted-foreground border-border cursor-not-allowed opacity-60"
            }`}
            title={
              selectedIds.size
                ? "Restore selected archived campaigns"
                : "Select archived campaigns to restore"
            }
          >
            Restore selected
          </button>
          <button
            onClick={handleBulkDelete}
            disabled={!selectedIds.size}
            className={`rounded border px-3 py-2 text-sm font-medium ${
              selectedIds.size
                ? "text-rose-700 hover:bg-rose-50 border-rose-200"
                : "text-muted-foreground border-border cursor-not-allowed opacity-60"
            }`}
            title={
              selectedIds.size
                ? "Delete selected archived campaigns"
                : "Select archived campaigns to delete"
            }
          >
            Delete selected
          </button>
        <Link
          href="/campaign"
          className={navLinkClass}
        >
          {backIcon}
          Back to campaigns
        </Link>
      </div>
      </div>

      {message && <div className="text-sm text-muted-foreground">{message}</div>}

      <div className="rounded-xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="px-3 py-2 text-left font-medium">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={
                    selectedIds.size > 0 &&
                    selectedIds.size === campaigns.length
                  }
                  onChange={toggleSelectAll}
                />
              </th>
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
                <td colSpan={7} className="px-3 py-4 text-muted-foreground">
                  Loading archived campaigns...
                </td>
              </tr>
            ) : campaigns.length ? (
              campaigns.map((c) => {
                const badge =
                  STATUS_STYLES[c.currentstatus?.toLowerCase() || "archived"] ||
                  "bg-slate-200 text-slate-700";
                const isSelected = selectedIds.has(c.campaignid);
                return (
                  <tr key={c.campaignid} className="border-t">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label={`Select ${c.campaignname}`}
                        checked={isSelected}
                        onChange={() => toggleSelect(c.campaignid)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{c.campaignname}</div>
                      <div className="text-xs text-muted-foreground">
                        {c.objective || "--"}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {c.regionname || "N/A"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${badge}`}
                      >
                        {c.currentstatus || "Archived"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {formatDateTime(c.start_at)}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {formatDateTime(c.end_at)}
                    </td>
                    <td className="px-3 py-2 text-right space-x-2">
                      <button
                        onClick={() => handleRestore(c.campaignid)}
                        className="rounded border px-2 py-1 text-xs font-medium hover:bg-muted"
                      >
                        Restore
                      </button>
                      <button
                        onClick={() => handleDelete(c.campaignid)}
                        className="rounded border px-2 py-1 text-xs font-medium text-rose-700 border-rose-200 hover:bg-rose-50"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-muted-foreground">
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

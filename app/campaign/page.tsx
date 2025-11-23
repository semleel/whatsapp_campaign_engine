"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import QueryAnnouncement from "@/components/QueryAnnouncement";
import { Api } from "@/lib/client";
import { showCenteredAlert, showCenteredConfirm } from "@/lib/showAlert";
import { usePrivilege } from "@/lib/permissions";

interface Campaign {
  campaignid: number;
  campaignname: string;
  regionname: string;
  currentstatus: string;
  start_at?: string | null;
  end_at?: string | null;
  hasKeyword?: boolean;
  hasTemplate?: boolean;
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  new: "bg-emerald-100 text-emerald-700",
  paused: "bg-amber-100 text-amber-700",
  "on hold": "bg-sky-100 text-sky-700",
  inactive: "bg-slate-100 text-slate-700",
};

// Only block editing when the campaign is Active
const canEditCampaign = (status: string | undefined | null) =>
  (status || "").toLowerCase() !== "active";

export default function CampaignsPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [openWarningId, setOpenWarningId] = useState<number | null>(null);
  const { loading: privLoading, canView, canCreate, canUpdate, canArchive } = usePrivilege(
    "campaigns"
  );

  useEffect(() => {
    (async () => {
      if (privLoading) return;
      if (!canView) {
        setErrorMessage("You do not have permission to view campaigns.");
        setLoading(false);
        return;
      }
      try {
        const data = await Api.listCampaigns();
        setCampaigns(data);
      } catch (err) {
        console.error(err);
        setErrorMessage(
          err instanceof Error
            ? err.message
            : "Unable to load campaigns right now."
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [canView, privLoading]);

  useEffect(() => {
    const handleClickAway = (event: MouseEvent) => {
      if (!openWarningId) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest(".warning-popover")) return;
      setOpenWarningId(null);
    };
    document.addEventListener("mousedown", handleClickAway);
    return () => document.removeEventListener("mousedown", handleClickAway);
  }, [openWarningId]);

  if (!privLoading && !canView) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
        You do not have permission to view campaigns.
      </div>
    );
  }

  const handleEdit = (id: number) => {
    if (!canUpdate) {
      setErrorMessage("You do not have permission to edit campaigns.");
      return;
    }
    router.push(`/campaign/${id}`);
  };

  const handleArchive = async (id: number) => {
    if (!canArchive) {
      setErrorMessage("You do not have permission to archive campaigns.");
      return;
    }
    const confirmed = await showCenteredConfirm("Archive this campaign?");
    if (!confirmed) return;
    try {
      await Api.archiveCampaign(id);
      await showCenteredAlert("Campaign archived successfully.");
      setCampaigns((prev) => prev.filter((c) => c.campaignid !== id));
    } catch (err) {
      console.error(err);
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to archive campaign."
      );
    }
  };

  const handlePause = async (id: number) => {
    if (!canUpdate) {
      setErrorMessage("You do not have permission to update campaigns.");
      return;
    }
    const confirmed = await showCenteredConfirm(
      "Pause this campaign so you can edit the schedule?"
    );
    if (!confirmed) return;
    try {
      await Api.updateCampaign(id, { status: "Paused" });

      setCampaigns((prev) =>
        prev.map((c) =>
          c.campaignid === id ? { ...c, currentstatus: "Paused" } : c
        )
      );
      await showCenteredAlert("Campaign paused. You can now edit the schedule.");
    } catch (err) {
      console.error(err);
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to pause campaign."
      );
    }
  };

  const activeCount = useMemo(
    () =>
      campaigns.filter(
        (c) => c.currentstatus?.toLowerCase() === "active"
      ).length,
    [campaigns]
  );

  const filteredCampaigns = useMemo(() => {
    if (statusFilter === "all") return campaigns;
    const wanted = statusFilter.toLowerCase();
    return campaigns.filter(
      (c) => (c.currentstatus || "").toLowerCase() === wanted
    );
  }, [campaigns, statusFilter]);

  const formatDateTime = (value?: string | null) => {
    if (!value) return "--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--";
    return date.toLocaleString();
  };

  return (
    <div className="space-y-6">
      <QueryAnnouncement />
      {errorMessage && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {errorMessage}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Campaign Management</h3>
          <p className="text-sm text-muted-foreground">
            Manage live campaigns, inspect targeting, and nudge campaigns
            through approvals without leaving this view.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <label className="text-sm text-muted-foreground mr-2">
            Filter by status
          </label>
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
            href="/campaign/archived"
            className="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Archived Campaigns
          </Link>
          {canCreate && (
            <Link
              href="/campaign/create"
              className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90"
            >
              New Campaign
            </Link>
          )}
        </div>
      </div>

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
                  Loading campaigns...
                </td>
              </tr>
            ) : filteredCampaigns.length ? (
              filteredCampaigns.map((c) => {
                const badge =
                  STATUS_STYLES[c.currentstatus?.toLowerCase()] ||
                  "bg-slate-100 text-slate-700";

                const isActive =
                  (c.currentstatus || "").toLowerCase() === "active";
                const editable = canEditCampaign(c.currentstatus);
                const allowPause = canUpdate && isActive;
                const allowEdit = canUpdate && editable;
                const allowArchive = canArchive;
                const missingKeyword = c.hasKeyword === false;
                const missingTemplate = c.hasTemplate === false;
                const hasWarning = missingKeyword || missingTemplate;
                const warningText = [
                  missingKeyword ? "Missing keyword" : null,
                  missingTemplate ? "Missing template" : null,
                ]
                  .filter(Boolean)
                  .join(" | ");

                return (
                  <tr key={c.campaignid} className="border-t">
                    <td className="px-3 py-2 font-medium">
                      <div className="flex items-center gap-2">
                        <span>{c.campaignname}</span>
                        {hasWarning && (
                          <div className="relative inline-flex warning-popover">
                            <button
                              type="button"
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-rose-700 text-xs font-bold"
                              onClick={() =>
                                setOpenWarningId((prev) =>
                                  prev === c.campaignid ? null : c.campaignid
                                )
                              }
                              aria-label="Missing configuration"
                            >
                              !
                            </button>
                            <div
                              className={`absolute left-0 top-6 z-10 ${
                                openWarningId === c.campaignid
                                  ? "block"
                                  : "hidden"
                              } w-56 max-h-48 overflow-y-auto rounded-lg border border-rose-200 bg-white p-3 text-xs text-rose-700 shadow-lg`}
                            >
                              <div className="font-semibold text-rose-700 mb-2">
                                {warningText || "Missing configuration"}
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {missingKeyword && (
                                  <Link
                                    href="/campaign/keywords"
                                    className="rounded border border-rose-200 px-2 py-1 text-rose-700 hover:bg-rose-50"
                                  >
                                    Manage keywords
                                  </Link>
                                )}
                                {missingTemplate && (
                                  <Link
                                    href="/content/templates/create"
                                    className="rounded border border-rose-200 px-2 py-1 text-rose-700 hover:bg-rose-50"
                                  >
                                    Create template
                                  </Link>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {c.regionname}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${badge}`}
                      >
                        {c.currentstatus}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {formatDateTime(c.start_at)}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {formatDateTime(c.end_at)}
                    </td>
                    <td className="px-3 py-2 text-right space-x-2">
                      {allowPause ? (
                        <button
                          onClick={() => handlePause(c.campaignid)}
                          className="rounded border px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50"
                          title="Pause this campaign to edit its schedule."
                        >
                          Pause
                        </button>
                      ) : allowEdit ? (
                        <button
                          onClick={() => allowEdit && handleEdit(c.campaignid)}
                          disabled={!allowEdit}
                          title={
                            allowEdit
                              ? "Edit campaign & schedule"
                              : "Cannot edit this campaign."
                          }
                          className={`rounded border px-2 py-1 text-xs font-medium hover:bg-muted ${
                            !allowEdit
                              ? "cursor-not-allowed opacity-50 hover:bg-transparent"
                              : ""
                          }`}
                        >
                          Edit
                        </button>
                      ) : null}
                      {allowArchive ? (
                        <button
                          onClick={() => handleArchive(c.campaignid)}
                          className="rounded border px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                        >
                          Archive
                        </button>
                      ) : null}
                      {!allowPause && !allowEdit && !allowArchive && (
                        <span className="text-xs text-muted-foreground">No actions</span>
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-muted-foreground">
                  No campaigns yet. Create one to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border p-4 text-sm text-muted-foreground flex flex-wrap items-center justify-between gap-3">
        <div>Active campaigns: {activeCount}</div>
      </div>
    </div>
  );
}

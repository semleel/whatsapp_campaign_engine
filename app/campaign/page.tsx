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
  is_active?: boolean | null;
  start_at?: string | null;
  end_at?: string | null;
  hasKeyword?: boolean;
  hasSteps?: boolean;
}

const STATUS_STYLES: Record<string, string> = {
  "on going": "bg-emerald-100 text-emerald-700",
  upcoming: "bg-sky-100 text-sky-700",
  expired: "bg-slate-100 text-slate-700",
};

// Only block editing when the campaign is actively running
const canEditCampaign = (status: string | undefined | null) =>
  (status || "").toLowerCase() !== "on going";

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

  const handleToggleActive = async (id: number, current?: boolean | null) => {
    if (!canUpdate) {
      setErrorMessage("You do not have permission to update campaigns.");
      return;
    }
    const next = !current;
    try {
      await Api.updateCampaign(id, { is_active: next });
      setCampaigns((prev) =>
        prev.map((c) =>
          c.campaignid === id ? { ...c, is_active: next } : c
        )
      );
    } catch (err) {
      console.error(err);
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to update active state."
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
        (c) => c.currentstatus?.toLowerCase() === "on going"
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
            <option value="Upcoming">Upcoming</option>
            <option value="On Going">On Going</option>
            <option value="Expired">Expired</option>
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
              <th className="px-3 py-2 text-left font-medium">Active</th>
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

                const isRunning = !!c.is_active; // when flagged active, lock edits/archiving
                const editable = canUpdate && !isRunning;
                const allowPause = false; // we now gate by is_active, not status-based pause
                const allowEdit = editable;
                const allowArchive = canArchive && !isRunning;
                const missingKeyword = c.hasKeyword === false;
                const missingSteps = c.hasSteps === false;
                const hasWarning = missingKeyword || missingSteps;
                const warningText = [
                  missingKeyword ? "Missing keyword" : null,
                  missingSteps ? "Missing steps" : null,
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
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-800 text-xs font-bold"
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
                              } w-52 max-h-40 overflow-y-auto rounded-lg border border-amber-200 bg-white p-3 text-xs text-amber-800 shadow-lg`}
                            >
                              <div className="font-semibold text-amber-800 mb-2">
                                {warningText || "Missing configuration"}
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {missingKeyword && (
                                  <Link
                                    href="/campaign/keywords"
                                    className="rounded border border-amber-200 px-2 py-1 text-amber-800 hover:bg-amber-50"
                                  >
                                    Manage keywords
                                  </Link>
                                )}
                                {missingSteps && (
                                  <Link
                                    href={`/campaign/${c.campaignid}`}
                                    className="rounded border border-amber-200 px-2 py-1 text-amber-800 hover:bg-amber-50"
                                  >
                                    Add steps
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
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(c.campaignid, c.is_active)}
                        disabled={!canUpdate}
                        className={`relative h-6 w-11 overflow-hidden rounded-full border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 ${
                          c.is_active ? "bg-emerald-500 border-emerald-600" : "bg-slate-200 border-slate-300"
                        } ${!canUpdate ? "cursor-not-allowed opacity-60" : "hover:opacity-90"}`}
                        aria-pressed={!!c.is_active}
                        aria-label={c.is_active ? "Deactivate campaign" : "Activate campaign"}
                        aria-disabled={!canUpdate}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                            c.is_active ? "translate-x-5" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {formatDateTime(c.start_at)}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {formatDateTime(c.end_at)}
                    </td>
                    <td className="px-3 py-2 text-right space-x-2">
                      {allowEdit ? (
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
                          disabled={!allowArchive}
                          title={
                            allowArchive
                              ? "Archive campaign"
                              : "Cannot archive while active"
                          }
                        >
                          Archive
                        </button>
                      ) : null}
                      {!allowEdit && !allowArchive && (
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

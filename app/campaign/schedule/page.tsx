"use client";

import { useEffect, useMemo, useState } from "react";

type ScheduleItem = {
  campaignId: number;
  campaignName: string;
  status: string;
  scheduleId?: number;
  start: string;
  end: string;
  timeMessage?: string;
};

type ReminderJob = {
  id: string;
  campaign: string;
  sendAt: string;
  message: string;
};

type CampaignOption = {
  campaignid: number;
  campaignname: string;
  campaignscheduleid?: number | null;
};

const reminderJobs: ReminderJob[] = [
  { id: "job-1", campaign: "RAYA 2025", sendAt: "2025-04-12T12:00", message: "Reminder: claim Raya rewards today." },
  { id: "job-2", campaign: "Loyalty Booster", sendAt: "2025-05-07T09:00", message: "Daily loyalty tip for opted-in users." },
];

function formatDateTime(date?: string, time?: string) {
  if (!date) return "";
  const t = time || "00:00";
  return `${date}T${t.slice(0, 5)}`;
}

export default function CampaignSchedulerModule() {
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [campaignOptions, setCampaignOptions] = useState<CampaignOption[]>([]);
  const [form, setForm] = useState({ campaignId: "", start: "", end: "", timeMessage: "" });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editRowId, setEditRowId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{ start: string; end: string; timeMessage: string }>({ start: "", end: "", timeMessage: "" });
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const activeCount = useMemo(() => items.filter((i) => i.status.toLowerCase() === "active").length, [items]);
  const sortedItems = useMemo(() => {
    const arr = [...items];
    arr.sort((a, b) => {
      const cmp = (a.status || '').localeCompare(b.status || '', undefined, { sensitivity: 'base' });
      return sortOrder === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [items, sortOrder]);

  async function loadCampaigns() {
    setLoadingCampaigns(true);
    try {
      const res = await fetch("http://localhost:3000/api/campaign/list");
      if (!res.ok) throw new Error(await res.text());
      const data: CampaignOption[] = await res.json();
      // Only show campaigns that are new/unscheduled (and API already excludes Archived)
      const unscheduled = data.filter((c) => !c.campaignscheduleid);
      setCampaignOptions(unscheduled);
    } catch (err: any) {
      console.error("Campaign list error:", err);
      setError("Failed to load campaigns");
    } finally {
      setLoadingCampaigns(false);
    }
  }

  async function loadSchedules() {
    setLoading(true);
    try {
      const res = await fetch("http://localhost:3000/api/campaignschedule/schedules");
      if (!res.ok) throw new Error(await res.text());
      const data: any[] = await res.json();
      const mapped: ScheduleItem[] = data
        .filter((entry) => entry.schedule)
        .map((entry) => ({
          campaignId: entry.campaignid,
          campaignName: entry.campaignname,
          status: entry.status || "Unknown",
          scheduleId: entry.schedule?.id,
          start: formatDateTime(entry.schedule?.startDate, entry.schedule?.startTime),
          end: formatDateTime(entry.schedule?.endDate, entry.schedule?.endTime),
          timeMessage: entry.schedule?.timeMessage || "",
        }));
      setItems(mapped);
    } catch (err: any) {
      console.error("Schedule fetch error:", err);
      setError("Failed to load schedules");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCampaigns();
    loadSchedules();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.campaignId || !form.start || !form.end) return;
    try {
      const [startDate, startTime] = form.start.split("T");
      const [endDate, endTime] = form.end.split("T");
      const res = await fetch("http://localhost:3000/api/campaignschedule/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignID: Number(form.campaignId),
          startDate,
          startTime,
          endDate,
          endTime,
          timeMessage: form.timeMessage || "",
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setMessage("Schedule saved via Supabase.");
      setForm({ campaignId: "", start: "", end: "", timeMessage: "" });
      await loadSchedules();
    } catch (err: any) {
      console.error("Schedule submit error:", err);
      setError("Failed to save schedule");
    }
  };

  const handlePause = async (campaignId: number) => {
    try {
      const res = await fetch(`http://localhost:3000/api/campaignschedule/pause/${campaignId}`, {
        method: "PUT",
      });
      if (!res.ok) throw new Error(await res.text());
      await loadSchedules();
    } catch (err: any) {
      console.error("Pause campaign error:", err);
      setError("Failed to pause campaign");
    }
  };

  const handleStartEdit = (item: ScheduleItem) => {
    setError(null);
    setEditRowId(item.campaignId);
    setEditForm({ start: item.start, end: item.end, timeMessage: item.timeMessage || "" });
  };

  const handleCancelEdit = () => {
    setEditRowId(null);
    setEditForm({ start: "", end: "", timeMessage: "" });
  };

  const handleSaveEdit = async (item: ScheduleItem) => {
    try {
      const [startDate, startTime] = (editForm.start || "").split("T");
      const [endDate, endTime] = (editForm.end || "").split("T");
      const res = await fetch(`http://localhost:3000/api/campaignschedule/update/${item.scheduleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, startTime, endDate, endTime, timeMessage: editForm.timeMessage || "" }),
      });
      if (!res.ok) throw new Error(await res.text());
      setEditRowId(null);
      setEditForm({ start: "", end: "", timeMessage: "" });
      await loadSchedules();
    } catch (err: any) {
      console.error("Save schedule edit error:", err);
      setError("Failed to save schedule changes");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Campaign Scheduler Module</h3>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Define start/end windows, adjust timelines centrally, and queue timed reminders without touching code.
          </p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="text-muted-foreground">Active windows: {activeCount}</div>
          <label className="flex items-center gap-2">
            <span className="text-muted-foreground">Sort by status</span>
            <select
              className="rounded-md border px-2 py-1"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
            >
              <option value="asc">A–Z</option>
              <option value="desc">Z–A</option>
            </select>
          </label>
        </div>
      </div>

      <section className="rounded-xl border p-5 space-y-4">
        <div>
          <h4 className="text-base font-semibold">Set start / end</h4>
          <p className="text-sm text-muted-foreground">Choose a campaign and schedule window, optionally add a time message, then save.</p>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2">
            <select
              className="w-full rounded-md border px-3 py-2 text-sm"
              value={form.campaignId}
              onChange={(e) => setForm((prev) => ({ ...prev, campaignId: e.target.value }))}
              required
              disabled={loadingCampaigns}
            >
              <option value="">{loadingCampaigns ? "Loading campaigns..." : "Select campaign"}</option>
              {campaignOptions.map((c) => (
                <option key={c.campaignid} value={String(c.campaignid)}>
                  {c.campaignname}
                </option>
              ))}
            </select>
          </div>

          <input
            type="datetime-local"
            className="rounded-md border px-3 py-2 text-sm"
            value={form.start}
            onChange={(e) => setForm((prev) => ({ ...prev, start: e.target.value }))}
            required
          />

          <input
            type="datetime-local"
            className="rounded-md border px-3 py-2 text-sm"
            value={form.end}
            onChange={(e) => setForm((prev) => ({ ...prev, end: e.target.value }))}
            required
          />

          <input
            type="text"
            className="rounded-md border px-3 py-2 text-sm"
            placeholder="Optional time message"
            value={form.timeMessage}
            onChange={(e) => setForm((prev) => ({ ...prev, timeMessage: e.target.value }))}
          />

          <div className="md:col-span-4 flex justify-end">
            <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm">
              Save schedule
            </button>
          </div>
        </form>
        {message && <p className="text-xs text-muted-foreground">{message}</p>}
        {error && <p className="text-xs text-rose-600">{error}</p>}
      </section>

      <section className="rounded-xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Campaign</th>
              <th className="px-3 py-2 text-left font-medium">Start</th>
              <th className="px-3 py-2 text-left font-medium">End</th>
              <th className="px-3 py-2 text-left font-medium">Message</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-muted-foreground">
                  Loading schedules...
                </td>
              </tr>
            ) : sortedItems.length ? (
              sortedItems.map((item) => (
                <tr key={item.campaignId} className="border-t">
                  <td className="px-3 py-2 font-medium">{item.campaignName}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {editRowId === item.campaignId ? (
                      <input
                        type="datetime-local"
                        className="rounded-md border px-2 py-1 text-xs"
                        value={editForm.start}
                        onChange={(e) => setEditForm((p) => ({ ...p, start: e.target.value }))}
                      />
                    ) : item.start ? (
                      new Date(item.start).toLocaleString()
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {editRowId === item.campaignId ? (
                      <input
                        type="datetime-local"
                        className="rounded-md border px-2 py-1 text-xs"
                        value={editForm.end}
                        onChange={(e) => setEditForm((p) => ({ ...p, end: e.target.value }))}
                      />
                    ) : item.end ? (
                      new Date(item.end).toLocaleString()
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {editRowId === item.campaignId ? (
                      <input
                        type="text"
                        className="w-full rounded-md border px-2 py-1 text-xs"
                        value={editForm.timeMessage}
                        onChange={(e) => setEditForm((p) => ({ ...p, timeMessage: e.target.value }))}
                        placeholder="Optional message"
                      />
                    ) : (
                      <span className="block max-w-xs truncate" title={item.timeMessage || ""}>
                        {item.timeMessage || "-"}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {(() => {
                      const s = item.status.toLowerCase();
                      const cls =
                        s === "active"
                          ? "bg-emerald-100 text-emerald-700"
                          : s === "paused"
                          ? "bg-amber-100 text-amber-700"
                          : s === "on hold"
                          ? "bg-sky-100 text-sky-700"
                          : s === "inactive"
                          ? "bg-slate-200 text-slate-700"
                          : "bg-slate-100 text-slate-600";
                      return (
                        <span className={`rounded-full px-3 py-1 text-xs font-medium ${cls}`}>
                          {item.status}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-2 text-right space-x-2">
                    {editRowId === item.campaignId ? (
                      <>
                        <button
                          onClick={() => handleSaveEdit(item)}
                          className="rounded bg-emerald-600 text-white px-2 py-1 text-xs font-medium hover:opacity-90"
                          title="Save schedule changes"
                        >
                          Save
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="rounded border px-2 py-1 text-xs font-medium hover:bg-muted"
                          title="Cancel editing"
                        >
                          Cancel
                        </button>
                      </>
                    ) : item.status.toLowerCase() === "active" ? (
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => handlePause(item.campaignId)}
                          className="rounded bg-amber-600 text-white px-2 py-1 text-xs font-medium hover:opacity-90"
                          title="Pause campaign to enable editing the schedule"
                        >
                          Pause
                        </button>
                        <button
                          disabled
                          className="rounded border px-2 py-1 text-xs font-medium opacity-50 cursor-not-allowed"
                          title="Pause first to edit"
                        >
                          Edit
                        </button>
                        <span className="text-xs text-muted-foreground">Pause to edit schedule</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleStartEdit(item)}
                        className="rounded border px-2 py-1 text-xs font-medium hover:bg-muted"
                        title="Edit schedule"
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-muted-foreground">
                  No schedules yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="rounded-xl border p-5 space-y-3">
        <div>
          <h4 className="text-base font-semibold">Timed reminders</h4>
          <p className="text-sm text-muted-foreground">
            Sample jobs queued in the scheduler dispatch engine. Replace with live data from Supabase when ready.
          </p>
        </div>
        <div className="space-y-2 text-sm">
          {reminderJobs.map((job) => (
            <div key={job.id} className="rounded-lg border px-3 py-2">
              <div className="flex items-center justify-between">
                <div className="font-medium">{job.campaign}</div>
                <div className="text-xs text-muted-foreground">{new Date(job.sendAt).toLocaleString()}</div>
              </div>
              <div className="text-muted-foreground">{job.message}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

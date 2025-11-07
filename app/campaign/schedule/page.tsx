"use client";

import { useEffect, useMemo, useState } from "react";

type ScheduleItem = {
  campaignId: number;
  campaignName: string;
  status: string;
  scheduleId?: number;
  start: string;
  end: string;
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
  const [form, setForm] = useState({ campaignId: "", start: "", end: "" });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const activeCount = useMemo(() => items.filter((i) => i.status.toLowerCase() === "active").length, [items]);

  async function loadCampaigns() {
    setLoadingCampaigns(true);
    try {
      const res = await fetch("http://localhost:3000/api/campaign/list");
      if (!res.ok) throw new Error(await res.text());
      const data: CampaignOption[] = await res.json();
      setCampaignOptions(data);
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
          timeMessage: "",
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setMessage("Schedule saved via Supabase.");
      setForm({ campaignId: "", start: "", end: "" });
      await loadSchedules();
    } catch (err: any) {
      console.error("Schedule submit error:", err);
      setError("Failed to save schedule");
    }
  };

  const handleExtend = async (item: ScheduleItem, minutes: number) => {
    if (!item.scheduleId || !item.start || !item.end) return;
    try {
      const start = new Date(item.start);
      const end = new Date(item.end);
      const newEnd = new Date(end.getTime() + minutes * 60000);

      const body = {
        startDate: item.start.slice(0, 10),
        startTime: item.start.slice(11, 16),
        endDate: newEnd.toISOString().slice(0, 10),
        endTime: newEnd.toISOString().slice(11, 16),
        timeMessage: "",
      };
      const res = await fetch(`http://localhost:3000/api/campaignschedule/update/${item.scheduleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      await loadSchedules();
    } catch (err: any) {
      console.error("Extend schedule error:", err);
      setError("Failed to adjust schedule");
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
        <div className="text-sm text-muted-foreground">Active windows: {activeCount}</div>
      </div>

      <section className="rounded-xl border p-5 space-y-4">
        <div>
          <h4 className="text-base font-semibold">Set start / end</h4>
          <p className="text-sm text-muted-foreground">Choose a campaign and schedule window, then push to the scheduler.</p>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-3">
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

          <div className="md:col-span-3 flex justify-end">
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
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Adjust</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-muted-foreground">
                  Loading schedules...
                </td>
              </tr>
            ) : items.length ? (
              items.map((item) => (
                <tr key={item.campaignId} className="border-t">
                  <td className="px-3 py-2 font-medium">{item.campaignName}</td>
                  <td className="px-3 py-2 text-muted-foreground">{item.start ? new Date(item.start).toLocaleString() : "-"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{item.end ? new Date(item.end).toLocaleString() : "-"}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        item.status.toLowerCase() === "active"
                          ? "bg-emerald-100 text-emerald-700"
                          : item.status.toLowerCase() === "upcoming"
                          ? "bg-sky-100 text-sky-700"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right space-x-2">
                    <button
                      onClick={() => handleExtend(item, 30)}
                      className="rounded border px-2 py-1 text-xs font-medium hover:bg-muted"
                      disabled={!item.scheduleId}
                    >
                      +30m
                    </button>
                    <button
                      onClick={() => handleExtend(item, -30)}
                      className="rounded border px-2 py-1 text-xs font-medium hover:bg-muted"
                      disabled={!item.scheduleId}
                    >
                      -30m
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-muted-foreground">
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

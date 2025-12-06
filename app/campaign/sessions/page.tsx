"use client";

import { useEffect, useState } from "react";
import { Api } from "@/lib/client";
import type { CampaignSession, SessionStatus } from "@/lib/types";

export default function SessionManagementModule() {
  const [sessions, setSessions] = useState<CampaignSession[]>([]);
  const [selected, setSelected] = useState<CampaignSession | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  async function loadSessions() {
    setLoading(true);
    setError("");
    try {
      const s = await Api.listSessions();
      setSessions(s);
      setSelected((prev) => {
        if (prev) {
          const refreshed = s.find((x) => x.id === prev.id);
          return refreshed ?? s[0] ?? null;
        }
        return s[0] ?? null;
      });
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSessions();
  }, []);

  async function updateStatus(id: number, to: SessionStatus) {
    setActionLoading(true);
    setError("");
    try {
      if (to === "PAUSED") {
        await Api.pauseSession(id);
      } else if (to === "ACTIVE") {
        await Api.resumeSession(id);
      } else if (to === "CANCELLED") {
        await Api.cancelSession(id);
      }
      await loadSessions();
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Action failed");
    } finally {
      setActionLoading(false);
    }
  }

  const statusStyles: Record<
    SessionStatus,
    { label: string; badgeClass: string }
  > = {
    ACTIVE: { label: "In Progress", badgeClass: "bg-emerald-100 text-emerald-700" },
    PAUSED: { label: "Paused", badgeClass: "bg-amber-100 text-amber-700" },
    COMPLETED: { label: "Completed", badgeClass: "bg-emerald-50 text-emerald-800" },
    EXPIRED: { label: "Expired", badgeClass: "bg-rose-100 text-rose-700" },
    CANCELLED: { label: "Cancelled", badgeClass: "bg-rose-50 text-rose-700" },
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Session Management</h3>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Manage active user sessions. Data comes directly from the campaignsession table.
          </p>
        </div>
      </div>

      {error && <div className="text-sm text-rose-600">{error}</div>}

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border overflow-hidden">
          <div className="border-b px-4 py-3 text-sm font-semibold">Sessions</div>
          <div className="divide-y text-sm">
            {loading ? (
              <div className="px-4 py-3 text-muted-foreground">Loading sessions...</div>
            ) : sessions.length === 0 ? (
              <div className="px-4 py-3 text-muted-foreground">No sessions found.</div>
            ) : (
              sessions.map((session) => {
                const s = session.status as SessionStatus;
                const config = statusStyles[s] ?? statusStyles.ACTIVE;
                return (
                  <button
                    key={session.id}
                    onClick={() => setSelected(session)}
                    className={`w-full px-4 py-3 text-left transition hover:bg-muted ${selected?.id === session.id ? "bg-muted" : ""
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{session.contact_phonenum ?? session.contactid}</div>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${config.badgeClass}`}>
                        {config.label}
                      </span>
                    </div>

                    <div className="text-xs text-muted-foreground">Campaign: {session.campaignname ?? session.campaignid}</div>
                    <div className="text-xs text-muted-foreground">Checkpoint: {session.checkpoint ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">Last active: {session.lastActiveAt ? new Date(session.lastActiveAt).toLocaleString() : "—"}</div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-xl border p-5 space-y-4">
          <div>
            <h4 className="text-base font-semibold">Checkpoint & control</h4>
            <p className="text-sm text-muted-foreground">
              Inspect session details and pause or resume flows.
            </p>
          </div>

          {selected ? (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground">Session ID</div>
                  <div className="font-mono text-xs">{selected.id}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Status</div>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyles[(selected.status ?? "ACTIVE") as SessionStatus].badgeClass}`}>
                    {statusStyles[(selected.status ?? "ACTIVE") as SessionStatus].label}
                  </span>
                </div>
              </div>

              <div><div className="text-xs text-muted-foreground">User</div><div>{selected.contact_phonenum ?? selected.contactid}</div></div>

              <div><div className="text-xs text-muted-foreground">Campaign</div><div>{selected.campaignname ?? selected.campaignid}</div></div>

              <div><div className="text-xs text-muted-foreground">Checkpoint</div><div className="font-mono text-xs">{selected.checkpoint ?? "—"}</div></div>

              <div><div className="text-xs text-muted-foreground">Last activity</div><div>{selected.lastActiveAt ? new Date(selected.lastActiveAt).toLocaleString() : "—"}</div></div>

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  className="rounded-md border px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
                  onClick={() => updateStatus(selected.id as number, "PAUSED")}
                  disabled={actionLoading || (selected.status === "PAUSED" || selected.status === "COMPLETED" || selected.status === "EXPIRED" || selected.status === "CANCELLED")}
                >
                  Pause session
                </button>

                <button
                  className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground shadow-sm disabled:opacity-50"
                  onClick={() => updateStatus(selected.id as number, "ACTIVE")}
                  disabled={actionLoading || (selected.status === "ACTIVE" || selected.status === "COMPLETED" || selected.status === "EXPIRED" || selected.status === "CANCELLED")}
                >
                  Resume session
                </button>

                <button
                  className="rounded-md border px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                  onClick={() => updateStatus(selected.id as number, "CANCELLED")}
                  disabled={actionLoading}
                >
                  Cancel session
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Select a session to inspect details.</p>
          )}
        </div>
      </section>
    </div>
  );
}

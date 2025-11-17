"use client";

import { useState } from "react";

type SessionStatus = "ACTIVE" | "PAUSED" | "COMPLETED" | "EXPIRED";

type SessionRecord = {
  id: string;
  user: string;        // phone number or contact identifier
  campaign: string;    // campaign name (for now; later can be campaignid + name)
  checkpoint: string;  // maps to campaignsession.checkpoint
  lastActive: string;  // ISO string
  status: SessionStatus;
};

const initialSessions: SessionRecord[] = [
  {
    id: "sess-8712",
    user: "+6012-889122",
    campaign: "RAYA 2025",
    checkpoint: "flow.question.3",
    lastActive: "2025-04-11T10:32:00",
    status: "ACTIVE",
  },
  {
    id: "sess-7710",
    user: "+6017-123990",
    campaign: "Loyalty Booster",
    checkpoint: "reward-selection",
    lastActive: "2025-04-10T21:05:00",
    status: "PAUSED",
  },
  {
    id: "sess-6501",
    user: "+6590-221198",
    campaign: "Dormant Reactivation",
    checkpoint: "intro",
    lastActive: "2025-03-28T08:00:00",
    status: "ACTIVE",
  },
];

const statusStyles: Record<
  SessionStatus,
  { label: string; badgeClass: string }
> = {
  ACTIVE: {
    label: "Active",
    badgeClass: "bg-emerald-100 text-emerald-700",
  },
  PAUSED: {
    label: "Paused",
    badgeClass: "bg-amber-100 text-amber-700",
  },
  COMPLETED: {
    label: "Completed",
    badgeClass: "bg-slate-100 text-slate-700",
  },
  EXPIRED: {
    label: "Expired",
    badgeClass: "bg-rose-100 text-rose-700",
  },
};

export default function SessionManagementModule() {
  const [sessions, setSessions] = useState<SessionRecord[]>(initialSessions);
  const [selected, setSelected] = useState<SessionRecord | null>(
    initialSessions[0]
  );

  const updateStatus = (id: string, status: SessionStatus) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status } : s))
    );
    setSelected((prev) => (prev?.id === id ? { ...prev, status } : prev));
  };

  const pauseSession = (id: string) => {
    updateStatus(id, "PAUSED");
  };

  const resumeSession = (id: string) => {
    updateStatus(id, "ACTIVE");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Session Management</h3>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Each record represents a bound session between a WhatsApp contact
            and a campaign. Track checkpoints, inspect status, and pause or
            resume flows when users juggle multiple journeys.
          </p>
        </div>
      </div>

      <section className="grid gap-5 lg:grid-cols-2">
        {/* Left list – sessions */}
        <div className="rounded-xl border overflow-hidden">
          <div className="border-b px-4 py-3 text-sm font-semibold">
            Sessions
          </div>
          <div className="divide-y text-sm">
            {sessions.map((session) => {
              const config = statusStyles[session.status];

              return (
                <button
                  key={session.id}
                  onClick={() => setSelected(session)}
                  className={`w-full px-4 py-3 text-left transition hover:bg-muted ${selected?.id === session.id ? "bg-muted" : ""
                    }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{session.user}</div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${config.badgeClass}`}
                    >
                      {config.label}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Campaign: {session.campaign}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Checkpoint: {session.checkpoint}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Last active:{" "}
                    {new Date(session.lastActive).toLocaleString(undefined, {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right panel – selected session */}
        <div className="rounded-xl border p-5 space-y-4">
          <div>
            <h4 className="text-base font-semibold">Checkpoint & resume flow</h4>
            <p className="text-sm text-muted-foreground">
              Select a session to inspect its metadata and control its runtime
              state. This mirrors the{" "}
              <span className="font-mono text-xs">campaignsession</span> table
              and its <span className="font-mono text-xs">sessionstatus</span>{" "}
              field.
            </p>
          </div>

          {selected ? (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground">
                    Session ID
                  </div>
                  <div className="font-mono text-xs">{selected.id}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">
                    Status
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyles[selected.status].badgeClass
                      }`}
                  >
                    {statusStyles[selected.status].label}
                  </span>
                </div>
              </div>

              <div>
                <div className="text-xs text-muted-foreground">User</div>
                <div>{selected.user}</div>
              </div>

              <div>
                <div className="text-xs text-muted-foreground">Campaign</div>
                <div>{selected.campaign}</div>
              </div>

              <div>
                <div className="text-xs text-muted-foreground">Checkpoint</div>
                <div className="font-mono text-xs">
                  {selected.checkpoint || "—"}
                </div>
              </div>

              <div>
                <div className="text-xs text-muted-foreground">
                  Last activity
                </div>
                <div>
                  {new Date(selected.lastActive).toLocaleString(undefined, {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  className="rounded-md border px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
                  onClick={() => pauseSession(selected.id)}
                  disabled={selected.status === "PAUSED" || selected.status === "COMPLETED" || selected.status === "EXPIRED"}
                >
                  Pause session
                </button>
                <button
                  className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground shadow-sm disabled:opacity-50"
                  onClick={() => resumeSession(selected.id)}
                  disabled={selected.status === "ACTIVE" || selected.status === "COMPLETED" || selected.status === "EXPIRED"}
                >
                  Resume session
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Select a session from the left to inspect details.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

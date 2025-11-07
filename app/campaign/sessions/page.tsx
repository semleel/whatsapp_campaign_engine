"use client";

import { useState } from "react";

type SessionRecord = {
  id: string;
  user: string;
  campaign: string;
  checkpoint: string;
  lastActive: string;
  status: "active" | "paused";
};

const initialSessions: SessionRecord[] = [
  { id: "sess-8712", user: "+6012-889122", campaign: "RAYA 2025", checkpoint: "flow.question.3", lastActive: "2025-04-11T10:32", status: "active" },
  { id: "sess-7710", user: "+6017-123990", campaign: "Loyalty Booster", checkpoint: "reward-selection", lastActive: "2025-04-10T21:05", status: "paused" },
  { id: "sess-6501", user: "+6590-221198", campaign: "Dormant Reactivation", checkpoint: "intro", lastActive: "2025-03-28T08:00", status: "active" },
];

export default function SessionManagementModule() {
  const [sessions, setSessions] = useState(initialSessions);
  const [selected, setSelected] = useState<SessionRecord | null>(initialSessions[0]);

  const resumeSession = (id: string) => {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, status: "active" } : s)));
    setSelected((prev) => (prev?.id === id ? { ...prev, status: "active" } : prev));
  };

  const pauseSession = (id: string) => {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, status: "paused" } : s)));
    setSelected((prev) => (prev?.id === id ? { ...prev, status: "paused" } : prev));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Session Management</h3>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Bind inbound sessions to campaigns, checkpoint user progress, and resume seamlessly even when users juggle multiple journeys.
          </p>
        </div>
      </div>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border overflow-hidden">
          <div className="border-b px-4 py-3 text-sm font-semibold">Active sessions</div>
          <div className="divide-y text-sm">
            {sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => setSelected(session)}
                className={`w-full px-4 py-3 text-left transition hover:bg-muted ${selected?.id === session.id ? "bg-muted" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium">{session.user}</div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      session.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {session.status}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">{session.campaign}</div>
                <div className="text-xs text-muted-foreground">Checkpoint: {session.checkpoint}</div>
                <div className="text-xs text-muted-foreground">Last active: {new Date(session.lastActive).toLocaleString()}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border p-5 space-y-4">
          <div>
            <h4 className="text-base font-semibold">Checkpoint & resume flow</h4>
            <p className="text-sm text-muted-foreground">Select a session to inspect metadata and control its state.</p>
          </div>
          {selected ? (
            <div className="space-y-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Session ID</div>
                <div className="font-mono text-xs">{selected.id}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Campaign</div>
                <div>{selected.campaign}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Checkpoint</div>
                <div className="font-mono text-xs">{selected.checkpoint}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Last activity</div>
                <div>{new Date(selected.lastActive).toLocaleString()}</div>
              </div>
              <div className="flex gap-2">
                <button
                  className="rounded-md border px-3 py-2 text-xs font-medium hover:bg-muted"
                  onClick={() => pauseSession(selected.id)}
                >
                  Pause session
                </button>
                <button
                  className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground shadow-sm"
                  onClick={() => resumeSession(selected.id)}
                >
                  Resume session
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

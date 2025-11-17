"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";

const CONTACTS = [
  {
    contactid: 101,
    name: "Aisyah Rahman",
    phonenum: "+60123456789",
    email: "aisyah@example.com",
    region: "MY",
    sessions: [
      { id: 551, campaign: "Promo Opt-in", status: "ACTIVE", updated: "2025-11-12 10:12" },
      { id: 430, campaign: "Support Escalation", status: "COMPLETE", updated: "2025-11-05 16:47" },
    ],
    transcript: [
      { id: 1, direction: "in", content: "Hi! I want to join the promo." },
      { id: 2, direction: "out", content: "Great! What's your preferred category?" },
    ],
  },
];

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const contact = useMemo(() => CONTACTS.find((c) => String(c.contactid) === id) || CONTACTS[0], [id]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">{contact.name}</h3>
          <p className="text-sm text-muted-foreground">#{contact.contactid}</p>
        </div>
        <a href="/contacts" className="text-sm font-medium text-primary hover:underline">
          Back to contacts
        </a>
      </div>

      <section className="rounded-xl border p-4 space-y-2">
        <div className="grid gap-3 md:grid-cols-3 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Phone</div>
            <div className="font-mono">{contact.phonenum}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Email</div>
            <div>{contact.email || "—"}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Region</div>
            <div>{contact.region}</div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border p-4 space-y-3">
        <h4 className="text-sm font-semibold">Sessions</h4>
        <div className="space-y-2">
          {contact.sessions.map((session) => (
            <div key={session.id} className="rounded-lg border px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-medium">{session.campaign}</div>
                  <div className="text-xs text-muted-foreground">Session #{session.id}</div>
                </div>
                <span className="text-xs text-muted-foreground">{session.updated}</span>
                <span
                  className={`rounded-full px-3 py-1 text-xs ${
                    session.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"
                  }`}
                >
                  {session.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border p-4 space-y-3">
        <h4 className="text-sm font-semibold">Conversation</h4>
        <div className="space-y-3">
          {contact.transcript.map((message) => (
            <div
              key={message.id}
              className={`rounded-xl px-4 py-2 text-sm ${
                message.direction === "in" ? "bg-muted" : "bg-primary text-primary-foreground ml-auto max-w-[80%]"
              }`}
            >
              {message.content}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

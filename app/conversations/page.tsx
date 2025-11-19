"use client";

import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";

type Message = {
  id: string;
  author: "customer" | "agent";
  text: string;
  timestamp: string;
};

type Conversation = {
  id: string;
  contactName: string;
  phone: string;
  status: "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED";
  lastMessage: string;
  updatedAt: string;
  campaign?: string | null;
  messages: Message[];
};

const mockData: Conversation[] = [
  {
    id: "c1",
    contactName: "Alex Lee",
    phone: "+1 202 555 0101",
    status: "ACTIVE",
    lastMessage: "Thanks! Done.",
    updatedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    campaign: "CNY Lucky Draw",
    messages: [
      {
        id: "m1",
        author: "customer",
        text: "Hi, I want to join",
        timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      },
      {
        id: "m2",
        author: "agent",
        text: "Please confirm with YES",
        timestamp: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
      },
      {
        id: "m3",
        author: "customer",
        text: "YES",
        timestamp: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
      },
      {
        id: "m4",
        author: "agent",
        text: "Thanks! Done.",
        timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      },
    ],
  },
  {
    id: "c2",
    contactName: "Maria Gomez",
    phone: "+34 611 22 33 44",
    status: "CANCELLED",
    lastMessage: "Cancelled by user",
    updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    campaign: "Onboarding Flow",
    messages: [
      {
        id: "m5",
        author: "customer",
        text: "Stop please",
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      },
    ],
  },
  {
    id: "c3",
    contactName: "Ravi Kumar",
    phone: "+91 90000 12345",
    status: "COMPLETED",
    lastMessage: "Great, I’m done.",
    updatedAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
    campaign: "Feedback NPS",
    messages: [
      {
        id: "m6",
        author: "customer",
        text: "The product is great!",
        timestamp: new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: "m7",
        author: "agent",
        text: "Thanks for sharing!",
        timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
      },
    ],
  },
];

function statusPill(status: Conversation["status"]) {
  const base = "pill";
  const map: Record<Conversation["status"], string> = {
    ACTIVE: "bg-primary/10 border-primary/30 text-primary",
    PAUSED: "bg-yellow-50 border-yellow-200 text-yellow-700",
    COMPLETED: "bg-emerald-50 border-emerald-200 text-emerald-700",
    CANCELLED: "bg-destructive/10 border-destructive/30 text-destructive",
  };
  return `${base} ${map[status] || ""}`;
}

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>(mockData);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>(mockData[0]?.id ?? "");
  const [showComposer, setShowComposer] = useState(false);
  const [draft, setDraft] = useState("");

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return conversations.filter(
      (c) =>
        c.contactName.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        (c.campaign || "").toLowerCase().includes(q)
    );
  }, [query, conversations]);

  const selected = filtered.find((c) => c.id === selectedId) || filtered[0] || null;

  const handleSend = () => {
    if (!selected || !draft.trim()) return;

    const nextMessage: Message = {
      id: `send-${Date.now()}`,
      author: "agent",
      text: draft.trim(),
      timestamp: new Date().toISOString(),
    };

    setConversations((prev) =>
      prev.map((c) =>
        c.id === selected.id
          ? {
              ...c,
              messages: [...c.messages, nextMessage],
              lastMessage: nextMessage.text,
              updatedAt: nextMessage.timestamp,
            }
          : c
      )
    );

    setDraft("");
    setShowComposer(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Inbox</p>
          <h1 className="text-2xl font-semibold">Conversations</h1>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost">Export</button>
          <button
            className="btn btn-primary"
            onClick={() => {
              setShowComposer(true);
            }}
          >
            Send message to user
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr_320px]">
        {/* Left pane: conversation list */}
        <div className="card p-4 h-[calc(100vh-200px)] overflow-hidden">
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-border bg-secondary px-2">
            <svg width="16" height="16" viewBox="0 0 24 24" className="opacity-70">
              <path
                fill="currentColor"
                d="m21.53 20.47l-3.66-3.66A8.49 8.49 0 0 0 19 11.5A8.5 8.5 0 1 0 10.5 20a8.49 8.49 0 0 0 5.31-1.13l3.66 3.66zM4 11.5A6.5 6.5 0 1 1 10.5 18A6.51 6.51 0 0 1 4 11.5"
              />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search contacts or campaign"
              className="bg-transparent py-2 text-sm outline-none w-full"
            />
          </div>

          <div className="overflow-y-auto h-full pr-1 space-y-2">
            {filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                  selected?.id === c.id ? "border-primary/60 bg-primary/5" : "border-border hover:bg-secondary"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium">{c.contactName}</div>
                    <div className="text-xs text-muted-foreground">{c.phone}</div>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {formatDistanceToNow(new Date(c.updatedAt), { addSuffix: true })}
                  </div>
                </div>
                <div className="mt-2 text-sm text-muted-foreground line-clamp-1">{c.lastMessage}</div>
                <div className="mt-2 flex items-center gap-2">
                  <span className={statusPill(c.status)}>{c.status}</span>
                  {c.campaign ? <span className="pill">{c.campaign}</span> : null}
                </div>
              </button>
            ))}
            {!filtered.length && (
              <div className="text-sm text-muted-foreground text-center py-8">No conversations found.</div>
            )}
          </div>
        </div>

        {/* Middle pane: message thread */}
        <div className="card p-4 h-[calc(100vh-200px)] overflow-hidden flex flex-col">
          {selected ? (
            <>
              <div className="flex items-center justify-between pb-3 border-b">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold">{selected.contactName}</h2>
                    <span className={statusPill(selected.status)}>{selected.status}</span>
                  </div>
                  <div className="text-sm text-muted-foreground">{selected.phone}</div>
                  {selected.campaign ? (
                    <div className="text-xs text-muted-foreground mt-1">Campaign: {selected.campaign}</div>
                  ) : null}
                </div>
                <button className="btn btn-ghost">Assign</button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 py-3 pr-2">
                {selected.messages.map((m) => (
                  <div key={m.id} className={`flex ${m.author === "agent" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[75%] rounded-xl px-3 py-2 shadow-sm ${
                        m.author === "agent"
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-foreground border border-border"
                      }`}
                    >
                      <div className="text-sm">{m.text}</div>
                      <div className="mt-1 text-[11px] opacity-75">
                        {formatDistanceToNow(new Date(m.timestamp), { addSuffix: true })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t">
                {showComposer ? (
                  <>
                    <div className="flex items-center gap-2">
                      <textarea
                        rows={2}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder="Type a reply..."
                        className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                      />
                      <button className="btn btn-primary" onClick={handleSend}>
                        Send
                      </button>
                    </div>
                    <div className="mt-2 flex gap-2 text-xs text-muted-foreground">
                      <span className="pill">WhatsApp</span>
                      <span className="pill">Callbell</span>
                    </div>
                  </>
                ) : (
                  <button
                    className="btn btn-primary"
                    onClick={() => setShowComposer(true)}
                  >
                    Send message to user
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-muted-foreground">Select a conversation</div>
          )}
        </div>

        {/* Right pane: contact details */}
        <div className="card p-4 h-[calc(100vh-200px)] overflow-y-auto">
          {selected ? (
            <div className="space-y-4">
              <div>
                <div className="text-sm text-muted-foreground">Contact</div>
                <div className="text-lg font-semibold">{selected.contactName}</div>
                <div className="text-sm text-muted-foreground">{selected.phone}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Campaign</div>
                <div className="text-base">{selected.campaign || "Not assigned"}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Status</div>
                <div className={statusPill(selected.status)}>{selected.status}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Last activity</div>
                <div className="text-base">
                  {formatDistanceToNow(new Date(selected.updatedAt), { addSuffix: true })}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground mb-2">Notes</div>
                <div className="rounded-lg border border-border bg-secondary p-3 text-sm">
                  Capture quick notes from calls or WhatsApp here. (Connect to your notes API later.)
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground mb-2">Session Actions</div>
                <div className="flex flex-wrap gap-2">
                  <button className="btn btn-primary">Send WhatsApp</button>
                  <button className="btn btn-ghost">Mark Completed</button>
                  <button className="btn btn-ghost">Pause Session</button>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground text-sm">Select a conversation to see details.</div>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Api } from "@/lib/client";
import type {
  ConversationThread,
  ConversationMessage,
  CampaignSession,
} from "@/lib/types";

function statusPill(status: ConversationThread["status"]) {
  const base = "pill";
  const map: Record<ConversationThread["status"], string> = {
    ACTIVE: "bg-primary/10 border-primary/30 text-primary",
    PAUSED: "bg-yellow-50 border-yellow-200 text-yellow-700",
    COMPLETED: "bg-emerald-50 border-emerald-200 text-emerald-700",
    CANCELLED: "bg-destructive/10 border-destructive/30 text-destructive",
    EXPIRED: "bg-slate-200 border-slate-300 text-slate-700",
  };
  return `${base} ${map[status] || ""}`;
}

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<ConversationThread[]>([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showComposer, setShowComposer] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<CampaignSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await Api.listConversations(100);
        setConversations(data);
        setSelectedId(data[0]?.contactId ?? null);
      } catch (e: any) {
        setError(e?.message || "Failed to load conversations");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return conversations.filter(
      (c) =>
        c.contactName.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        (c.campaign || "").toLowerCase().includes(q)
    );
  }, [query, conversations]);

  const selectedThread =
    filtered.find((c) => c.contactId === selectedId) || filtered[0] || null;

  // Auto-scroll to latest message when thread changes or new message arrives
  useEffect(() => {
    if (!messagesRef.current) return;
    messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [selectedThread?.contactId, selectedThread?.messages.length]);

  // Load sessions for selected contact
  useEffect(() => {
    if (!selectedThread?.contactId) {
      setSessions([]);
      return;
    }
    const loadSessions = async () => {
      setSessionsLoading(true);
      setSessionsError(null);
      try {
        const data = await Api.listSessionsByContact(selectedThread.contactId);
        setSessions(data);
      } catch (e: any) {
        setSessionsError(e?.message || "Failed to load sessions");
      } finally {
        setSessionsLoading(false);
      }
    };
    loadSessions();
  }, [selectedThread?.contactId]);

  const handleSend = async () => {
    if (!selectedThread || !draft.trim()) return;

    const nextMessage: ConversationMessage = {
      id: `send-${Date.now()}`,
      author: "agent",
      text: draft.trim(),
      timestamp: new Date().toISOString(),
    };

    setSending(true);
    setSendError(null);
    try {
      // Optimistic update
      setConversations((prev) =>
        prev.map((c) =>
          c.contactId === selectedThread.contactId
            ? {
                ...c,
                messages: [...c.messages, nextMessage],
                lastMessage: nextMessage.text,
                updatedAt: nextMessage.timestamp,
              }
            : c
        )
      );

      await Api.sendConversationMessage(selectedThread.contactId, draft.trim());
      setDraft("");
      setShowComposer(false);
    } catch (e: any) {
      setSendError(e?.message || "Failed to send message");
    } finally {
      setSending(false);
    }
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

      <div
        className={`grid gap-4 ${
          showDetails ? "lg:grid-cols-[320px_1fr_320px]" : "lg:grid-cols-[320px_1fr]"
        }`}
      >
        {/* Left pane: conversation list */}
        <div className="card p-4 h-[calc(100vh-200px)] overflow-hidden">
          {error ? (
            <div className="mb-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          ) : null}
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
            {loading && filtered.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                Loading conversations...
              </div>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.contactId}
                  onClick={() => setSelectedId(c.contactId)}
                  className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                    selectedId === c.contactId
                      ? "border-primary/60 bg-primary/5"
                      : "border-border hover:bg-secondary"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-medium">{c.contactName || "Unknown"}</div>
                      <div className="text-xs text-muted-foreground">{c.phone || "N/A"}</div>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {formatDistanceToNow(new Date(c.updatedAt), { addSuffix: true })}
                    </div>
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground line-clamp-1">
                    {c.lastMessage || "No messages yet."}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className={statusPill(c.status)}>{c.status}</span>
                    {c.campaign ? <span className="pill">{c.campaign}</span> : null}
                  </div>
                </button>
              ))
            )}
            {!filtered.length && !loading && (
              <div className="text-sm text-muted-foreground text-center py-8">
                No conversations found.
              </div>
            )}
          </div>
        </div>

        {/* Middle pane: message thread */}
        <div className="card p-4 h-[calc(100vh-200px)] overflow-hidden flex flex-col">
          {selectedThread ? (
            <>
              <div className="flex items-center justify-between pb-3 border-b">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold">{selectedThread.contactName}</h2>
                    <span className={statusPill(selectedThread.status)}>{selectedThread.status}</span>
                  </div>
                  <div className="text-sm text-muted-foreground">{selectedThread.phone}</div>
                  {selectedThread.campaign ? (
                    <div className="text-xs text-muted-foreground mt-1">
                      Campaign: {selectedThread.campaign}
                    </div>
                  ) : null}
                </div>
                <button
                  className="btn btn-ghost"
                  onClick={() => setShowDetails((prev) => !prev)}
                >
                  {showDetails ? "Hide details" : "Show details"}
                </button>
              </div>

              <div
                ref={messagesRef}
                className="flex-1 overflow-y-auto space-y-3 py-3 pr-2"
              >
                {selectedThread.messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex ${m.author === "agent" ? "justify-end" : "justify-start"}`}
                  >
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
                    <div className="flex items-center gap-2 max-w-2xl">
                      <textarea
                        rows={2}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder="Type a reply..."
                        className="w-full max-w-xl resize-none rounded-lg border border-border bg-secondary px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                      />
                      <button className="btn btn-primary" onClick={handleSend} disabled={sending}>
                        {sending ? "Sending..." : "Send"}
                      </button>
                    </div>
                    {sendError ? (
                      <div className="mt-2 text-xs text-rose-700">{sendError}</div>
                    ) : null}
                    <div className="mt-2 flex gap-2 text-xs text-muted-foreground">
                      <span className="pill">WhatsApp</span>
                      <span className="pill">Callbell</span>
                    </div>
                  </>
                ) : (
                  <button className="btn btn-primary" onClick={() => setShowComposer(true)}>
                    Send message to user
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-muted-foreground">
              Select a conversation
            </div>
          )}
        </div>

        {/* Right pane: contact details */}
        {showDetails && (
          <div className="card p-4 h-[calc(100vh-200px)] overflow-y-auto">
            {selectedThread ? (
              <div className="space-y-4">
                <div>
                  <div className="text-sm text-muted-foreground">Contact</div>
                  <div className="text-lg font-semibold">{selectedThread.contactName}</div>
                  <div className="text-sm text-muted-foreground">{selectedThread.phone}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Last activity</div>
                  <div className="text-base">
                    {formatDistanceToNow(new Date(selectedThread.updatedAt), { addSuffix: true })}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-semibold mb-2">Sessions</div>
                  {sessionsLoading ? (
                    <div className="text-xs text-muted-foreground">Loading sessions...</div>
                  ) : sessionsError ? (
                    <div className="text-xs text-rose-700">{sessionsError}</div>
                  ) : sessions.length ? (
                    <div className="space-y-2">
                      {sessions.map((s) => (
                        <div
                          key={s.id}
                          className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium">
                              {s.campaignname || "Unknown campaign"}
                            </span>
                            <span className="pill">{s.status || "UNKNOWN"}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Last active:{" "}
                            {s.lastActiveAt
                              ? formatDistanceToNow(new Date(s.lastActiveAt), { addSuffix: true })
                              : "N/A"}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">No sessions found.</div>
                  )}
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-2">Notes</div>
                  <div className="rounded-lg border border-border bg-secondary p-3 text-sm">
                    Capture quick notes from calls or WhatsApp here. (Connect to your notes API later.)
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-muted-foreground text-sm">Select a conversation to see details.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

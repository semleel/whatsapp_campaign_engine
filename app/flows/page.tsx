"use client";

import type React from "react";
import { useEffect, useRef, useState } from "react";

type NodeKind = "start" | "trigger" | "action" | "condition" | "end";

type FlowNode = {
  id: string;
  type: NodeKind;
  label: string;
  description: string;
  lane: number;
  order: number;
  x?: number;
  y?: number;
};

const NODE_COLORS: Record<NodeKind, string> = {
  start: "bg-green-700 text-green-50",
  trigger: "bg-cyan-700 text-cyan-50",
  action: "bg-sky-700 text-sky-50",
  condition: "bg-amber-700 text-amber-50",
  end: "bg-slate-700 text-slate-50",
};

const NODE_BADGE: Record<NodeKind, string> = {
  start: "START",
  trigger: "TRIGGER",
  action: "ACTION",
  condition: "CONDITION",
  end: "END",
};

const NODE_WIDTH = 220;
const NODE_HEIGHT = 94;

function makeId() {
  return Math.random().toString(36).slice(2, 9);
}

export default function FlowBuilderPage() {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [nodes, setNodes] = useState<FlowNode[]>([
    {
      id: "start",
      type: "start",
      label: "Start",
      description: "Entry point for this automation.",
      lane: 0,
      order: 0,
      x: 440,
      y: 140,
    },
  ]);
  const [selectedId, setSelectedId] = useState<string>("start");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });

  const selectedNode = nodes.find((n) => n.id === selectedId) || nodes[0];

  const PALETTE = {
    triggers: [
      {
        type: "trigger" as const,
        key: "new_message",
        label: "New message received",
        description: "Start when a new WhatsApp message is received.",
      },
      {
        type: "trigger" as const,
        key: "user_matches",
        label: "User message matches",
        description: "Fire when user text matches certain keywords.",
      },
      {
        type: "trigger" as const,
        key: "new_order",
        label: "New order received",
        description: "Start when a new order event is received.",
      },
    ],
    actions: [
      {
        type: "action" as const,
        key: "send_message",
        label: "Send message",
        description: "Send a WhatsApp message to the user.",
      },
      {
        type: "action" as const,
        key: "send_template",
        label: "Send message template",
        description: "Send an approved message template.",
      },
      {
        type: "action" as const,
        key: "tags",
        label: "Add / remove contact tags",
        description: "Update tags associated with the contact.",
      },
      {
        type: "action" as const,
        key: "lists",
        label: "Add / remove contact lists",
        description: "Subscribe or unsubscribe from lists.",
      },
      {
        type: "action" as const,
        key: "attribute",
        label: "Set contact attribute",
        description: "Update a custom attribute on the contact.",
      },
      {
        type: "action" as const,
        key: "wait",
        label: "Wait for some time",
        description: "Pause before running next step.",
      },
      {
        type: "action" as const,
        key: "api",
        label: "Send API request",
        description: "Call an external API endpoint.",
      },
    ],
    conditionals: [
      {
        type: "condition" as const,
        key: "check_reply",
        label: "Check reply message",
        description: "Branch based on user reply content.",
      },
    ],
    endBot: [
      {
        type: "end" as const,
        key: "end",
        label: "End",
        description: "Stop the automation.",
      },
    ],
  };

  const getCanvasCenter = () => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const width = rect?.width ?? 960;
    const height = rect?.height ?? 720;
    return {
      x: width / 2 - NODE_WIDTH / 2,
      y: height / 2 - NODE_HEIGHT / 2,
    };
  };

  const addNode = (type: NodeKind, label: string, description: string) => {
    const lane = type === "start" ? 0 : 1;
    const laneCount = nodes.filter((n) => n.lane === lane).length;
    const center = getCanvasCenter();
    const last = nodes[nodes.length - 1];

    const newNode: FlowNode = {
      id: makeId(),
      type,
      label,
      description,
      lane,
      order: laneCount,
      x: (last?.x ?? center.x) + 12,
      y: (last?.y ?? center.y) + 120,
    };

    setNodes((prev) => [...prev, newNode]);
    setSelectedId(newNode.id);
  };

  const handleRemoveNode = (id: string) => {
    if (id === "start") return;
    setNodes((prev) => prev.filter((n) => n.id !== id));
    if (selectedId === id) {
      setSelectedId("start");
    }
  };

  const handleSave = () => {
    console.log("Flow definition:", nodes);
    alert("Flow saved in console (check DevTools).");
  };

  const handleDragStart = (e: React.MouseEvent, node: FlowNode) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const currentX = node.x ?? getCanvasCenter().x;
    const currentY = node.y ?? getCanvasCenter().y;

    setDragOffset({
      x: e.clientX - (rect.left + currentX),
      y: e.clientY - (rect.top + currentY),
    });
    setDraggingId(node.id);
  };

  const handleDragMove = (clientX: number, clientY: number) => {
    if (!draggingId || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();

    const minX = 12;
    const minY = 12;
    const maxX = (rect.width ?? NODE_WIDTH) - NODE_WIDTH - 12;
    const maxY = (rect.height ?? NODE_HEIGHT) - NODE_HEIGHT - 12;

    const nextX = Math.min(
      Math.max(clientX - rect.left - dragOffset.x, minX),
      maxX
    );
    const nextY = Math.min(
      Math.max(clientY - rect.top - dragOffset.y, minY),
      maxY
    );

    setNodes((prev) =>
      prev.map((n) =>
        n.id === draggingId
          ? {
              ...n,
              x: nextX,
              y: nextY,
            }
          : n
      )
    );
  };

  const handleDragEnd = () => {
    setDraggingId(null);
  };

  useEffect(() => {
    if (!draggingId) return;

    const onMove = (e: MouseEvent) => handleDragMove(e.clientX, e.clientY);
    const onUp = () => handleDragEnd();

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [draggingId, dragOffset.x, dragOffset.y]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            Automations
          </p>
          <h1 className="text-xl font-semibold">Bots / Flow Builder</h1>
        </div>
        <button
          type="button"
          onClick={handleSave}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90"
        >
          Save
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]">
        <div className="space-y-5 rounded-xl border bg-card p-4">
          <section>
            <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-2">
              Triggers
            </h3>
            <div className="space-y-2">
              {PALETTE.triggers.map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs">💬</span>
                    <span>{item.label}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      addNode(item.type, item.label, item.description)
                    }
                    className="rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted"
                  >
                    Add
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-2">
              Actions
            </h3>
            <div className="space-y-2">
              {PALETTE.actions.map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs">▶</span>
                    <span>{item.label}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      addNode(item.type, item.label, item.description)
                    }
                    className="rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted"
                  >
                    Add
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-2">
              Conditionals
            </h3>
            <div className="space-y-2">
              {PALETTE.conditionals.map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs">⚖</span>
                    <span>{item.label}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      addNode(item.type, item.label, item.description)
                    }
                    className="rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted"
                  >
                    Add
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-2">
              End Bot
            </h3>
            <div className="space-y-2">
              {PALETTE.endBot.map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs">⏹</span>
                    <span>{item.label}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      addNode(item.type, item.label, item.description)
                    }
                    className="rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted"
                  >
                    Add
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-4">
          <section className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Flow canvas</h3>
                <p className="text-xs text-muted-foreground">
                  Click a step to configure it.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <button
                  type="button"
                  className="rounded border px-2 py-1 hover:bg-muted"
                >
                  –
                </button>
                <button
                  type="button"
                  className="rounded border px-2 py-1 hover:bg-muted"
                >
                  +
                </button>
              </div>
            </div>

            <div
              ref={canvasRef}
              className="relative mt-3 h-[760px] w-full overflow-auto rounded-lg border bg-muted/40"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 1px 1px, rgba(0,0,0,0.08) 1px, transparent 0)",
                backgroundSize: "22px 22px",
              }}
              onMouseUp={handleDragEnd}
            >
              {nodes.map((node, idx) => {
                const colorClass = NODE_COLORS[node.type];
                const badge = NODE_BADGE[node.type];
                const fallback = getCanvasCenter();
                const x = node.x ?? fallback.x;
                const y = node.y ?? fallback.y + idx * 110;
                const isSelected = node.id === selectedId;

                return (
                  <div
                    key={node.id}
                    className={`group absolute cursor-pointer rounded-lg border shadow-sm transition ${
                      isSelected
                        ? "ring-2 ring-primary/60 ring-offset-2 ring-offset-background scale-[1.01]"
                        : "hover:shadow-md"
                    }`}
                    style={{
                      width: NODE_WIDTH,
                      top: y,
                      left: x,
                      userSelect: "none",
                    }}
                    onMouseDown={(e) => handleDragStart(e, node)}
                    onClick={() => setSelectedId(node.id)}
                  >
                    <div
                      className={`flex items-center justify-between rounded-t-lg px-3 py-2 text-xs font-semibold ${colorClass}`}
                    >
                      <div>
                        <div className="uppercase tracking-wide text-[11px]">
                          {badge}
                        </div>
                        <div className="mt-0.5 text-sm font-semibold">
                          {node.label}
                        </div>
                      </div>
                      {node.id !== "start" && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveNode(node.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 transition flex items-center gap-1 rounded-full bg-black/15 px-2 py-0.5 text-[11px] hover:bg-black/25"
                          title="Remove node"
                        >
                          × <span>Remove</span>
                        </button>
                      )}
                    </div>
                    <div className="rounded-b-lg bg-white px-3 py-3 text-xs text-muted-foreground">
                      {node.description}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-xl border bg-card p-4">
            <h3 className="text-sm font-semibold">
              Node details:{" "}
              <span className="font-normal">
                {selectedNode?.label || "Start"}
              </span>
            </h3>
            <p className="mt-2 text-xs text-muted-foreground">
              Basic inspector for the selected step. Extend this panel later to
              edit message content, branches, delays, etc.
            </p>

            <label className="mt-4 block text-xs font-medium">
              Description
              <textarea
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                rows={3}
                value={selectedNode?.description || ""}
                onChange={(e) => {
                  const value = e.target.value;
                  setNodes((prev) =>
                    prev.map((n) =>
                      n.id === selectedNode.id
                        ? { ...n, description: value }
                        : n
                    )
                  );
                }}
              />
            </label>
          </section>
        </div>
      </div>
    </div>
  );
}

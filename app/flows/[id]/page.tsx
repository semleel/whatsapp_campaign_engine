"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Api } from "@/lib/client";
import type {
  FlowDefinition,
  FlowUpdatePayload,
  FlowBranchRule,
} from "@/lib/types";
import { usePrivilege } from "@/lib/permissions";

const STEP_TYPES = ["message", "question", "api", "decision"] as const;
type StepType = (typeof STEP_TYPES)[number];

type BranchRule = FlowBranchRule;

type EditableNode = {
  key: string;
  type: string;
  content: string;

  allowedInputs?: string[];
  branches?: BranchRule[];
  fallbackKey?: string | null;

  // local-only helper fields
  tempAllowedInput?: string;
  tempBranchInput?: string;
  tempBranchNext?: string;
};

function simulateNextStep(
  flow: FlowDefinition,
  currentKey: string,
  userInput: string
): string {
  const node = flow.nodes.find((n) => n.key === currentKey);
  if (!node) {
    return `Unknown node "${currentKey}". Please check your keymapping / branchrule configuration.`;
  }

  const normalized = userInput.trim().toUpperCase();

  if (node.allowedInputs && node.allowedInputs.length > 0) {
    const isAllowed = node.allowedInputs.some(
      (v) => v.toUpperCase() === normalized
    );

    if (!isAllowed) {
      return node.fallback
        ? `Invalid input "${userInput}". Fallback ➜ ${node.fallback}`
        : `Invalid input "${userInput}". No fallback configured for ${currentKey}.`;
    }

    const match = (node.branches || []).find(
      (b: BranchRule) => b.input.toUpperCase() === normalized
    );
    if (match) {
      return `Valid input "${userInput}". Next step ➜ ${match.next}`;
    }

    return node.fallback
      ? `Input allowed but no branch found. Fallback ➜ ${node.fallback}`
      : `Input allowed but no branchrule configured for ${currentKey}.`;
  }

  return `This node has no input validation configured (no allowedinput rows). Usually it's a pure message node.`;
}

export default function FlowDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { canView, canUpdate, loading: privLoading } = usePrivilege("flows");

  // flow meta (name / entry / fallback)
  const [meta, setMeta] = useState({
    name: "",
    entryKey: "",
    fallbackKey: "",
  });

  // editable nodes
  const [steps, setSteps] = useState<EditableNode[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string>("");

  // simulator state
  const [simNodeKey, setSimNodeKey] = useState<string>("");
  const [simInput, setSimInput] = useState<string>("YES");
  const [simResult, setSimResult] = useState<string>("");

  // we reuse FlowDefinition shape when simulating
  const [loadedFlowId, setLoadedFlowId] = useState<number | string | null>(
    null
  );

  // Load existing flow from backend
  useEffect(() => {
    if (!id) return;
    if (privLoading) return;
    if (!canView) {
      setError("You do not have permission to view flows.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setSaveMessage("");

    Api.getFlowDefinition(id)
      .then((data) => {
        setLoadedFlowId(data.id);
        setMeta({
          name: data.name,
          entryKey: data.entryKey,
          fallbackKey: data.fallbackKey,
        });

        const editableNodes: EditableNode[] = data.nodes.map((n) => ({
          key: n.key,
          type: n.type || "message",
          content: n.description || "",
          allowedInputs: n.allowedInputs || [],
          branches: n.branches || [],
          fallbackKey: n.fallback ?? null,
        }));

        setSteps(editableNodes);
        setSimNodeKey(data.nodes[0]?.key ?? data.entryKey ?? "");
      })
      .catch((err) => {
        console.error(err);
        setError(
          err instanceof Error ? err.message : "Failed to load flow definition."
        );
      })
      .finally(() => setLoading(false));
  }, [id, canView, privLoading]);

  // Helpers for labels / tooltips
  const getNodeLabel = (type: StepType | string) => {
    switch (type) {
      case "message":
        return "Message copy (what user sees)";
      case "question":
        return "Question text (what you ask the user)";
      case "api":
        return "API call purpose / notes (admin-only, for integration)";
      case "decision":
        return "Decision logic (how to branch based on user input or API result)";
      default:
        return "Node description";
    }
  };

  const getNodeHelp = (type: StepType | string) => {
    switch (type) {
      case "message":
        return "Example: Welcome text, confirmation message, info message, etc.";
      case "question":
        return "Example: Ask YES/NO or 1/2/3 type questions. Validation + options will be configured via allowedinput / branchrule.";
      case "api":
        return "Example: Describe which API to call and why. Detailed endpoint config is managed in Integration > Endpoints & Mappings.";
      case "decision":
        return "Example: Describe branching logic (if balance < 0 -> send OVERDUE node, else -> OK node). Actual rules will be set up via branchrule.";
      default:
        return "";
    }
  };

  // Validation before saving
  const validate = () => {
    const errs: string[] = [];

    if (!meta.name.trim()) {
      errs.push("Flow name is required.");
    }

    const keys = steps.map((s) => s.key.trim());
    if (keys.some((k) => !k)) {
      errs.push("Every node must have a CONTENT_KEY.");
    }

    const lowerKeys = keys.map((k) => k.toLowerCase());
    const duplicates = lowerKeys.filter(
      (k, idx) => lowerKeys.indexOf(k) !== idx
    );
    if (duplicates.length > 0) {
      errs.push(
        `Duplicate node keys found: ${Array.from(new Set(duplicates)).join(
          ", "
        )}. CONTENT_KEY must be unique per flow.`
      );
    }

    const entryExists = lowerKeys.includes(meta.entryKey.trim().toLowerCase());
    const fallbackExists = lowerKeys.includes(
      meta.fallbackKey.trim().toLowerCase()
    );

    if (!entryExists) {
      errs.push(
        `Entry content key "${meta.entryKey}" must match one of the node CONTENT_KEY values.`
      );
    }
    if (!fallbackExists) {
      errs.push(
        `Fallback content key "${meta.fallbackKey}" must match one of the node CONTENT_KEY values.`
      );
    }

    setError(errs.length ? errs.join(" ") : null);
    return errs.length === 0;
  };

  const handleAddNode = () => {
    setSteps((prev) => [
      ...prev,
      { key: "", type: "message", content: "" } as EditableNode,
    ]);
  };

  const handleRemoveNode = (index: number) => {
    setSteps((prev) => {
      if (prev.length === 1) return prev;
      const next = [...prev];
      next.splice(index, 1);
      return next;
    });
  };

  const handleSave = async () => {
    if (!canUpdate) {
      setError("You do not have permission to update flows.");
      return;
    }
    if (!id) return;

    setSaveMessage("");
    setError(null);

    if (!validate()) return;

    setSaving(true);
    try {
      const payload: FlowUpdatePayload = {
        userflowname: meta.name,
        entryKey: meta.entryKey,
        fallbackKey: meta.fallbackKey,
        description: null, // keep simple for now
        nodes: steps.map((s) => ({
          key: s.key.trim(),
          type: s.type,
          content: s.content,
          allowedInputs: (s.allowedInputs || [])
            .map((v) => v.trim())
            .filter(Boolean),
          branches: (s.branches || [])
            .map((br) => ({
              input: br.input.trim(),
              next: br.next.trim(),
            }))
            .filter((br) => br.input && br.next),
          fallbackKey: s.fallbackKey ? s.fallbackKey.trim() : null,
        })),
      };

      await Api.updateFlowDefinition(id, payload);
      setSaveMessage("Flow updated successfully.");
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to update flow. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSimulate = () => {
    if (!loadedFlowId) return;

    // simulate based on current UI state (not necessarily saved yet)
    const virtualFlow: FlowDefinition = {
      id: loadedFlowId,
      name: meta.name,
      entryKey: meta.entryKey,
      fallbackKey: meta.fallbackKey,
      nodes: steps.map((s) => ({
        key: s.key,
        type: s.type,
        description: s.content,
        allowedInputs: s.allowedInputs || [],
        branches: s.branches || [],
        fallback: s.fallbackKey ?? null,
      })),
    };

    const result = simulateNextStep(virtualFlow, simNodeKey, simInput);
    setSimResult(result);
  };

  if (!privLoading && !canView) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-amber-700 border border-amber-200 bg-amber-50 rounded-lg px-3 py-2">
          You do not have permission to view flows.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Loading flow…</p>
      </div>
    );
  }

  if (!id || steps.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-red-600">
          {error || `Flow definition not found for id ${String(id)}.`}
        </p>
        <Link
          href="/flows"
          className="text-sm font-medium text-primary hover:underline"
        >
          Back to list
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Edit flow</h3>
          <p className="text-sm text-muted-foreground">
            Edit this <code>userflow</code>. Each node maps to{" "}
            <code>keymapping.contentkeyid</code>, with optional{" "}
            <code>allowedinput</code>, <code>branchrule</code>, and{" "}
            <code>fallback</code> rules controlling how WhatsApp replies are
            handled.
          </p>
        </div>
        <Link
          href="/flows"
          className="text-sm font-medium text-primary hover:underline"
        >
          Back to list
        </Link>
      </div>

      {/* Flow meta */}
      <section className="rounded-xl border p-4 space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm font-medium">
            <span>Name (userflowname)</span>
            <input
              className="w-full rounded-md border px-3 py-2"
              value={meta.name}
              onChange={(e) =>
                setMeta((prev) => ({ ...prev, name: e.target.value }))
              }
            />
          </label>
          <label className="space-y-1 text-sm font-medium">
            <span>Entry content key</span>
            <input
              className="w-full rounded-md border px-3 py-2 font-mono text-xs"
              value={meta.entryKey}
              onChange={(e) => {
                const newVal = e.target.value;
                const oldVal = meta.entryKey;
                setMeta((prev) => ({ ...prev, entryKey: newVal }));
                setSteps((prev) =>
                  prev.map((node) =>
                    node.key === oldVal ? { ...node, key: newVal } : node
                  )
                );
              }}
            />
            <p className="text-[11px] text-muted-foreground">
              Must match one of the node <code>CONTENT_KEY</code> values below.
              This is where a new session will start.
            </p>
          </label>
          <label className="space-y-1 text-sm font-medium">
            <span>Fallback content key</span>
            <input
              className="w-full rounded-md border px-3 py-2 font-mono text-xs"
              value={meta.fallbackKey}
              onChange={(e) => {
                const newVal = e.target.value;
                const oldVal = meta.fallbackKey;
                setMeta((prev) => ({ ...prev, fallbackKey: newVal }));
                setSteps((prev) =>
                  prev.map((node) =>
                    node.key === oldVal ? { ...node, key: newVal } : node
                  )
                );
              }}
            />
            <p className="text-[11px] text-muted-foreground">
              Also must match a node <code>CONTENT_KEY</code>. This will link to{" "}
              <code>fallback</code> rules for invalid inputs.
            </p>
          </label>
        </div>
      </section>

      {/* Nodes (editable) */}
      <section className="rounded-xl border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Nodes</p>
          <button
            type="button"
            className="rounded border px-3 py-1 text-sm"
            onClick={handleAddNode}
          >
            Add node
          </button>
        </div>

        <div className="space-y-3">
          {steps.map((step, index) => (
            <div key={index} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-start gap-2">
                <div className="grid flex-1 gap-3 md:grid-cols-2">
                  <input
                    className="rounded-md border px-3 py-2 font-mono text-xs"
                    placeholder="CONTENT_KEY (e.g. START_MENU)"
                    value={step.key}
                    onChange={(e) => {
                      const newKey = e.target.value;
                      setSteps((prev) => {
                        const next = [...prev];
                        const oldKey = next[index].key;
                        next[index] = { ...next[index], key: newKey };

                        if (oldKey !== newKey) {
                          setMeta((prevMeta) => ({
                            ...prevMeta,
                            entryKey:
                              prevMeta.entryKey === oldKey
                                ? newKey
                                : prevMeta.entryKey,
                            fallbackKey:
                              prevMeta.fallbackKey === oldKey
                                ? newKey
                                : prevMeta.fallbackKey,
                          }));
                        }

                        return next;
                      });
                    }}
                  />
                  <select
                    className="rounded-md border px-3 py-2"
                    value={step.type}
                    onChange={(e) =>
                      setSteps((prev) => {
                        const next = [...prev];
                        next[index] = {
                          ...next[index],
                          type: e.target.value,
                        };
                        return next;
                      })
                    }
                  >
                    {STEP_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => handleRemoveNode(index)}
                  disabled={steps.length === 1}
                  className="ml-1 text-xs text-rose-600 hover:text-rose-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  title={
                    steps.length === 1
                      ? "You must have at least one node"
                      : "Remove this node"
                  }
                >
                  ✕
                </button>
              </div>

              {/* Description / content */}
              <div className="space-y-1">
                <label className="space-y-1 text-xs font-medium">
                  <span>{getNodeLabel(step.type)}</span>
                  <textarea
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    placeholder={getNodeHelp(step.type) || "Describe this node..."}
                    value={step.content}
                    onChange={(e) =>
                      setSteps((prev) => {
                        const next = [...prev];
                        next[index] = {
                          ...next[index],
                          content: e.target.value,
                        };
                        return next;
                      })
                    }
                  />
                </label>
                {getNodeHelp(step.type) && (
                  <p className="text-[11px] text-muted-foreground">
                    {getNodeHelp(step.type)}
                  </p>
                )}
              </div>

              {/* Allowed inputs */}
              <div className="mt-2 space-y-1">
                <p className="text-[11px] font-semibold text-muted-foreground">
                  Allowed inputs (optional)
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    className="w-32 rounded-md border px-2 py-1 text-xs"
                    placeholder="e.g. YES"
                    value={step.tempAllowedInput ?? ""}
                    onChange={(e) =>
                      setSteps((prev) => {
                        const next = [...prev];
                        next[index] = {
                          ...next[index],
                          tempAllowedInput: e.target.value,
                        };
                        return next;
                      })
                    }
                  />
                  <button
                    type="button"
                    className="rounded-md border px-2 py-1 text-[11px]"
                    onClick={() =>
                      setSteps((prev) => {
                        const next = [...prev];
                        const node = next[index];
                        const raw = (node.tempAllowedInput || "").trim();
                        if (!raw) return prev;
                        const value = raw.toUpperCase();
                        const existing = node.allowedInputs ?? [];
                        if (
                          existing.some((v) => v.toUpperCase() === value)
                        ) {
                          return prev;
                        }
                        next[index] = {
                          ...node,
                          allowedInputs: [value, ...existing],
                          tempAllowedInput: "",
                        };
                        return next;
                      })
                    }
                  >
                    Add input
                  </button>
                </div>
                {step.allowedInputs && step.allowedInputs.length > 0 && (
                  <div className="flex flex-wrap gap-2 text-xs">
                    {step.allowedInputs.map((val) => (
                      <span
                        key={val}
                        className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 font-mono text-[11px]"
                      >
                        {val}
                        <button
                          type="button"
                          onClick={() =>
                            setSteps((prev) => {
                              const next = [...prev];
                              next[index] = {
                                ...next[index],
                                allowedInputs: (
                                  next[index].allowedInputs || []
                                ).filter((v) => v !== val),
                              };
                              return next;
                            })
                          }
                          className="text-[11px] text-rose-600 hover:text-rose-700"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                  These map to <code>allowedinput.allowedvalue</code> for this node.
                </p>
              </div>

              {/* Branch rules */}
              <div className="mt-3 space-y-1">
                <p className="text-[11px] font-semibold text-muted-foreground">
                  Branch rules (optional)
                </p>
                <div className="grid gap-2 md:grid-cols-[minmax(0,1fr),minmax(0,1fr),auto]">
                  <input
                    className="rounded-md border px-2 py-1 text-xs"
                    placeholder="Input (e.g. YES, 1)"
                    value={step.tempBranchInput ?? ""}
                    onChange={(e) =>
                      setSteps((prev) => {
                        const next = [...prev];
                        next[index] = {
                          ...next[index],
                          tempBranchInput: e.target.value,
                        };
                        return next;
                      })
                    }
                  />
                  <input
                    className="rounded-md border px-2 py-1 text-xs"
                    placeholder="Next CONTENT_KEY"
                    value={step.tempBranchNext ?? ""}
                    onChange={(e) =>
                      setSteps((prev) => {
                        const next = [...prev];
                        next[index] = {
                          ...next[index],
                          tempBranchNext: e.target.value,
                        };
                        return next;
                      })
                    }
                  />
                  <button
                    type="button"
                    className="rounded-md border px-2 py-1 text-[11px]"
                    onClick={() =>
                      setSteps((prev) => {
                        const next = [...prev];
                        const node = next[index];
                        const rawInput = (node.tempBranchInput || "").trim();
                        const rawNext = (node.tempBranchNext || "").trim();
                        if (!rawInput || !rawNext) return prev;

                        const branches = node.branches || [];
                        next[index] = {
                          ...node,
                          branches: [
                            ...branches,
                            { input: rawInput, next: rawNext },
                          ],
                          tempBranchInput: "",
                          tempBranchNext: "",
                        };
                        return next;
                      })
                    }
                  >
                    Add rule
                  </button>
                </div>

                {step.branches && step.branches.length > 0 && (
                  <div className="overflow-x-auto rounded-lg border mt-2">
                    <table className="w-full text-[11px]">
                      <thead className="bg-muted/40">
                        <tr>
                          <th className="px-2 py-1 text-left font-medium">
                            Input
                          </th>
                          <th className="px-2 py-1 text-left font-medium">
                            Next CONTENT_KEY
                          </th>
                          <th className="px-2 py-1"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {step.branches.map((br, idx) => (
                          <tr
                            key={`${step.key}-${br.input}-${idx}`}
                            className="border-t"
                          >
                            <td className="px-2 py-1 font-mono">{br.input}</td>
                            <td className="px-2 py-1 font-mono">{br.next}</td>
                            <td className="px-2 py-1 text-right">
                              <button
                                type="button"
                                className="text-[11px] text-rose-600 hover:text-rose-700"
                                onClick={() =>
                                  setSteps((prev) => {
                                    const next = [...prev];
                                    next[index] = {
                                      ...next[index],
                                      branches: (
                                        next[index].branches || []
                                      ).filter((_b, i) => i !== idx),
                                    };
                                    return next;
                                  })
                                }
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Node-level fallback */}
                <div className="mt-3 space-y-1">
                  <p className="text-[11px] font-semibold text-muted-foreground">
                    Node fallback (optional)
                  </p>
                  <select
                    className="w-full max-w-xs rounded-md border px-2 py-1 text-xs font-mono"
                    value={step.fallbackKey ?? ""}
                    onChange={(e) =>
                      setSteps((prev) => {
                        const next = [...prev];
                        next[index] = {
                          ...next[index],
                          fallbackKey: e.target.value || null,
                        };
                        return next;
                      })
                    }
                  >
                    <option value="">No node-level fallback</option>
                    {steps.map((n) => (
                      <option key={n.key} value={n.key}>
                        {n.key}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-muted-foreground">
                    This maps to a <code>fallback</code> row with{" "}
                    <code>scope = "NODE"</code>.
                  </p>
                </div>

                <p className="text-[11px] text-muted-foreground">
                  Branch rules map to <code>branchrule.inputvalue</code> and{" "}
                  <code>branchrule.nextkey</code> for this node.
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Save + errors */}
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          {error && (
            <p className="text-xs text-red-600">
              {error}
            </p>
          )}
          {saveMessage && !error && (
            <p className="text-xs text-emerald-700">{saveMessage}</p>
          )}
        </div>
        {canUpdate ? (
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        ) : (
          <span className="text-xs text-muted-foreground">View only</span>
        )}
      </div>

      {/* Global simulator (based on current UI state) */}
      <section className="rounded-xl border p-4 space-y-4">
        <div>
          <h4 className="text-base font-semibold">Simulate reply</h4>
          <p className="text-sm text-muted-foreground">
            This emulates what your engine will do with{" "}
            <code>allowedinput</code>, <code>branchrule</code>, and{" "}
            <code>fallback</code> using the current settings (even before you
            save).
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm font-medium">
            <span>Node (CONTENT_KEY)</span>
            <select
              className="w-full rounded-md border px-3 py-2 text-sm font-mono"
              value={simNodeKey}
              onChange={(e) => setSimNodeKey(e.target.value)}
            >
              {steps.map((node) => (
                <option key={node.key} value={node.key}>
                  {node.key}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium">
            <span>User reply</span>
            <input
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Type YES / NO / 1 / anything"
              value={simInput}
              onChange={(e) => setSimInput(e.target.value)}
            />
          </label>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSimulate}
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90"
          >
            Run simulation
          </button>
        </div>

        <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          <div className="text-xs text-muted-foreground uppercase">Result</div>
          <div>{simResult || "No simulation run yet."}</div>
        </div>
      </section>
    </div>
  );
}

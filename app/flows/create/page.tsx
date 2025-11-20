"use client";

import { useState } from "react";
import { Api } from "@/lib/client";
import type { FlowNodePayload, FlowCreatePayload } from "@/lib/types";

const STEP_TYPES = ["message", "question", "api", "decision"] as const;
type StepType = (typeof STEP_TYPES)[number];

type BranchRule = {
  input: string;
  next: string;
};

type FlowNode = FlowNodePayload & {
  allowedInputs?: string[];
  branches?: BranchRule[];
  fallbackKey?: string | null;

  // local-only drafts for UI
  tempAllowedInput?: string;
  tempBranchInput?: string;
  tempBranchNext?: string;
};

export default function FlowCreatePage() {
  const [form, setForm] = useState({
    userflowname: "",
    entryKey: "START",
    fallbackKey: "FALLBACK",
    description: "",
  });

  const [steps, setSteps] = useState<FlowNode[]>([
    { key: "START", type: "message", content: "" },
    { key: "FALLBACK", type: "message", content: "" },
  ]);

  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

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
        return "Example: Ask YES/NO or 1/2/3 type questions. Validation + options will be configured later with allowedinput / branchrule.";
      case "api":
        return "Example: Describe which API to call and why. Detailed endpoint config is managed in Integration > Endpoints & Mappings.";
      case "decision":
        return "Example: Describe branching logic (if balance < 0 -> send OVERDUE node, else -> OK node). Actual rules will be set up via branchrule.";
      default:
        return "";
    }
  };

  const validate = () => {
    const newErrors: string[] = [];

    if (!form.userflowname.trim()) {
      newErrors.push("Flow name is required.");
    }

    // All keys non-empty
    const keys = steps.map((s) => s.key.trim());
    if (keys.some((k) => !k)) {
      newErrors.push("Every node must have a CONTENT_KEY.");
    }

    // No duplicate keys
    const lowerKeys = keys.map((k) => k.toLowerCase());
    const duplicates = lowerKeys.filter(
      (k, idx) => lowerKeys.indexOf(k) !== idx
    );
    if (duplicates.length > 0) {
      newErrors.push(
        `Duplicate node keys found: ${Array.from(new Set(duplicates)).join(
          ", "
        )}. CONTENT_KEY must be unique per flow.`
      );
    }

    // entryKey & fallbackKey must exist in steps
    const entryExists = lowerKeys.includes(form.entryKey.trim().toLowerCase());
    const fallbackExists = lowerKeys.includes(
      form.fallbackKey.trim().toLowerCase()
    );

    if (!entryExists) {
      newErrors.push(
        `Entry content key "${form.entryKey}" must match one of the node CONTENT_KEY values.`
      );
    }
    if (!fallbackExists) {
      newErrors.push(
        `Fallback content key "${form.fallbackKey}" must match one of the node CONTENT_KEY values.`
      );
    }

    setErrors(newErrors);
    return newErrors.length === 0;
  };

  const handleAddNode = () => {
    setSteps((prev) => [...prev, { key: "", type: "message", content: "" }]);
  };

  const handleRemoveNode = (index: number) => {
    setSteps((prev) => {
      if (prev.length === 1) {
        // don't allow 0 nodes
        return prev;
      }
      const next = [...prev];
      next.splice(index, 1);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    setErrors([]);

    if (!validate()) return;

    setSubmitting(true);

    try {
      const payload: FlowCreatePayload = {
        userflowname: form.userflowname,
        entryKey: form.entryKey,
        fallbackKey: form.fallbackKey,
        description: form.description || null,
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

      const { userflow } = await Api.createFlowDefinition(payload);

      setMessage(
        `Flow "${userflow.userflowname}" created with ${steps.length} nodes.\n\n` +
        `What is stored in DB now:\n` +
        `• userflow.userflowid = ${userflow.userflowid}\n` +
        `• userflow.userflowname = "${userflow.userflowname}"\n\n` +
        `Next steps (in Flow Detail / builder):\n` +
        `• Map each CONTENT_KEY to content (tables: content + keymapping).\n` +
        `• Configure input validation (allowedinput), branching (branchrule), and fallbacks (fallback).\n` +
        `Entry key: ${form.entryKey}\nFallback key: ${form.fallbackKey}\n` +
        `Nodes: ${steps.map((n) => n.key).join(", ")}`
      );

      // Reset form
      setForm({
        userflowname: "",
        entryKey: "START",
        fallbackKey: "FALLBACK",
        description: "",
      });
      setSteps([
        { key: "START", type: "message", content: "" },
        { key: "FALLBACK", type: "message", content: "" },
      ]);
    } catch (err) {
      console.error(err);
      setErrors([
        err instanceof Error
          ? err.message
          : "Failed to create flow. Please try again.",
      ]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Create flow</h3>
          <p className="text-sm text-muted-foreground">
            This defines a reusable <code>userflow</code>. Each node will later
            map to <code>keymapping</code>, <code>allowedinput</code>,{" "}
            <code>branchrule</code>, and <code>fallback</code>.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Flow meta */}
        <section className="rounded-xl border p-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm font-medium">
              <span>Name (userflowname)</span>
              <input
                className="w-full rounded-md border px-3 py-2"
                value={form.userflowname}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    userflowname: e.target.value,
                  }))
                }
                required
              />
            </label>
            <label className="space-y-1 text-sm font-medium">
              <span>Entry content key</span>
              <input
                className="w-full rounded-md border px-3 py-2 font-mono text-xs"
                value={form.entryKey}
                onChange={(e) => {
                  const newVal = e.target.value;
                  const oldVal = form.entryKey;
                  setForm((prev) => ({ ...prev, entryKey: newVal }));
                  // keep node key in sync
                  setSteps((prev) =>
                    prev.map((node) =>
                      node.key === oldVal ? { ...node, key: newVal } : node
                    )
                  );
                }}
                placeholder="START"
                required
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
                value={form.fallbackKey}
                onChange={(e) => {
                  const newVal = e.target.value;
                  const oldVal = form.fallbackKey;
                  setForm((prev) => ({ ...prev, fallbackKey: newVal }));
                  // keep node key in sync
                  setSteps((prev) =>
                    prev.map((node) =>
                      node.key === oldVal ? { ...node, key: newVal } : node
                    )
                  );
                }}
                placeholder="FALLBACK"
                required
              />
              <p className="text-[11px] text-muted-foreground">
                Also must match a node <code>CONTENT_KEY</code>. This will link
                to <code>fallback</code> rules for invalid inputs.
              </p>
            </label>
            <label className="space-y-1 text-sm font-medium md:col-span-2">
              <span>Description (for admins)</span>
              <textarea
                className="w-full rounded-md border px-3 py-2"
                value={form.description}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                placeholder="e.g. Main onboarding flow for loyalty campaigns."
              />
            </label>
          </div>
        </section>

        {/* Nodes */}
        <section className="rounded-xl border p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Nodes (conceptual)</p>
            <button
              type="button"
              className="rounded border px-3 py-1 text-sm"
              onClick={handleAddNode}
            >
              Add node
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Each node will later become a row in <code>content</code> +{" "}
            <code>keymapping</code>. Input validation and branching (YES/NO,
            1/2/3) will be configured in the Flow Detail screen using{" "}
            <code>allowedinput</code>, <code>branchrule</code>, and{" "}
            <code>fallback</code>.
          </p>

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
                            // If this node was the entry/fallback, keep those in sync
                            setForm((prevForm) => ({
                              ...prevForm,
                              entryKey:
                                prevForm.entryKey === oldKey ? newKey : prevForm.entryKey,
                              fallbackKey:
                                prevForm.fallbackKey === oldKey ? newKey : prevForm.fallbackKey,
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

                  {/* Remove node button */}
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

                <div className="space-y-1">
                  <label className="space-y-1 text-xs font-medium">
                    <span>{getNodeLabel(step.type)}</span>
                    <textarea
                      className="w-full rounded-md border px-3 py-2 text-sm"
                      placeholder={
                        getNodeHelp(step.type) || "Describe this node..."
                      }
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

                {/* Allowed inputs (YES / NO / 1 / 2) */}
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
                          if (existing.some((v) => v.toUpperCase() === value)) {
                            return prev; // skip duplicates
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
                                  allowedInputs: (next[index].allowedInputs || []).filter(
                                    (v) => v !== val
                                  ),
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

                {/* Branching rules */}
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
                            <th className="px-2 py-1 text-left font-medium">Input</th>
                            <th className="px-2 py-1 text-left font-medium">
                              Next CONTENT_KEY
                            </th>
                            <th className="px-2 py-1"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {step.branches.map((br, idx) => (
                            <tr key={`${step.key}-${br.input}-${idx}`} className="border-t">
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
                                        branches: (next[index].branches || []).filter(
                                          (_b, i) => i !== idx
                                        ),
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
                      This maps to a <code>fallback</code> row with <code>scope = "NODE"</code>.
                    </p>
                  </div>

                  <p className="text-[11px] text-muted-foreground">
                    These map to <code>branchrule.inputvalue</code> and{" "}
                    <code>branchrule.nextkey</code> for this node.
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {errors.length > 0 && (
          <div className="rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-700 space-y-1">
            {errors.map((err, i) => (
              <p key={i}>• {err}</p>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <a href="/flows" className="rounded-md border px-4 py-2 text-sm">
            Cancel
          </a>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {submitting ? "Saving..." : "Save flow (draft)"}
          </button>
        </div>
      </form>

      {message && (
        <pre className="mt-2 whitespace-pre-wrap text-xs text-emerald-700">
          {message}
        </pre>
      )}
    </div>
  );
}

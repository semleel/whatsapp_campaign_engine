"use client";

import { useState } from "react";

type BranchNode = {
  id: string;
  question: string;
  yesKey: string;
  noKey: string;
  description: string;
};

const initialNodes: BranchNode[] = [
  {
    id: "daily_tips",
    question: "Do you want to receive daily tips?",
    yesKey: "daily_tips_yes",
    noKey: "daily_tips_no",
    description: "Simple opt-in for recurring nudges.",
  },
  {
    id: "loyalty_optin",
    question: "Join the loyalty program?",
    yesKey: "loyalty_yes",
    noKey: "loyalty_no",
    description: "Routes to backend if YES, stays static if NO.",
  },
];

export default function BranchingLogicPage() {
  const [nodes, setNodes] = useState(initialNodes);
  const [draft, setDraft] = useState<BranchNode>({
    id: "",
    question: "",
    yesKey: "",
    noKey: "",
    description: "",
  });

  const addNode = () => {
    if (!draft.id || !draft.question || !draft.yesKey || !draft.noKey) return;
    setNodes((prev) => [...prev.filter((n) => n.id !== draft.id), draft]);
    setDraft({ id: "", question: "", yesKey: "", noKey: "", description: "" });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Branching Logic Processor</h3>
          <p className="text-sm text-muted-foreground">
            Configure Yes/No paths without code. Each path hands the next content key back to the Campaign Engine.
          </p>
        </div>
      </div>

      <section className="rounded-xl border p-5 space-y-4">
        <div>
          <h4 className="text-base font-semibold">Define branching node</h4>
          <p className="text-sm text-muted-foreground">
            Provide a human-friendly question plus the content key to emit when the user replies YES or NO.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm font-medium">
            <span>Node ID</span>
            <input
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="e.g. voucher_followup"
              value={draft.id}
              onChange={(e) => setDraft({ ...draft, id: e.target.value })}
            />
          </label>
          <label className="space-y-1 text-sm font-medium">
            <span>Description</span>
            <input
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="What this branch controls"
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </label>
        </div>
        <textarea
          className="w-full rounded-md border px-3 py-2 text-sm"
          placeholder="Question presented to the user"
          value={draft.question}
          onChange={(e) => setDraft({ ...draft, question: e.target.value })}
        />
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm font-medium">
            <span>YES content key</span>
            <input
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="e.g. voucher_yes_flow"
              value={draft.yesKey}
              onChange={(e) => setDraft({ ...draft, yesKey: e.target.value })}
            />
          </label>
          <label className="space-y-1 text-sm font-medium">
            <span>NO content key</span>
            <input
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="e.g. voucher_no_flow"
              value={draft.noKey}
              onChange={(e) => setDraft({ ...draft, noKey: e.target.value })}
            />
          </label>
        </div>

        <div className="flex justify-end">
          <button
            onClick={addNode}
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90"
          >
            Save branch
          </button>
        </div>
      </section>

      <section className="rounded-xl border p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-base font-semibold">Configured branches</h4>
            <p className="text-sm text-muted-foreground">
              These entries feed into the mapping layer so multiple campaigns can reuse them.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Node</th>
                <th className="px-3 py-2 text-left font-medium">Question</th>
                <th className="px-3 py-2 text-left font-medium">YES → key</th>
                <th className="px-3 py-2 text-left font-medium">NO → key</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((node) => (
                <tr key={node.id} className="border-t">
                  <td className="px-3 py-2">
                    <div className="font-medium">{node.id}</div>
                    <div className="text-xs text-muted-foreground">{node.description || "—"}</div>
                  </td>
                  <td className="px-3 py-2">{node.question}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{node.yesKey}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{node.noKey}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

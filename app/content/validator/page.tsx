"use client";

import { useMemo, useState } from "react";

type ValidatorRule = {
  id: string;
  prompt: string;
  yes: string;
  no: string;
  fallback: string;
};

const seedRules: ValidatorRule[] = [
  {
    id: "voucher",
    prompt: "Would you like to claim a voucher?",
    yes: "Great! Here is your code: SAVE10",
    no: "No worries! Check out other deals instead.",
    fallback: "Please respond with YES or NO to continue.",
  },
  {
    id: "daily_tips",
    prompt: "Do you want to receive daily tips?",
    yes: "Awesome! We will ping you once a day at 9 AM.",
    no: "All good! You can opt-back-in anytime by saying YES.",
    fallback: "Please reply YES or NO.",
  },
];

export default function InputValidatorPage() {
  const [rules, setRules] = useState<ValidatorRule[]>(seedRules);
  const [draft, setDraft] = useState<ValidatorRule>({
    id: "",
    prompt: "",
    yes: "",
    no: "",
    fallback: "Please respond with YES or NO to continue.",
  });
  const [previewPrompt, setPreviewPrompt] = useState("voucher");
  const [previewInput, setPreviewInput] = useState("YES");

  const previewResponse = useMemo(() => {
    const rule = rules.find((r) => r.id === previewPrompt);
    if (!rule) return "Select a prompt to preview";
    const normalized = previewInput.trim().toLowerCase();
    if (normalized === "yes") return rule.yes;
    if (normalized === "no") return rule.no;
    return rule.fallback;
  }, [rules, previewPrompt, previewInput]);

  const addRule = () => {
    if (!draft.id || !draft.prompt || !draft.yes || !draft.no) return;
    setRules((prev) => [...prev.filter((r) => r.id !== draft.id), draft]);
    setDraft({
      id: "",
      prompt: "",
      yes: "",
      no: "",
      fallback: "Please respond with YES or NO to continue.",
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Input Validator & Responder</h3>
          <p className="text-sm text-muted-foreground">
            Validate Yes/No replies per prompt and guarantee a friendly fallback when the user sends something unexpected.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border p-5 space-y-4">
          <div>
            <h4 className="text-base font-semibold">Create validator rule</h4>
            <p className="text-sm text-muted-foreground">Define the prompt copy plus YES / NO responses.</p>
          </div>
          <div className="space-y-3">
            <input
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Rule ID (e.g. loyalty_opt_in)"
              value={draft.id}
              onChange={(e) => setDraft({ ...draft, id: e.target.value })}
            />
            <textarea
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Prompt copy"
              value={draft.prompt}
              onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
            />
            <div className="grid gap-3 md:grid-cols-2">
              <textarea
                className="rounded-md border px-3 py-2 text-sm"
                placeholder="YES response"
                value={draft.yes}
                onChange={(e) => setDraft({ ...draft, yes: e.target.value })}
              />
              <textarea
                className="rounded-md border px-3 py-2 text-sm"
                placeholder="NO response"
                value={draft.no}
                onChange={(e) => setDraft({ ...draft, no: e.target.value })}
              />
            </div>
            <textarea
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Fallback message"
              value={draft.fallback}
              onChange={(e) => setDraft({ ...draft, fallback: e.target.value })}
            />
          </div>
          <div className="flex justify-end">
            <button
              onClick={addRule}
              className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90"
            >
              Save rule
            </button>
          </div>
        </section>

        <section className="rounded-xl border p-5 space-y-4">
          <div>
            <h4 className="text-base font-semibold">Preview response</h4>
            <p className="text-sm text-muted-foreground">Simulate incoming replies before publishing.</p>
          </div>
          <div className="space-y-3">
            <select
              className="w-full rounded-md border px-3 py-2 text-sm"
              value={previewPrompt}
              onChange={(e) => setPreviewPrompt(e.target.value)}
            >
              {rules.map((rule) => (
                <option key={rule.id} value={rule.id}>
                  {rule.prompt.slice(0, 60)}
                </option>
              ))}
            </select>
            <input
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Type YES / NO / anything"
              value={previewInput}
              onChange={(e) => setPreviewInput(e.target.value)}
            />
            <div className="rounded-lg border bg-muted/50 px-3 py-2 text-sm">
              <div className="text-xs text-muted-foreground uppercase">Response</div>
              <div>{previewResponse}</div>
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-xl border p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-base font-semibold">Configured prompts</h4>
            <p className="text-sm text-muted-foreground">Ready-to-use validator rules reused across campaigns.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left font-medium">ID</th>
                <th className="px-3 py-2 text-left font-medium">Prompt</th>
                <th className="px-3 py-2 text-left font-medium">YES reply</th>
                <th className="px-3 py-2 text-left font-medium">NO reply</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className="border-t">
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{rule.id}</td>
                  <td className="px-3 py-2">{rule.prompt}</td>
                  <td className="px-3 py-2 text-muted-foreground">{rule.yes}</td>
                  <td className="px-3 py-2 text-muted-foreground">{rule.no}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

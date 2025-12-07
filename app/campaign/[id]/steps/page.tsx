// app/campaign/[id]/steps/page.tsx

"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Api } from "@/lib/client";
import type {
  ActionType,
  CampaignStepWithChoices,
  ApiListItem,
  InputType,
} from "@/lib/types";
import { usePrivilege } from "@/lib/permissions";
import { showCenteredAlert } from "@/lib/showAlert";

type TemplateListItem = {
  content_id: number;
  title: string;
  type: string | null;
  lang: string | null;
  status: string | null;
  media_url?: string | null;
  description?: string | null;
  body?: string | null;
};

const ACTION_OPTIONS: ActionType[] = ["message", "choice", "input", "api"];

const looksLikeImage = (url?: string | null) =>
  !!url && /\.(jpg|jpeg|png|gif|webp)$/i.test(url);

const newStep = (campaignId: number, order: number): CampaignStepWithChoices => ({
  step_id: 0,
  campaign_id: campaignId,
  step_number: order,
  step_code: `STEP_${order}`,
  prompt_text: "",
  error_message: "",
  action_type: "message",
  expected_input: "none",
  input_type: null,
  api_id: null,
  next_step_id: null,
  failure_step_id: null,
  is_end_step: false,
  jump_mode: "next",
  media_url: null,
  template_source_id: null,
  campaign_step_choice: [],
});

export default function CampaignStepsPage() {
  const { id } = useParams<{ id: string }>();
  const { loading: privLoading, canView, canUpdate } = usePrivilege("campaigns");

  const [campaignName, setCampaignName] = useState("");
  const [steps, setSteps] = useState<CampaignStepWithChoices[]>([]);
  const [apis, setApis] = useState<ApiListItem[]>([]);
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const mapStepsForUi = (apiSteps: CampaignStepWithChoices[]) => {
    const rawSteps = [...(apiSteps || [])].sort((a, b) => a.step_number - b.step_number);
    const idToStepNumber = new Map(rawSteps.map((st) => [st.step_id, st.step_number]));

    return rawSteps.map((step) => {
      let inputType: InputType | null = null;
      let expected = step.expected_input;
      if (step.action_type === "input") {
        if (step.expected_input === "number" || step.expected_input === "email") {
          inputType = step.expected_input as InputType;
        } else {
          inputType = "text";
        }
        expected = inputType;
      } else if (step.action_type === "choice") {
        expected = "choice";
      } else {
        expected = "none";
      }

      const nextNumber =
        step.next_step_id && idToStepNumber.has(step.next_step_id)
          ? idToStepNumber.get(step.next_step_id)!
          : null;
      const failureNumber =
        step.failure_step_id && idToStepNumber.has(step.failure_step_id)
          ? idToStepNumber.get(step.failure_step_id)!
          : null;
      const mappedChoices = (step.campaign_step_choice || []).map((c) => ({
        ...c,
        next_step_id:
          c.next_step_id && idToStepNumber.has(c.next_step_id)
            ? idToStepNumber.get(c.next_step_id)!
            : null,
      }));

      const jump_mode =
        (step as any).jump_mode ??
        (step as any).jumpMode ??
        (step.next_step_id ? "custom" : "next");

      return {
        ...step,
        next_step_id: nextNumber,
        failure_step_id: failureNumber,
        campaign_step_choice: mappedChoices,
        input_type: inputType,
        expected_input: expected,
        jump_mode,
        template: (step as any).template ?? null,
        template_source_id: (step as any).template_source_id ?? null,
      };
    });
  };

  useEffect(() => {
    if (!id || privLoading || !canView) return;
    (async () => {
      try {
        const [stepsRes, apiRes, templateRes] = await Promise.all([
          Api.getCampaignWithSteps(id),
          Api.listApis(),
          (Api as any).listTemplates?.() ?? Api.listTemplates?.(),
        ]);
        setCampaignName(
          (stepsRes.campaign as any).campaignname ||
            (stepsRes.campaign as any).campaign_name ||
            ""
        );
        const mapped = mapStepsForUi(stepsRes.steps || []);
        setSteps(mapped);
        setExpandedIndex(mapped.length ? 0 : null);
        setApis(apiRes || []);
        setTemplates((templateRes as any) || []);
      } catch (err) {
        console.error(err);
        await showCenteredAlert(
          err instanceof Error ? err.message : "Failed to load campaign steps."
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [id, privLoading, canView]);

  const summarizeChoices = (step: CampaignStepWithChoices) => {
    if (!step.campaign_step_choice?.length) return "-";
    return step.campaign_step_choice
      .map((c) => `${c.choice_code || ""}${c.label ? ` (${c.label})` : ""}`)
      .join(", ");
  };

  const updateStep = (index: number, patch: Partial<CampaignStepWithChoices>) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const updateChoice = (
    stepIndex: number,
    choiceIndex: number,
    patch: Record<string, any>
  ) => {
    setSteps((prev) =>
      prev.map((s, i) => {
        if (i !== stepIndex) return s;
        const updatedChoices = (s.campaign_step_choice || []).map((c, ci) =>
          ci === choiceIndex ? { ...c, ...patch } : c
        );
        return { ...s, campaign_step_choice: updatedChoices };
      })
    );
  };

  const addChoice = (stepIndex: number) => {
    const current = steps[stepIndex];
    const choice = {
      choice_id: 0,
      campaign_id: current.campaign_id,
      step_id: current.step_id,
      choice_code: "",
      label: "",
      next_step_id: null,
      is_correct: false,
    };
    updateStep(stepIndex, {
      campaign_step_choice: [...(current.campaign_step_choice || []), choice],
    });
  };

  const removeChoice = (stepIndex: number, choiceIndex: number) => {
    const current = steps[stepIndex];
    updateStep(stepIndex, {
      campaign_step_choice: current.campaign_step_choice.filter((_, ci) => ci !== choiceIndex),
    });
  };

  const handleAddStep = () => {
    const cid = Number(id);
    const created = newStep(cid, steps.length + 1);
    const next = [...steps, created];
    setSteps(next);
    setExpandedIndex(next.length - 1);
  };

  const handleRemoveStep = (index: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== index));
    setExpandedIndex(null);
  };

  // Apply template: copy message/media and store source id
  const handleApplyTemplateToStep = async (stepIndex: number, templateId: number) => {
    if (!templateId) return;
    try {
      const res = await (Api as any).getTemplate(templateId);
      const tmpl = (res as any)?.data || res;
      if (!tmpl) return;

      const body: string = tmpl.body || "";
      const mediaUrl: string | null = tmpl.media_url ?? tmpl.mediaurl ?? null;

      updateStep(stepIndex, {
        template_source_id: tmpl.content_id ?? tmpl.contentid ?? templateId,
        prompt_text: body,
        media_url: mediaUrl,
      } as any);
    } catch (err) {
      console.error("Failed to apply template:", err);
      await showCenteredAlert(
        err instanceof Error ? err.message : "Failed to apply template to this step."
      );
    }
  };

  const handleSaveAll = async () => {
    if (!canUpdate) {
      await showCenteredAlert("You do not have permission to update campaigns.");
      return;
    }
    // Validate unique step_code
    const seen = new Set<string>();
    for (let i = 0; i < steps.length; i += 1) {
      const code = (steps[i].step_code || `STEP_${i + 1}`).trim().toLowerCase();
      if (!code) continue;
      if (seen.has(code)) {
        setValidationError("Step code must be unique within the campaign.");
        return;
      }
      seen.add(code);
    }
    setValidationError(null);
    setSaving(true);
    try {
      const payload = steps.map((s, idx) => ({
        ...s,
        step_number: idx + 1,
        step_code: (s.step_code || `STEP_${idx + 1}`).trim(),
      }));
      const res = await Api.saveCampaignStepsBulk(id, payload);
      const mapped = mapStepsForUi(res.steps || []);
      setSteps(mapped);
      setExpandedIndex(mapped.length ? 0 : null);
      await showCenteredAlert("Steps saved.");
    } catch (err) {
      console.error(err);
      await showCenteredAlert(err instanceof Error ? err.message : "Failed to save steps.");
    } finally {
      setSaving(false);
    }
  };

  const activeStep =
    expandedIndex !== null && expandedIndex >= 0 && expandedIndex < steps.length
      ? steps[expandedIndex]
      : steps[0] || null;
  const activeStepNumber = activeStep ? steps.indexOf(activeStep) + 1 : null;
  const nextLabel = (() => {
    if (!activeStep) return "";
    if (activeStep.action_type === "choice") return "Per choice";
    if (activeStep.is_end_step) return "End";
    if (activeStep.next_step_id) return `Step ${activeStep.next_step_id}`;
    if (activeStepNumber && activeStepNumber < steps.length) return `Step ${activeStepNumber + 1}`;
    return "End";
  })();
  const failureLabel =
    activeStep?.action_type === "api"
      ? activeStep.failure_step_id
        ? `Step ${activeStep.failure_step_id}`
        : "None"
      : "-";

  if (!privLoading && !canView) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
        You do not have permission to view campaigns.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Campaign steps</h3>
          <p className="text-sm text-muted-foreground">
            Manage the ordered steps and branching choices for this campaign.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/campaign" className="text-sm text-primary hover:underline">
            Back to campaigns
          </Link>
          <Link href={`/campaign/${id}`} className="text-sm text-primary hover:underline">
            Campaign details
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2.5fr)_minmax(320px,1fr)] items-start">
        <div className="rounded-lg border bg-card p-4">
        <div className="mb-4">
          <p className="text-xs uppercase text-muted-foreground">Campaign</p>
          <p className="text-base font-semibold">{campaignName || "Loading..."}</p>
        </div>
        {validationError && (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {validationError}
          </div>
        )}

        <div className="rounded-lg border bg-white overflow-hidden">
          <div className="px-3 py-2 border-b text-xs uppercase text-muted-foreground font-semibold">
            Step-by-step table
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-xs text-muted-foreground">
                  <th className="px-3 py-2 text-left font-semibold">Step #</th>
                  <th className="px-3 py-2 text-left font-semibold">Prompt message</th>
                  <th className="px-3 py-2 text-left font-semibold">Input type</th>
                  <th className="px-3 py-2 text-left font-semibold">Action type</th>
                  <th className="px-3 py-2 text-left font-semibold">Guide / Choices</th>
                  <th className="px-3 py-2 text-left font-semibold">On success</th>
                  <th className="px-3 py-2 text-left font-semibold">On failure</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-3 text-muted-foreground">
                      Loading...
                    </td>
                  </tr>
                ) : (
                  steps.map((s, idx) => (
                    <Fragment key={`step-${s.step_id ?? "new"}-${idx}`}>
                      <tr
                        className={`border-t cursor-pointer hover:bg-muted/40 ${
                          expandedIndex === idx ? "bg-muted/40" : ""
                        }`}
                        onClick={() => setExpandedIndex(expandedIndex === idx ? null : idx)}
                      >
                        <td className="px-3 py-2 font-semibold">{idx + 1}</td>
                        <td className="px-3 py-2 max-w-[240px]">
                          <div className="font-medium truncate">{s.prompt_text || "-"}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {s.step_code || "No code"}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {s.action_type === "input"
                            ? s.input_type || "text"
                            : s.action_type === "choice"
                            ? "choice"
                            : "none"}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {s.action_type || "message"}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {summarizeChoices(s)}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {s.action_type === "choice"
                            ? "Per choice"
                            : idx === steps.length - 1
                            ? "END"
                            : `Next (step ${idx + 2})`}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {s.failure_step_id ?? (s.action_type === "api" ? "-" : "")}
                        </td>
                      </tr>
                      {expandedIndex === idx ? (
                        <tr className="bg-muted/30 border-t">
                          <td colSpan={7} className="px-4 py-4">
                            <div className="space-y-4">
                              <div className="flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveStep(idx)}
                                  className="text-xs text-rose-600 hover:text-rose-700"
                                >
                                  Remove step
                                </button>
                              </div>
                              <div className="grid gap-3 md:grid-cols-3">
                                <label className="space-y-1 text-sm font-medium">
                                  <span>Action type</span>
                                  <select
                                    className="w-full rounded border px-3 py-2"
                                    value={s.action_type}
                                    onChange={(e) => {
                                      const nextAction = e.target.value as ActionType;
                                      const nextInputType =
                                        nextAction === "input" ? s.input_type || "text" : null;
                                      // When switching TO a choice step, clear step-level next_step_id
                                      const extra: Partial<CampaignStepWithChoices> = {};
                                      if (nextAction === "choice") {
                                        extra.next_step_id = null;
                                        extra.is_end_step = false;
                                        extra.jump_mode = "next";
                                      }
                                      updateStep(idx, {
                                        action_type: nextAction,
                                        input_type: nextInputType,
                                        expected_input:
                                          nextAction === "choice"
                                            ? "choice"
                                            : nextAction === "input"
                                            ? (nextInputType as any)
                                            : "none",
                                        ...extra,
                                      });
                                    }}
                                  >
                                    {ACTION_OPTIONS.map((opt) => (
                                      <option key={opt} value={opt}>
                                        {opt}
                                      </option>
                                    ))}
                                  </select>
                                </label>

                                <label className="space-y-1 text-sm font-medium">
                                  <span>Step code</span>
                                  <input
                                    type="text"
                                    className="w-full rounded border px-3 py-2"
                                    value={s.step_code || ""}
                                    onChange={(e) => updateStep(idx, { step_code: e.target.value })}
                                    placeholder="e.g. WELCOME"
                                  />
                                </label>

                                {/* Template picker (copy + reference) */}
                                <label className="space-y-1 text-sm font-medium">
                                  <span>Template (optional)</span>
                                  <div className="flex gap-2">
                                    <select
                                      className="w-full rounded border px-3 py-2"
                                      value={s.template_source_id ?? ""}
                                      onChange={async (e) => {
                                        const val = e.target.value;
                                        const templateId = val ? Number(val) : 0;
                                        if (!templateId) {
                                          updateStep(idx, { template_source_id: null as any });
                                          return;
                                        }
                                        await handleApplyTemplateToStep(idx, templateId);
                                      }}
                                    >
                                      <option value="">No template (manual message)</option>
                                      {templates.map((t) => (
                                        <option
                                          key={t.content_id ?? (t as any).contentid ?? t.title}
                                          value={t.content_id ?? (t as any).contentid ?? ""}
                                        >
                                          {t.title} {t.lang ? `(${t.lang})` : ""}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    Choosing a template will copy its message and media into this step
                                    and remember which template it came from. You can still edit the
                                    copied text freely.
                                  </p>
                                </label>

                                {/* Step-level jump configuration (NOT for choice steps) */}
                                {s.action_type !== "choice" && (
                                  <label className="space-y-1 text-sm font-medium">
                                    <span>On success (jump)</span>
                                      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                                      <div className="flex items-center gap-2">
                                        <input
                                          type="radio"
                                          name={`jump-mode-${idx}`}
                                          checked={s.jump_mode !== "custom" && !s.is_end_step}
                                          onChange={() => {
                                            // Next step in natural order: treat as no explicit jump
                                            updateStep(idx, {
                                              next_step_id: null,
                                              is_end_step: false,
                                              jump_mode: "next",
                                            });
                                          }}
                                          className="h-3 w-3"
                                        />
                                        <span>Next step in order</span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <input
                                          type="radio"
                                          name={`jump-mode-${idx}`}
                                          checked={s.jump_mode === "custom" && !!s.next_step_id && !s.is_end_step}
                                          onChange={() => {
                                            const defaultJump = idx + 2 <= steps.length ? idx + 2 : null;
                                            updateStep(idx, {
                                              next_step_id: defaultJump,
                                              is_end_step: false,
                                              jump_mode: "custom",
                                            });
                                          }}
                                          className="h-3 w-3"
                                        />
                                        <span>Jump to step number:</span>
                                        <input
                                          type="number"
                                          className="w-20 rounded border px-2 py-1"
                                          value={s.next_step_id ?? ""}
                                          onChange={(e) => {
                                            const val = e.target.value ? Number(e.target.value) : null;
                                            updateStep(idx, {
                                              next_step_id: val,
                                              is_end_step: false,
                                              jump_mode: val ? "custom" : "next",
                                            });
                                          }}
                                          disabled={!s.next_step_id}
                                        />
                                      </div>
                                      <div className="flex items-center gap-2 mt-1">
                                        <input
                                          type="checkbox"
                                          className="h-3 w-3"
                                          checked={!!s.is_end_step}
                                          onChange={(e) => {
                                            if (e.target.checked) {
                                              updateStep(idx, {
                                                is_end_step: true,
                                                next_step_id: null,
                                                jump_mode: "next",
                                              });
                                            } else {
                                              updateStep(idx, { is_end_step: false });
                                            }
                                          }}
                                        />
                                        <span>This is the last step (end campaign)</span>
                                      </div>
                                    </div>
                                  </label>
                                )}
                              </div>

                              <label className="space-y-1 text-sm font-medium">
                                <span>Prompt text</span>
                                <textarea
                                  className="w-full rounded border px-3 py-2 min-h-[120px]"
                                  value={s.prompt_text || ""}
                                  onChange={(e) => updateStep(idx, { prompt_text: e.target.value })}
                                  placeholder="What should be sent to the user at this step?"
                                />
                              </label>

                              {/* Media URL (optional, one per step) */}
                              {(s.action_type === "message" ||
                                s.action_type === "choice" ||
                                s.action_type === "input") && (
                                <div className="grid gap-3 md:grid-cols-1">
                                  <label className="space-y-1 text-sm font-medium">
                                    <span>Media URL (optional)</span>
                                    <input
                                      type="text"
                                      className="w-full rounded border px-3 py-2"
                                      value={s.media_url || ""}
                                      onChange={(e) =>
                                        updateStep(idx, {
                                          media_url: e.target.value,
                                        })
                                      }
                                      placeholder="https://... (public URL in your storage)"
                                    />
                                  </label>
                                </div>
                              )}

                              {(s.action_type === "choice" || s.action_type === "input") && (
                                <label className="space-y-1 text-sm font-medium">
                                  <span>
                                    {s.action_type === "choice"
                                      ? "Fallback message (when reply does not match any option)"
                                      : "Error message (when input is invalid)"}
                                  </span>
                                  <textarea
                                    className="w-full rounded border px-3 py-2 min-h-[80px]"
                                    value={s.error_message || ""}
                                    onChange={(e) => updateStep(idx, { error_message: e.target.value })}
                                    placeholder={
                                      s.action_type === "choice"
                                        ? "e.g. Sorry, I didn't get that. Please choose one of the options below."
                                        : "e.g. Please enter a valid value."
                                    }
                                  />
                                </label>
                              )}

                              {s.action_type === "input" && (
                                <label className="space-y-1 text-sm font-medium">
                                  <span>Input type</span>
                                  <select
                                    className="w-full rounded border px-3 py-2"
                                    value={s.input_type || "text"}
                                    onChange={(e) =>
                                      updateStep(idx, {
                                        input_type: e.target.value as InputType,
                                        expected_input: e.target.value as InputType,
                                      })
                                    }
                                  >
                                    <option value="text">Text</option>
                                    <option value="number">Number</option>
                                    <option value="email">Email</option>
                                  </select>
                                </label>
                              )}

                              {s.action_type === "api" && (
                                <div className="grid gap-3 md:grid-cols-2">
                                  <label className="space-y-1 text-sm font-medium">
                                    <span>API</span>
                                    <select
                                      className="w-full rounded border px-3 py-2"
                                      value={s.api_id ?? ""}
                                      onChange={(e) =>
                                        updateStep(idx, {
                                          api_id: e.target.value ? Number(e.target.value) : null,
                                        })
                                      }
                                    >
                                      <option value="">Select API</option>
                                      {apis
                                        .filter((api) => api.is_active !== false)
                                        .map((api) => (
                                          <option key={api.api_id} value={api.api_id}>
                                            {api.name}
                                          </option>
                                        ))}
                                    </select>
                                  </label>
                                  <label className="space-y-1 text-sm font-medium">
                                    <span>Failure step</span>
                                    <select
                                      className="w-full rounded border px-3 py-2"
                                      value={s.failure_step_id ?? ""}
                                      onChange={(e) =>
                                        updateStep(idx, {
                                          failure_step_id: e.target.value ? Number(e.target.value) : null,
                                        })
                                      }
                                    >
                                      <option value="">None</option>
                                      {steps.map((st, si) => (
                                        <option
                                          key={`fail-${st.step_id ?? `idx-${si}`}`}
                                          value={st.step_number || si + 1}
                                        >
                                          {si + 1} - {st.step_code || st.prompt_text || "Step"}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                </div>
                              )}

                              {s.action_type === "choice" && (
                                <div className="space-y-3 border-t pt-3">
                                  <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-semibold">Choices</h4>
                                    <button
                                      type="button"
                                      onClick={() => addChoice(idx)}
                                      className="text-xs rounded border px-2 py-1 hover:bg-muted"
                                    >
                                      Add choice
                                    </button>
                                  </div>
                                  <div className="space-y-3">
                                    {s.campaign_step_choice?.length ? (
                                      s.campaign_step_choice.map((choice, cidx) => (
                                        <div key={choice.choice_id || cidx} className="rounded border p-3 space-y-2">
                                          <div className="flex justify-end">
                                            <button
                                              type="button"
                                              onClick={() => removeChoice(idx, cidx)}
                                              className="text-xs text-rose-600 hover:text-rose-700"
                                            >
                                              Remove
                                            </button>
                                          </div>
                                          <div className="grid gap-2 md:grid-cols-2">
                                            <label className="text-sm font-medium space-y-1">
                                              <span>Code</span>
                                              <input
                                                type="text"
                                                value={choice.choice_code || ""}
                                                onChange={(e) =>
                                                  updateChoice(idx, cidx, { choice_code: e.target.value })
                                                }
                                                className="w-full rounded border px-3 py-2"
                                                placeholder="e.g. YES"
                                              />
                                            </label>
                                          <label className="text-sm font-medium space-y-1">
                                            <span>Label</span>
                                            <input
                                              type="text"
                                              value={choice.label || ""}
                                                onChange={(e) =>
                                                  updateChoice(idx, cidx, { label: e.target.value })
                                                }
                                                className="w-full rounded border px-3 py-2"
                                                placeholder="Displayed to user"
                                              />
                                            </label>
                                          </div>
                                          <div className="grid gap-2 md:grid-cols-2 items-center">
                                            <label className="text-sm font-medium space-y-1">
                                              <span>Next step number (jump to within this campaign)</span>
                                              <input
                                                type="number"
                                                value={choice.next_step_id ?? ""}
                                                onChange={(e) =>
                                                  updateChoice(idx, cidx, {
                                                    next_step_id: e.target.value ? Number(e.target.value) : null,
                                                  })
                                                }
                                                className="w-full rounded border px-3 py-2"
                                                placeholder="e.g. 4 (next step in this campaign)"
                                              />
                                            </label>
                                            <label className="inline-flex items-center gap-2 text-sm font-medium mt-4 md:mt-6">
                                              <input
                                                type="checkbox"
                                                checked={!!choice.is_correct}
                                                onChange={(e) =>
                                                  updateChoice(idx, cidx, { is_correct: e.target.checked })
                                                }
                                                className="h-4 w-4"
                                              />
                                              Mark as correct
                                            </label>
                                          </div>
                                        </div>
                                      ))
                                    ) : (
                                      <p className="text-xs text-muted-foreground">No choices yet.</p>
                                    )}
                                  </div>
                                </div>
                              )}

                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))
                )}
                <tr className="border-t">
                  <td colSpan={7} className="px-3 py-3">
                    <button
                      type="button"
                      onClick={handleAddStep}
                      className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
                    >
                      Add step
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <button
            type="button"
            onClick={handleSaveAll}
            disabled={saving}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
        </div>

        <aside className="rounded-lg border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Step Preview</h4>
            {activeStep ? (
              <span className="text-xs rounded-full bg-muted px-3 py-1 font-medium text-muted-foreground">
                {activeStep.action_type || "message"}
              </span>
            ) : null}
          </div>

          {activeStep ? (
            <div className="space-y-3 text-sm">
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <span className="font-semibold text-foreground">
                  Step {activeStepNumber ?? "-"}
                </span>
                <span>-</span>
                <span>{activeStep.step_code || "No code"}</span>
              </div>

              {activeStep.media_url?.trim() ? (
                looksLikeImage(activeStep.media_url) ? (
                  <div className="rounded-md overflow-hidden border bg-muted">
                    <img
                      src={activeStep.media_url}
                      alt="Step media"
                      className="block w-full object-cover max-h-40"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                ) : (
                  <div className="rounded-md border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                    <span className="block">Attachment</span>
                    <span className="block truncate">{activeStep.media_url}</span>
                  </div>
                )
              ) : null}

              <div className="rounded-lg bg-background px-3 py-2 leading-relaxed shadow-sm whitespace-pre-line">
                {activeStep.prompt_text?.trim() || "No prompt yet."}
              </div>

              {activeStep.action_type === "choice" && (
                <div className="space-y-1">
                  {(activeStep.campaign_step_choice || []).length ? (
                    (activeStep.campaign_step_choice || []).map((c, idx) => (
                      <button
                        key={`${c.choice_id || idx}`}
                        type="button"
                        className="w-full rounded-full border bg-background px-3 py-1.5 text-[11px] font-medium text-primary text-center"
                      >
                        {c.label || c.choice_code || `Option ${idx + 1}`}
                      </button>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">Choices will appear here.</p>
                  )}
                </div>
              )}

              {activeStep.action_type === "input" && (
                <div className="space-y-1">
                  <input
                    disabled
                    className="w-full rounded-md border bg-muted px-3 py-2 text-xs text-muted-foreground"
                    placeholder={`Expected input: ${activeStep.input_type || "text"}`}
                  />
                  {activeStep.error_message ? (
                    <p className="text-[11px] text-muted-foreground">
                      Error message: {activeStep.error_message}
                    </p>
                  ) : null}
                </div>
              )}

              {activeStep.action_type === "api" && (
                <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground space-y-1">
                  <p>Calls API: {activeStep.api_id ? `#${activeStep.api_id}` : "Not selected"}</p>
                  <p>On failure: {failureLabel}</p>
                </div>
              )}

              {activeStep.action_type === "choice" && activeStep.error_message && (
                <p className="text-[11px] text-muted-foreground">
                  Fallback: {activeStep.error_message}
                </p>
              )}

              <div className="text-xs text-muted-foreground">
                <div>On success: {nextLabel}</div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Add a step to see how it will look in WhatsApp.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}


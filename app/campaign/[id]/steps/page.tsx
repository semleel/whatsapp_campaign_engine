// app/campaign/[id]/steps/page.tsx

"use client";

import { Fragment, type ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Api } from "@/lib/client";
import type {
  ActionType,
  CampaignStepWithChoices,
  ApiListItem,
  InputType,
} from "@/lib/types";
import { usePrivilege } from "@/lib/permissions";
import { showCenteredAlert, showPrivilegeDenied } from "@/lib/showAlert";

type TemplateListItem = {
  content_id: number;
  title: string;
  type: string | null;
  lang: string | null;
  status: string | null;
  description?: string | null;
  body?: string | null;
  placeholders?: Record<string, unknown> | null;
  media_url?: string | null;
  is_deleted?: boolean | null;
  expires_at?: string | null;
};

type TemplateMenuOption = {
  title?: string | null;
  label?: string | null;
  name?: string | null;
};

type TemplateMenuSection = {
  title?: string | null;
  options?: TemplateMenuOption[];
  rows?: TemplateMenuOption[];
};

type StepFormState = CampaignStepWithChoices & {
  message_mode?: "custom" | "template";
  local_id: string;
  client_id: number;
  choice_mode?: "branch" | "sequential";
};

const resolveChoiceMode = (step?: StepFormState | null): "branch" | "sequential" =>
  step?.choice_mode === "sequential" ? "sequential" : "branch";

const ACTION_OPTIONS: ActionType[] = ["message", "choice", "input", "api"];

const generateLocalId = () => `step-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const looksLikeImage = (url?: string | null) =>
  !!url && /\.(jpg|jpeg|png|gif|webp)$/i.test(url);
const looksLikeVideo = (url?: string | null) => !!url && /\.(mp4|mov|avi|mkv|webm)$/i.test(url);
const looksLikeDocument = (url?: string | null) =>
  !!url && /\.(pdf|docx?|xls|xlsx|ppt|pptx)$/i.test(url);

const INLINE_FORMATTERS: { regex: RegExp; wrap: (content: string, key: string) => React.ReactNode }[] =
  [
    {
      regex: /```([^`]+)```/g,
      wrap: (content, key) => (
        <code key={key} className="bg-muted px-1 rounded text-[11px] font-mono">
          {content}
        </code>
      ),
    },
    {
      regex: /`([^`]+)`/g,
      wrap: (content, key) => (
        <code key={key} className="bg-muted px-1 rounded text-[11px] font-mono">
          {content}
        </code>
      ),
    },
    { regex: /\*(?!\s)([^*]+?)\*(?!\s)/g, wrap: (c, key) => <strong key={key}>{c}</strong> },
    { regex: /_(?!\s)([^_]+?)_(?!\s)/g, wrap: (c, key) => <em key={key}>{c}</em> },
    { regex: /~(?!\s)([^~]+?)~(?!\s)/g, wrap: (c, key) => <s key={key}>{c}</s> },
  ];

function formatWhatsAppLine(line: string, keyPrefix: string) {
  let segments: React.ReactNode[] = [line];

  INLINE_FORMATTERS.forEach((fmt, fmtIdx) => {
    const next: React.ReactNode[] = [];

    segments.forEach((seg, segIdx) => {
      if (typeof seg !== "string") {
        next.push(seg);
        return;
      }

      const regex = new RegExp(fmt.regex.source, fmt.regex.flags);
      let lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = regex.exec(seg)) !== null) {
        if (match.index > lastIndex) {
          next.push(seg.slice(lastIndex, match.index));
        }

        next.push(fmt.wrap(match[1], `${keyPrefix}-${fmtIdx}-${segIdx}-${next.length}`));
        lastIndex = match.index + match[0].length;
      }

      if (lastIndex < seg.length) {
        next.push(seg.slice(lastIndex));
      }
    });

    segments = next;
  });

  return segments;
}

function renderFormattedLines(text?: string | null, placeholder = "No prompt yet.") {
  const lines = text ? text.split("\n") : [placeholder];
  return lines.map((line, idx) => {
    const content = line ? formatWhatsAppLine(line, `line-${idx}`) : [placeholder];
    return (
      <p key={`line-${idx}`} className="whitespace-pre-wrap">
        {content}
      </p>
    );
  });
}

const getTemplateId = (template: TemplateListItem) => template.content_id ?? null;

const isTemplateActiveForSteps = (template: TemplateListItem) => {
  const normalize = (val?: string | null) =>
    (val || "")
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
  const isDeleted = template.is_deleted === true;
  const expiresRaw = template.expires_at;
  const expiresAt = expiresRaw ? new Date(expiresRaw) : null;
  const isExpired =
    expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt.getTime() < Date.now() : false;

  // Align with template library default: show anything not deleted/expired
  return !isDeleted && !isExpired;
};

const resolveMessageMode = (step: StepFormState) =>
  (step.message_mode ?? (step.template_source_id ? "template" : "custom")) as "custom" | "template";

const newStep = (campaignId: number, order: number): StepFormState => ({
  local_id: generateLocalId(),
  client_id: -Math.floor(Date.now() + Math.random() * 100000),
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
  is_end_step: true,
  media_url: null,
  template_source_id: null,
  message_mode: "custom",
  campaign_step_choice: [],
  choice_mode: "branch",
});

type SortableStepRowProps = {
  step: StepFormState;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  detailContent: React.ReactNode;
  children: React.ReactNode;
};

function SortableStepRow({
  step,
  index,
  isExpanded,
  onToggle,
  detailContent,
  children,
}: SortableStepRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.local_id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <Fragment>
      <tr
        ref={setNodeRef}
        style={style}
        className={`border-t cursor-pointer hover:bg-muted/40 ${isExpanded ? "bg-muted/40" : ""
          } ${isDragging ? "bg-emerald-50 shadow-sm" : ""}`}
        onClick={onToggle}
      >
        <td className="px-2 py-2 align-middle">
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            className="flex h-8 w-8 items-center justify-center rounded border bg-white text-lg leading-none text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2"
            aria-label={`Reorder step ${index + 1}`}
          >
            ⋮⋮
          </button>
        </td>
        {children}
      </tr>
      {isExpanded ? (
        <tr className="border-t bg-muted/40">
          <td colSpan={8}>{detailContent}</td>
        </tr>
      ) : null}
    </Fragment>
  );
}

export default function CampaignStepsPage() {
  const { id } = useParams<{ id: string }>();
  const { loading: privLoading, canView, canUpdate } = usePrivilege("campaigns");
  const navLinkClass =
    "inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1.5 text-sm font-semibold text-primary shadow-sm hover:bg-secondary/80";
  const backIcon = (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M11.5 5.5 7 10l4.5 4.5 1.4-1.4L9.8 10l3.1-3.1z" />
    </svg>
  );
  const detailIcon = (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M4 4h12v2H4V4zm0 5h12v2H4V9zm0 5h7v2H4v-2z" />
    </svg>
  );

  const [campaignName, setCampaignName] = useState("");
  const [steps, setSteps] = useState<StepFormState[]>([]);
  const [apis, setApis] = useState<ApiListItem[]>([]);
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const mapStepsForUi = (apiSteps: CampaignStepWithChoices[]): StepFormState[] => {
    const rawSteps = [...(apiSteps || [])].sort((a, b) => a.step_number - b.step_number);

    return rawSteps.map((step, index) => {
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

      return {
        ...step,
        local_id: step.step_id ? `step-${step.step_id}` : generateLocalId(),
        client_id: ((step as any).client_id ?? step.step_id) ?? -(index + 1),
        step_number: index + 1,
        campaign_step_choice: step.campaign_step_choice || [],
        choice_mode: step.choice_mode === "sequential" ? "sequential" : "branch",
        input_type: inputType,
        expected_input: expected,
        template: (step as any).template ?? null,
        template_source_id: (step as any).template_source_id ?? null,
        message_mode:
          (step as any).message_mode ?? ((step as any).template_source_id ? "template" : "custom"),
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
          (Api as any).listTemplates?.({}) ?? Api.listTemplates?.({}),
        ]);
        setCampaignName((stepsRes.campaign as any).campaign_name || "");
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

  const summarizeChoices = (step: StepFormState) => {
    if (!step.campaign_step_choice?.length) return "-";
    return step.campaign_step_choice
      .map((c) => `${c.choice_code || ""}${c.label ? ` (${c.label})` : ""}`)
      .join(", ");
  };

  const findStepByRef = (ref?: number | null) =>
    ref == null ? null : steps.find((s) => (s.step_id || s.client_id) === ref) || null;

  const formatStepLabel = (step?: StepFormState | null) => {
    if (!step) return null;
    const labelText = step.prompt_text?.trim() || step.step_code || "Step";
    return `Step ${step.step_number}${labelText ? ` – ${labelText}` : ""}`;
  };

  const updateStep = (index: number, patch: Partial<StepFormState>) => {
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
    setSteps((prev) => prev.filter((_, i) => i !== index).map((s, idx) => ({ ...s, step_number: idx + 1 })));
    setExpandedIndex(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setSteps((prev) => {
      const oldIndex = prev.findIndex((s) => s.local_id === active.id);
      const newIndex = prev.findIndex((s) => s.local_id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;

      const reordered = arrayMove(prev, oldIndex, newIndex);
      const updated = reordered.map((step, idx) => ({
        ...step,
        step_number: idx + 1,
      }));

      const activeLocal = expandedIndex !== null ? prev[expandedIndex]?.local_id : null;
      if (activeLocal) {
        const nextIndex = updated.findIndex((s) => s.local_id === activeLocal);
        setExpandedIndex(nextIndex >= 0 ? nextIndex : null);
      }

      return updated;
    });
  };

  // Apply template: copy message/media and store source id
  const handleApplyTemplateToStep = async (stepIndex: number, templateId: number) => {
    if (!templateId) return;
    try {
      const res = await (Api as any).getTemplate(templateId);
      const tmpl = (res as any)?.data || res;
      if (!tmpl) return;

      const body: string = tmpl.body ?? "";
      const mediaUrl: string | null = tmpl.media_url ?? null;
      const buttons = (tmpl as any).buttons || (tmpl as any).menu;
      const normalizedType = ((tmpl as any).type || "").toString().toLowerCase();

      let placeholders = (tmpl as any).placeholders as any;
      if (placeholders && typeof placeholders === "string") {
        try {
          placeholders = JSON.parse(placeholders);
        } catch {
          placeholders = null;
        }
      }

      const extractedChoices: any[] =
        Array.isArray(placeholders?.buttons) && placeholders.buttons.length
          ? placeholders.buttons
          : Array.isArray(placeholders?.choices)
            ? placeholders.choices
            : [];
      const fallbackText =
        (placeholders?.fallback as string) ||
        (placeholders?.fallbackText as string) ||
        (placeholders?.error_message as string) ||
        (placeholders?.footerText as string) ||
        null;

      const inferredAction: ActionType = (() => {
        if (normalizedType.includes("input")) return "input";
        if (
          (buttons && Array.isArray(buttons) && buttons.length) ||
          normalizedType.includes("choice") ||
          normalizedType.includes("button") ||
          normalizedType.includes("interactive")
        ) {
          return "choice";
        }
        return "message";
      })();

      const inferredExpected: any =
        inferredAction === "choice"
          ? "choice"
          : inferredAction === "input"
            ? (placeholders?.inputType as any) ||
            (placeholders?.expected_input as any) ||
            "text"
            : "none";

      setSteps((prev) =>
        prev.map((s, i) =>
          i === stepIndex
            ? (() => {
              const nextAction = inferredAction;
              const shouldSeedChoices =
                nextAction === "choice" &&
                (!s.campaign_step_choice || s.campaign_step_choice.length === 0) &&
                extractedChoices.length > 0;
              return {
                ...s,
                message_mode: "template",
                template_source_id: tmpl.content_id ?? templateId,
                prompt_text: body,
                media_url: mediaUrl ?? null,
                action_type: nextAction,
                expected_input: inferredExpected as any,
                input_type:
                  nextAction === "input"
                    ? ((placeholders?.inputType as InputType) || s.input_type || "text")
                    : s.input_type,
                campaign_step_choice: shouldSeedChoices
                  ? extractedChoices.map((c: any, idx: number) => ({
                    choice_id: 0,
                    campaign_id: s.campaign_id,
                    step_id: s.step_id || 0,
                    choice_code:
                      (c.id as string) ||
                      (c.code as string) ||
                      (c.choice_code as string) ||
                      (c.text as string) ||
                      (c.label as string) ||
                      `CHOICE_${idx + 1}`,
                    label:
                      (c.label as string) ||
                      (c.text as string) ||
                      (c.title as string) ||
                      `Option ${idx + 1}`,
                    next_step_id: null,
                    is_correct: typeof c.is_correct === "boolean" ? c.is_correct : null,
                  }))
                  : s.campaign_step_choice,
                error_message:
                  nextAction === "choice"
                    ? (fallbackText ?? null)
                    : s.error_message,
              };
            })()
            : s
        )
      );
    } catch (err) {
      console.error("Failed to apply template:", err);
      await showCenteredAlert(
        err instanceof Error ? err.message : "Failed to apply template to this step."
      );
    }
  };

  // Seed choices/fallback for choice steps that already reference a template but have no choices yet.
  useEffect(() => {
    steps.forEach((s, idx) => {
      if (
        s.action_type === "choice" &&
        (s.campaign_step_choice?.length ?? 0) === 0 &&
        s.template_source_id
      ) {
        handleApplyTemplateToStep(idx, Number(s.template_source_id));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps.length]);

  const handleSaveAll = async () => {
    if (!canUpdate) {
      await showPrivilegeDenied({ action: "update campaigns", resource: "Campaigns" });
      return;
    }
    const idSet = new Set(steps.map((s) => s.step_id || s.client_id));

    // Validate routing + unique step_code
    const seen = new Set<string>();
    for (let i = 0; i < steps.length; i += 1) {
      const code = (steps[i].step_code || `STEP_${i + 1}`).trim().toLowerCase();
      if (!code) continue;
      if (seen.has(code)) {
        setValidationError("Step code must be unique within the campaign.");
        return;
      }
      seen.add(code);

      const step = steps[i];
      if (step.action_type !== "choice") {
        if (step.is_end_step) {
          continue;
        }
        if (!step.next_step_id || !idSet.has(step.next_step_id)) {
          setValidationError("Each non-choice step must either jump to a valid step or end the campaign.");
          return;
        }
      }
      if (step.action_type === "api" && step.failure_step_id && !idSet.has(step.failure_step_id)) {
        setValidationError("API failure routing must point to a valid step.");
        return;
      }
      if (step.action_type === "api") {
        const api = apis.find((a) => a.api_id === step.api_id);
        if (api && api.is_active === false) {
          setValidationError(
            `Step ${step.step_number} uses a disabled API (${api.name}). Please select an active API.`
          );
          return;
        }
      }
      if (step.action_type === "choice") {
        const mode = resolveChoiceMode(step);
        if (mode === "sequential") {
          if (!step.next_step_id || !idSet.has(step.next_step_id)) {
            setValidationError(
              "This step must have a Next Step configured when using “Continue to next step”."
            );
            return;
          }
        } else {
          const badChoice = (step.campaign_step_choice || []).find(
            (c) => c.next_step_id && !idSet.has(c.next_step_id)
          );
          if (badChoice) {
            setValidationError("Each choice must jump to a valid step or be left blank.");
            return;
          }
        }
      }
    }
    setValidationError(null);
    setSaving(true);
    try {
      const payload = steps.map((s, idx) => {
        const { message_mode, template, local_id, ...rest } = s as StepFormState & { template?: any };
        const mode = resolveMessageMode(s);
        return {
          ...rest,
          next_step_id: s.action_type === "choice" ? null : s.is_end_step ? null : s.next_step_id ?? null,
          failure_step_id: s.action_type === "api" ? s.failure_step_id ?? null : null,
          is_end_step: !!s.is_end_step,
          template_source_id: mode === "template" ? rest.template_source_id ?? null : null,
          choice_mode: s.action_type === "choice" ? (s.choice_mode ?? "branch") : undefined,
          step_number: idx + 1,
          step_code: (s.step_code || `STEP_${idx + 1}`).trim(),
        };
      });
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

  const activeTemplates = templates.filter(isTemplateActiveForSteps);

  const activeStep =
    expandedIndex !== null && expandedIndex >= 0 && expandedIndex < steps.length
      ? steps[expandedIndex]
      : steps[0] || null;
  const activeStepNumber = activeStep?.step_number ?? null;
  const nextLabel = (() => {
    if (!activeStep) return "";
    if (activeStep.action_type === "choice") {
      return resolveChoiceMode(activeStep) === "sequential" ? "Next step" : "Per choice";
    }
    if (activeStep.is_end_step) return "END";
    const target = findStepByRef(activeStep.next_step_id);
    return formatStepLabel(target) ?? "Jump (missing target)";
  })();
  const failureLabel =
    activeStep?.action_type === "api"
      ? (() => {
        const target = findStepByRef(activeStep.failure_step_id);
        if (activeStep.failure_step_id && !target) return "Missing target";
        return formatStepLabel(target) ?? "None";
      })()
      : "-";
  const activeChoiceMode = resolveChoiceMode(activeStep);
  const templateMenu =
    activeStep?.template_source_id &&
    activeStep?.template?.placeholders &&
    typeof activeStep.template.placeholders === "object"
      ? ((activeStep.template.placeholders as any).menu as { sections?: TemplateMenuSection[] } | null)
      : null;
  const templateMenuSections = Array.isArray(templateMenu?.sections)
    ? (templateMenu.sections as TemplateMenuSection[])
    : [];
  const activeApi =
    activeStep?.api_id && typeof activeStep.api_id === "number"
      ? apis.find((api) => api.api_id === activeStep.api_id) ?? null
      : null;

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
          <Link href="/campaign" className={navLinkClass}>
            {backIcon}
            Back to campaigns
          </Link>
          <Link href={`/campaign/${id}`} className={navLinkClass}>
            {detailIcon}
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
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr className="text-xs text-muted-foreground">
                      <th className="px-2 py-2 text-left font-semibold w-12">Move</th>
                      <th className="px-3 py-2 text-left font-semibold">Step #</th>
                      <th className="px-3 py-2 text-left font-semibold">Prompt message</th>
                      <th className="px-3 py-2 text-left font-semibold">Input type</th>
                      <th className="px-3 py-2 text-left font-semibold">Action type</th>
                      <th className="px-3 py-2 text-left font-semibold">Guide / Choices</th>
                      <th className="px-3 py-2 text-left font-semibold">On success</th>
                      <th className="px-3 py-2 text-left font-semibold">On failure</th>
                    </tr>
                  </thead>
                  <SortableContext
                    items={steps.map((step) => step.local_id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <tbody>
                      {loading ? (
                        <tr>
                          <td colSpan={8} className="px-3 py-3 text-muted-foreground">
                            Loading...
                          </td>
                        </tr>
                      ) : null}
                      {!loading &&
                        steps.map((s, idx) => {
                          const messageMode = resolveMessageMode(s);
                          const stepTemplateId = s.template_source_id ?? null;
                          const selectedTemplate = activeTemplates.find(
                            (t) => getTemplateId(t) === stepTemplateId
                          );
                          const showInactiveTemplateOption =
                            messageMode === "template" && stepTemplateId && !selectedTemplate;
                          const apiForStep =
                            typeof s.api_id === "number"
                              ? apis.find((api) => api.api_id === s.api_id) || null
                              : null;

                          const isApiInactive =
                            apiForStep && apiForStep.is_active === false;

                          const choiceMode = resolveChoiceMode(s);
                          const isSequentialChoice = s.action_type === "choice" && choiceMode === "sequential";
                          const targetSteps = steps.filter((st) => st.local_id !== s.local_id);
                          const handleChoiceModeChange = (mode: "branch" | "sequential") => {
                            const patch: Partial<StepFormState> = { choice_mode: mode };
                            if (mode === "sequential") {
                              patch.is_end_step = false;
                              if (!s.next_step_id && targetSteps.length) {
                                const candidate = targetSteps[0];
                                patch.next_step_id = candidate.step_id || candidate.client_id || null;
                              }
                            } else {
                              patch.next_step_id = null;
                            }
                            updateStep(idx, patch);
                          };

                          return (
                            <SortableStepRow
                              key={s.local_id}
                              step={s}
                              index={idx}
                              isExpanded={expandedIndex === idx}
                              onToggle={() => setExpandedIndex(expandedIndex === idx ? null : idx)}
                              detailContent={
                                expandedIndex === idx ? (
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
                                    <div className="grid gap-3 md:grid-cols-2">
                                      <label className="space-y-1 text-sm font-medium">
                                        <span>Action type</span>
                                        <select
                                          className="w-full rounded border px-3 py-2"
                                          value={s.action_type}
                                          onChange={(e) => {
                                            const nextAction = e.target.value as ActionType;
                                            const nextInputType =
                                              nextAction === "input" ? s.input_type || "text" : null;
                                            const extra: Partial<CampaignStepWithChoices> = {
                                              api_id: nextAction === "api" ? s.api_id : null,
                                            };

                                            if (nextAction !== "api") {
                                              extra.failure_step_id = null;
                                              extra.error_message = null;
                                            }

                                            if (nextAction === "choice") {
                                              extra.next_step_id = null;
                                              extra.is_end_step = false;
                                              extra.choice_mode = "branch";
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

                                      {/* Step-level jump configuration (NOT for choice steps) */}
                                      {s.action_type !== "choice" ? (
                                        <div className="space-y-2 text-sm font-medium md:col-span-2">
                                          <span>On success</span>
                                          <div className="space-y-2 text-sm font-normal text-muted-foreground">
                                            <label className="inline-flex items-center gap-2">
                                              <input
                                                type="radio"
                                                name={`jump-mode-${idx}`}
                                                className="h-3 w-3"
                                                checked={!s.is_end_step}
                                                onChange={() => {
                                                  const firstTarget = steps.find(
                                                    (_step, sIdx) => sIdx !== idx
                                                  );
                                                  updateStep(idx, {
                                                    is_end_step: false,
                                                    next_step_id:
                                                      s.next_step_id ??
                                                      (firstTarget
                                                        ? firstTarget.step_id || firstTarget.client_id
                                                        : null),
                                                  });
                                                }}
                                              />
                                              <span>Jump to step</span>
                                            </label>
                                            {!s.is_end_step ? (
                                              <select
                                                className="w-full rounded border px-3 py-2"
                                                value={s.next_step_id ?? ""}
                                                onChange={(e) => {
                                                  const val = e.target.value ? Number(e.target.value) : null;
                                                  updateStep(idx, {
                                                    next_step_id: val,
                                                    is_end_step: false,
                                                  });
                                                }}
                                              >
                                                <option value="">Select a target step</option>
                                                {steps
                                                  .filter((st) => st.local_id !== s.local_id)
                                                  .map((st) => {
                                                    const value = st.step_id || st.client_id;
                                                    const labelText =
                                                      st.prompt_text?.trim() ||
                                                      st.step_code ||
                                                      "Untitled step";
                                                    return (
                                                      <option
                                                        key={`${st.local_id}-target`}
                                                        value={value}
                                                      >
                                                        {`Step ${st.step_number} – ${labelText}`}
                                                      </option>
                                                    );
                                                  })}
                                              </select>
                                            ) : null}
                                            <label className="inline-flex items-center gap-2">
                                              <input
                                                type="radio"
                                                name={`jump-mode-${idx}`}
                                                className="h-3 w-3"
                                                checked={!!s.is_end_step}
                                                onChange={() =>
                                                  updateStep(idx, {
                                                    is_end_step: true,
                                                    next_step_id: null,
                                                  })
                                                }
                                              />
                                              <span>End campaign</span>
                                            </label>
                                          </div>
                                        </div>
                                      ) : isSequentialChoice ? (
                                        <div className="space-y-2 text-sm font-medium md:col-span-2">
                                          <span>On success</span>
                                          <select
                                            className="w-full rounded border px-3 py-2"
                                            value={s.next_step_id ?? ""}
                                            onChange={(e) => {
                                              const val = e.target.value ? Number(e.target.value) : null;
                                              updateStep(idx, {
                                                next_step_id: val,
                                                is_end_step: false,
                                              });
                                            }}
                                            required
                                          >
                                            <option value="">Select a target step</option>
                                            {steps
                                              .filter((st) => st.local_id !== s.local_id)
                                              .map((st) => {
                                                const value = st.step_id || st.client_id;
                                                const labelText =
                                                  st.prompt_text?.trim() || st.step_code || "Untitled step";
                                                return (
                                                  <option key={`${st.local_id}-target`} value={value}>
                                                    {`Step ${st.step_number} – ${labelText}`}
                                                  </option>
                                                );
                                              })}
                                          </select>
                                          <p className="text-[11px] text-muted-foreground">
                                            Routing is handled by the step’s Next Step setting.
                                          </p>
                                        </div>
                                      ) : null}
                                    </div>

                                    <div className="space-y-2 rounded-md border px-3 py-2">
                                      <p className="text-sm font-semibold">Message source</p>
                                      <div className="flex flex-wrap gap-4 text-sm">
                                        <label className="inline-flex items-center gap-2">
                                          <input
                                            type="radio"
                                            name={`message-mode-${idx}`}
                                            className="h-3 w-3"
                                            checked={messageMode === "custom"}
                                            onChange={() =>
                                              updateStep(idx, { message_mode: "custom", template_source_id: null })
                                            }
                                          />
                                          <span>Custom message</span>
                                        </label>
                                        <label className="inline-flex items-center gap-2">
                                          <input
                                            type="radio"
                                            name={`message-mode-${idx}`}
                                            className="h-3 w-3"
                                            checked={messageMode === "template"}
                                            onChange={() => updateStep(idx, { message_mode: "template" })}
                                          />
                                          <span>Use template</span>
                                        </label>
                                      </div>

                                      {messageMode === "template" ? (
                                        <div className="space-y-2">
                                          <select
                                            className="w-full rounded border px-3 py-2"
                                            value={stepTemplateId ?? ""}
                                            onChange={async (e) => {
                                              const val = e.target.value;
                                              if (!val) {
                                                updateStep(idx, {
                                                  template_source_id: null,
                                                  message_mode: "custom",
                                                  prompt_text: "",
                                                  media_url: null,
                                                  error_message: null,
                                                });
                                                return;
                                              }
                                              const templateId = Number(val);
                                              if (Number.isNaN(templateId)) return;
                                              await handleApplyTemplateToStep(idx, templateId);
                                            }}
                                          >
                                            <option value="">
                                              {activeTemplates.length ? "Select a template" : "No active templates found"}
                                            </option>
                                            {showInactiveTemplateOption && stepTemplateId ? (
                                              <option value={stepTemplateId}>
                                                Template #{stepTemplateId} (inactive)
                                              </option>
                                            ) : null}
                                            {activeTemplates.map((t) => {
                                              const tid = getTemplateId(t);
                                              return (
                                                <option key={tid ?? t.title} value={tid ?? ""}>
                                                  {t.title} {tid ? `(ID ${tid})` : ""}
                                                </option>
                                              );
                                            })}
                                          </select>
                                          <p className="text-xs text-muted-foreground">
                                            Selecting a template copies its body and media into this step. You can
                                            still edit them for this campaign without affecting the original.
                                          </p>
                                        </div>
                                      ) : (
                                        <p className="text-xs text-muted-foreground">
                                          Write a custom message for this step. Switching modes keeps your current text
                                          and media.
                                        </p>
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
                                        <span>Allow input type</span>
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

                                    {isApiInactive && (
                                      <div className="md:col-span-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                        ⚠️ The API{" "}"
                                        <b>{apiForStep?.name ?? `#${s.api_id}`}</b>"{" "}
                                        is currently <b>disabled</b>.
                                        <br />
                                        This step will fail at runtime unless you select another API.
                                      </div>
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
                                            {steps.map((st, si) => {
                                              const value = st.step_id || st.client_id;
                                              return (
                                                <option
                                                  key={`fail-${st.local_id}`}
                                                  value={value}
                                                >
                                                  {`Step ${st.step_number} - ${st.step_code || st.prompt_text || "Step"}`}
                                                </option>
                                              );
                                            })}
                                          </select>
                                        </label>
                                        <label className="space-y-1 text-sm font-medium md:col-span-2">
                                          <span>Error message</span>
                                          <textarea
                                            className="w-full rounded border px-3 py-2 text-xs font-mono"
                                            rows={3}
                                            value={s.error_message ?? ""}
                                            onChange={(e) =>
                                              updateStep(idx, {
                                                error_message: e.target.value || null,
                                              })
                                            }
                                            placeholder="Shown when the user's input is invalid or not found (e.g. wrong city name)."
                                          />
                                          <p className="text-[11px] text-muted-foreground">
                                            Optional. Used only for <b>user input errors (4xx)</b>.
                                            System errors (API down, disabled, template issues) use automatic messages.
                                          </p>
                                        </label>
                                        <div className="md:col-span-2 space-y-2 text-sm">
                                          <p className="text-[11px] font-semibold text-muted-foreground">
                                            Response template (read-only)
                                          </p>
                                          {apiForStep?.response_template ? (
                                            <pre className="rounded bg-background px-2 py-1 text-[11px] whitespace-pre-wrap border">
                                              {apiForStep.response_template}
                                            </pre>
                                          ) : (
                                            <p className="text-xs text-muted-foreground">
                                              Select an API to preview its response template.
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    )}

                                    {s.action_type === "choice" && (
                                      <div className="space-y-4 border-t pt-3">
                                        <div className="space-y-3 rounded-lg border bg-muted/5 p-3 text-sm">
                                          <div className="font-semibold">Choice behavior</div>
                                          <div className="grid gap-2 text-left text-sm">
                                            <label
                                              className="flex cursor-pointer items-start gap-3 rounded border px-3 py-2"
                                              htmlFor={`choice-mode-branch-${idx}`}
                                            >
                                              <input
                                                id={`choice-mode-branch-${idx}`}
                                                type="radio"
                                                name={`choice-mode-${idx}`}
                                                value="branch"
                                                checked={choiceMode === "branch"}
                                                onChange={() => handleChoiceModeChange("branch")}
                                                className="mt-1 h-4 w-4"
                                              />
                                              <div>
                                                <span className="font-semibold">Branch by selected option</span>
                                                <p className="text-xs text-muted-foreground">
                                                  Each option can route to a different step.
                                                </p>
                                              </div>
                                            </label>
                                            <label
                                              className="flex cursor-pointer items-start gap-3 rounded border px-3 py-2"
                                              htmlFor={`choice-mode-seq-${idx}`}
                                            >
                                              <input
                                                id={`choice-mode-seq-${idx}`}
                                                type="radio"
                                                name={`choice-mode-${idx}`}
                                                value="sequential"
                                                checked={choiceMode === "sequential"}
                                                onChange={() => handleChoiceModeChange("sequential")}
                                                className="mt-1 h-4 w-4"
                                              />
                                              <div>
                                                <span className="font-semibold">Continue to next step</span>
                                                <p className="text-xs text-muted-foreground">
                                                  User selection is recorded, then flow continues automatically.
                                                </p>
                                              </div>
                                            </label>
                                          </div>
                                          <p className="text-[11px] text-muted-foreground">
                                            This controls how the campaign proceeds after the user makes a selection.
                                          </p>
                                        </div>
                                        {choiceMode === "branch" ? (
                                          <div className="space-y-3">
                                            <div className="flex items-center justify-between">
                                              <h4 className="text-sm font-semibold">Choices</h4>
                                              <button
                                                type="button"
                                                onClick={() => addChoice(idx)}
                                                className="text-xs rounded border px-2 py-1 hover:bg-muted disabled:opacity-60 disabled:cursor-not-allowed"
                                                disabled={(s.campaign_step_choice?.length ?? 0) >= 3}
                                              >
                                                Add choice
                                              </button>
                                            </div>
                                            <div className="space-y-3">
                                              {s.campaign_step_choice?.length ? (
                                                s.campaign_step_choice.map((choice, cidx) => (
                                                  <div
                                                    key={choice.choice_id || cidx}
                                                    className="rounded border p-3 space-y-2"
                                                  >
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
                                                        <span>Next step (within this campaign)</span>
                                                        <select
                                                          className={`w-full rounded border px-3 py-2 ${
                                                            isSequentialChoice
                                                              ? "cursor-not-allowed bg-muted/40 text-muted-foreground"
                                                              : ""
                                                          }`}
                                                          value={choice.next_step_id ?? ""}
                                                          onChange={(e) =>
                                                            updateChoice(idx, cidx, {
                                                              next_step_id: e.target.value ? Number(e.target.value) : null,
                                                            })
                                                          }
                                                          disabled={isSequentialChoice}
                                                          aria-disabled={isSequentialChoice}
                                                        >
                                                          <option value="">Select a target step</option>
                                                          {steps
                                                            .filter((st) => st.local_id !== s.local_id)
                                                            .map((st) => {
                                                              const value = st.step_id || st.client_id;
                                                              const labelText =
                                                                st.prompt_text?.trim() ||
                                                                st.step_code ||
                                                                "Untitled step";
                                                              return (
                                                                <option
                                                                  key={`${st.local_id}-choice-target`}
                                                                  value={value}
                                                                >
                                                                  {`Step ${st.step_number} – ${labelText}`}
                                                                </option>
                                                              );
                                                            })}
                                                        </select>
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
                                        ) : (
                                          <div className="rounded border bg-muted/5 px-3 py-2 text-sm text-muted-foreground space-y-1">
                                            <p className="font-semibold">
                                              Choices are defined by the template or user input.
                                            </p>
                                            <p>
                                              In sequential mode, the flow always continues to the configured next
                                              step.
                                            </p>
                                          </div>
                                        )}
                                      </div>
                                    )}

                                  </div>
                                ) : null
                              }
                            >
                              <>
                                <td className="px-3 py-2 font-semibold">{idx + 1}</td>
                                <td className="px-3 py-2 max-w-[240px]">
                                  <div className="font-medium truncate">{s.prompt_text || "-"}</div>
                                  <div className="text-xs text-muted-foreground truncate">
                                    {s.step_code || "No code"}
                                  </div>
                                  {isApiInactive && (
                                    <div className="mt-1 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                                      Disabled API
                                    </div>
                                  )}
                                  <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
                                      {s.template_source_id
                                        ? `From template (ID ${s.template_source_id}${s.template?.title ? ` - ${s.template.title}` : ""
                                        })`
                                        : "Custom"}
                                    </span>
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
                                    ? resolveChoiceMode(s) === "sequential"
                                      ? "Next step"
                                      : "Per choice"
                                    : s.is_end_step
                                      ? "END"
                                      : (() => {
                                        const target = findStepByRef(s.next_step_id);
                                        const label = formatStepLabel(target);
                                        return label ? `Jump (${label})` : "Jump (missing target)";
                                      })()}
                                </td>
                                <td className="px-3 py-2 text-muted-foreground">
                                  {(() => {
                                    if (s.action_type !== "api") return "-";
                                    if (!s.failure_step_id) return "None";
                                    const target = findStepByRef(s.failure_step_id);
                                    return formatStepLabel(target) ?? "Missing target";
                                  })()}
                                </td>

                              </>
                            </SortableStepRow>
                          );
                        })}
                      <tr className="border-t">
                        <td colSpan={8} className="px-3 py-3">
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
                  </SortableContext>
                </table>
              </DndContext>
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

              {activeStep.media_url?.trim() ? (() => {
                const mediaUrl = activeStep.media_url?.trim() || "";
                const isImage = looksLikeImage(mediaUrl);
                const isVideo = looksLikeVideo(mediaUrl);
                const isDoc = looksLikeDocument(mediaUrl);
                return (
                  <div className="space-y-2">
                    <div className="rounded-md overflow-hidden border bg-muted">
                      {isVideo ? (
                        <video
                          className="block w-full max-h-64 bg-black"
                          controls
                          playsInline
                          muted
                          preload="metadata"
                          src={mediaUrl}
                        />
                      ) : isImage ? (
                        <img
                          src={mediaUrl}
                          alt="Step media"
                          className="block w-full object-cover max-h-64"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = "none";
                            const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
                            if (fallback) fallback.style.display = "block";
                          }}
                        />
                      ) : (
                        <div className="p-3 text-xs text-muted-foreground">
                          <div className="font-semibold">Attachment</div>
                          <a
                            href={mediaUrl}
                            className="block truncate text-primary hover:underline"
                            target="_blank"
                            rel="noreferrer"
                          >
                            {mediaUrl}
                          </a>
                          <div className="text-[11px]">Preview shown as a link (non-media file).</div>
                        </div>
                      )}
                    </div>
                    {!isImage && !isVideo ? (
                      <div className="rounded-md border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                        <span className="block font-semibold">{isDoc ? "Document" : "Attachment"}</span>
                        <a
                          href={mediaUrl}
                          className="block truncate text-primary hover:underline"
                          target="_blank"
                          rel="noreferrer"
                        >
                          {mediaUrl}
                        </a>
                      </div>
                    ) : null}
                  </div>
                );
              })() : null}

              <div className="rounded-lg bg-background px-3 py-2 leading-relaxed shadow-sm text-sm space-y-1">
                {renderFormattedLines(activeStep.prompt_text, "No prompt yet.")}
              </div>

              {activeStep.action_type === "choice" && (
                <div className="space-y-2">
                  {activeChoiceMode === "branch" ? (
                    (activeStep.campaign_step_choice || []).length ? (
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
                    )
                  ) : (
                    <>
                      {templateMenuSections.length ? (
                        <div className="space-y-3 rounded-md border bg-muted/5 px-3 py-2 text-xs text-muted-foreground">
                      {templateMenuSections.map((section, secIdx) => {
                        const sectionTitle = (section?.title || "").trim();
                        const rows: TemplateMenuOption[] = Array.isArray(section?.options)
                          ? section.options
                          : Array.isArray(section?.rows)
                            ? section.rows
                            : [];
                        return (
                          <div key={`menu-section-${secIdx}`} className="space-y-1">
                            <p className="font-semibold text-foreground">
                                  {sectionTitle ? `[ ${sectionTitle} ]` : `[ Section ${secIdx + 1} ]`}
                                </p>
                                <ul className="list-disc space-y-1 pl-4 text-[11px] font-medium text-foreground">
                                  {rows.length
                                    ? rows.map((row: TemplateMenuOption, rowIdx: number) => {
                                        const label =
                                          (row?.title || row?.label || row?.name || "").trim() ||
                                          `Option ${rowIdx + 1}`;
                                        return <li key={`menu-row-${secIdx}-${rowIdx}`}>{label}</li>;
                                      })
                                    : (
                                      <li className="text-[11px] text-muted-foreground">
                                        No options defined.
                                      </li>
                                    )}
                                </ul>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Choices are defined by the template or user input.
                        </p>
                      )}
                      <p className="text-[11px] italic text-muted-foreground">
                        User selection will be recorded and the flow continues automatically.
                      </p>
                    </>
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
                <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground space-y-2">
                  <p>Calls API: {activeStep.api_id ? `#${activeStep.api_id}` : "Not selected"}</p>
                  <p>On failure: {failureLabel}</p>
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold text-muted-foreground">
                      Response template
                    </p>
                    {activeApi?.response_template ? (
                      <pre className="rounded bg-background px-2 py-1 text-[11px] whitespace-pre-wrap border">
                        {activeApi.response_template}
                      </pre>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">
                        This API has no response template configured.
                      </p>
                    )}
                  </div>
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

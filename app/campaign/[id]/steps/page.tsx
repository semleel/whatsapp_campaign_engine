// app/campaign/[id]/steps/page.tsx

"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Api } from "@/lib/client";
import { usePrivilege } from "@/lib/permissions";
import { showPrivilegeDenied, showCenteredAlert } from "@/lib/showAlert";

import type {
  CampaignWithStepsResponse,
  CampaignStepWithChoices,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

type StepRow = CampaignStepWithChoices;

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

// ---------------------------------------------------------------------------
// Sortable row (D3: simple handle + reorder)
// ---------------------------------------------------------------------------

type SortableRowProps = {
  step: StepRow;
  index: number;
  canUpdate: boolean;
  onDelete: (step: StepRow) => void;
};

function SortableStepRow({ step, index, canUpdate, onDelete }: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.step_id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const typeLabel = step.action_type || "message";
  const expectLabel = step.expected_input || "none";

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`border-t text-sm ${isDragging ? "bg-muted/60 shadow-sm" : "bg-background"
        }`}
    >
      {/* Drag handle */}
      <td className="w-8 pr-2 align-top">
        <button
          type="button"
          className="mt-1 cursor-grab text-slate-400 hover:text-slate-700"
          {...attributes}
          {...listeners}
          aria-label="Reorder step"
        >
          {/* simple grip icon */}
          <span className="inline-flex flex-col leading-none">
            <span className="block h-0.5 w-3 rounded bg-current mb-0.5" />
            <span className="block h-0.5 w-3 rounded bg-current mb-0.5" />
            <span className="block h-0.5 w-3 rounded bg-current" />
          </span>
        </button>
      </td>

      {/* Step number */}
      <td className="w-12 align-top text-xs text-muted-foreground">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[11px] font-semibold">
          {step.step_number}
        </span>
      </td>

      {/* Core info */}
      <td className="align-top">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-sm">
              {step.step_code || `Step ${step.step_number}`}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
              {typeLabel.toUpperCase()}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">
              Expect: {expectLabel}
            </span>
            {step.is_end_step && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                End step
              </span>
            )}
          </div>
          {step.prompt_text && (
            <p className="text-xs leading-snug text-slate-700 line-clamp-3 whitespace-pre-line">
              {step.prompt_text}
            </p>
          )}
        </div>
      </td>

      {/* Routing */}
      <td className="align-top text-xs text-muted-foreground">
        <div className="space-y-1">
          <div>
            <span className="font-semibold text-[11px] uppercase tracking-wide">
              On success:
            </span>{" "}
            {step.next_step_id
              ? `→ #${step.next_step_id}${step.next_step_number ? ` (step ${step.next_step_number})` : ""
              }`
              : step.is_end_step
                ? "End"
                : "Next step"}
          </div>
          {step.failure_step_id && (
            <div>
              <span className="font-semibold text-[11px] uppercase tracking-wide">
                On failure:
              </span>{" "}
              {`→ #${step.failure_step_id}${step.failure_step_number
                  ? ` (step ${step.failure_step_number})`
                  : ""
                }`}
            </div>
          )}
        </div>
      </td>

      {/* Meta & actions */}
      <td className="w-48 align-top text-right text-[11px] text-muted-foreground">
        {step.template_source_id && (
          <div className="mb-1">
            Template ID:{" "}
            <span className="font-mono text-[11px]">
              {step.template_source_id}
            </span>
          </div>
        )}
        <div>
          Last updated:{" "}
          <span className="font-medium">
            {formatDateTime(step.updatedat ?? null)}
          </span>
        </div>
        {canUpdate && (
          <div className="mt-2 flex justify-end gap-2 text-xs">
            {/* You can wire this to detail editor later */}
            <button
              type="button"
              className="rounded border px-2 py-1 hover:bg-muted"
              disabled
              title="Edit not wired yet – coming from the steps editor"
            >
              Edit
            </button>
            <button
              type="button"
              className="rounded border border-rose-200 px-2 py-1 text-rose-700 hover:bg-rose-50"
              onClick={() => onDelete(step)}
            >
              Delete
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CampaignStepsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const {
    canView,
    canUpdate,
    loading: privLoading,
  } = usePrivilege("campaigns");

  const [loading, setLoading] = useState(true);
  const [savingOrder, setSavingOrder] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [campaign, setCampaign] = useState<CampaignWithStepsResponse["campaign"] | null>(null);
  const [steps, setSteps] = useState<StepRow[]>([]);
  const [orderDirty, setOrderDirty] = useState(false);

  // DnD sensors (D3: simple pointer + keyboard)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Load data
  useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (privLoading) return;

      if (!canView) {
        setError("You do not have permission to view campaign steps.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const data = await Api.getCampaignWithSteps(id);
        if (!mounted) return;

        setCampaign(data.campaign || null);

        const sortedSteps = [...(data.steps ?? [])].sort(
          (a, b) => (a.step_number ?? 0) - (b.step_number ?? 0)
        );
        setSteps(sortedSteps);
        setOrderDirty(false);
      } catch (err: any) {
        if (!mounted) return;
        setError(err?.message || "Failed to load campaign steps.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();

    return () => {
      mounted = false;
    };
  }, [id, canView, privLoading]);

  const stepIds = useMemo(
    () => steps.map((s) => s.step_id),
    [steps]
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setSteps((prev) => {
      const oldIndex = prev.findIndex((s) => s.step_id === active.id);
      const newIndex = prev.findIndex((s) => s.step_id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;

      const reordered = arrayMove(prev, oldIndex, newIndex).map((step, idx) => ({
        ...step,
        step_number: idx + 1,
      }));
      return reordered;
    });
    setOrderDirty(true);
  };

  const handleSaveOrder = async () => {
    if (!canUpdate) {
      await showPrivilegeDenied({
        action: "update steps",
        resource: "Campaigns",
      });
      return;
    }
    if (!campaign) return;

    setSavingOrder(true);
    setError(null);

    try {
      await Api.saveCampaignStepsBulk(campaign.campaignid, steps);
      setOrderDirty(false);
      await showCenteredAlert("Step order saved successfully.");
    } catch (err: any) {
      setError(err?.message || "Failed to save step order.");
    } finally {
      setSavingOrder(false);
    }
  };

  const handleResetOrder = () => {
    // Just reload from backend
    router.refresh();
  };

  const handleDeleteStep = async (step: StepRow) => {
    if (!canUpdate) {
      await showPrivilegeDenied({
        action: "delete steps",
        resource: "Campaigns",
      });
      return;
    }
    if (!campaign) return;

    const ok = window.confirm(
      `Delete step ${step.step_number}? This cannot be undone.`
    );
    if (!ok) return;

    try {
      await Api.deleteCampaignStep(campaign.campaignid, step.step_id);
      setSteps((prev) =>
        prev
          .filter((s) => s.step_id !== step.step_id)
          .map((s, idx) => ({ ...s, step_number: idx + 1 }))
      );
      setOrderDirty(true);
    } catch (err: any) {
      setError(err?.message || "Failed to delete step.");
    }
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (!privLoading && !canView) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
        You do not have permission to view campaign steps.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground">
        Loading campaign steps…
      </div>
    );
  }

  if (error && !campaign) {
    return <div className="text-sm text-rose-600">{error}</div>;
  }

  if (!campaign) {
    return (
      <div className="text-sm text-muted-foreground">
        Campaign not found.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            Steps — {campaign.campaignname}
          </h2>
          <p className="text-xs text-muted-foreground">
            Drag to reorder steps. This follows style C table layout with simple
            DnD (D3).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {steps.length} steps
          </span>
          <span className="hidden sm:inline">
            Campaign ID:{" "}
            <span className="font-mono">{campaign.campaignid}</span>
          </span>
        </div>
      </div>

      {/* Actions bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-3 py-2">
        <div className="text-[11px] text-muted-foreground">
          Drag the handle on the left to change the order. The step number
          column will update after you drop.
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-md border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
            onClick={handleResetOrder}
            disabled={savingOrder}
          >
            Reload
          </button>
          <button
            type="button"
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
            onClick={handleSaveOrder}
            disabled={!orderDirty || savingOrder}
          >
            {savingOrder ? "Saving…" : orderDirty ? "Save order" : "Order up-to-date"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Steps table */}
      {steps.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          This campaign has no steps yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={stepIds}
              strategy={verticalListSortingStrategy}
            >
              <table className="min-w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="border-b bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="w-8 px-3 py-2 text-left">Order</th>
                    <th className="w-12 px-1 py-2 text-left">Step</th>
                    <th className="px-3 py-2 text-left">Content</th>
                    <th className="px-3 py-2 text-left">Routing</th>
                    <th className="w-48 px-3 py-2 text-right">Meta</th>
                  </tr>
                </thead>
                <tbody>
                  {steps.map((step, index) => (
                    <SortableStepRow
                      key={step.step_id}
                      step={step}
                      index={index}
                      canUpdate={!!canUpdate}
                      onDelete={handleDeleteStep}
                    />
                  ))}
                </tbody>
              </table>
            </SortableContext>
          </DndContext>
        </div>
      )}
    </div>
  );
}

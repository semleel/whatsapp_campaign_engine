// components/integration/InteractiveOptionsWizard.tsx

"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Api } from "@/lib/client";
import { cn } from "@/lib/utils";
import type { InteractionConfig } from "@/lib/types";

const STEP_TITLES = [
  "Preview API",
  "Pick list to show",
  "Remember selection as",
  "Summary",
] as const;
const MAX_SNIPPET_LENGTH = 1200;

type CandidateKind = "array" | "grouped";

type ArrayCandidate = {
  label: string;
  path: string;
  kind: CandidateKind;
  count: number;
  sampleKeys: string[];
};

const guessSaveToFromPath = (path: string) => {
  const segments = path ? path.split(".").filter(Boolean) : [];
  const base = segments.length ? segments[segments.length - 1] : "";
  if (!base) return "";
  const normalized = base
    .replace(/[^A-Za-z0-9_]/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  if (!normalized) return "";
  if (normalized.length > 1 && normalized.endsWith("s")) {
    return normalized.slice(0, -1);
  }
  return normalized;
};

const sanitizeSaveTo = (value: string) => {
  const replaced = value.replace(/\s+/g, "_");
  return replaced.replace(/[^A-Za-z0-9_]/g, "");
};

const isValidSaveTo = (value: string) => /^[A-Za-z][A-Za-z0-9_]*$/.test(value);

const computeConfigFromCount = (count: number): Pick<InteractionConfig, "type" | "max_items"> => {
  if (count <= 3) {
    return { type: "buttons", max_items: Math.max(1, Math.min(count, 3)) };
  }
  const maxItems = Math.min(count, 10);
  return { type: "menu", max_items: maxItems };
};

const isAllowedArrayItem = (item: unknown) =>
  typeof item === "string" ||
  typeof item === "number" ||
  (item !== null && typeof item === "object" && !Array.isArray(item));

const buildSampleKeys = (item: unknown): string[] => {
  if (item && typeof item === "object" && !Array.isArray(item)) {
    return Object.keys(item).slice(0, 5);
  }
  return ["value"];
};

const hasAllowedArrayItems = (arr: unknown[]): boolean =>
  arr.length === 0 || arr.every(isAllowedArrayItem);

const detectArrayCandidates = (data: unknown): ArrayCandidate[] => {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];

  const entries = Object.entries(data);
  const candidates: ArrayCandidate[] = [];

  entries.forEach(([key, value]) => {
    if (Array.isArray(value) && value.length > 0 && hasAllowedArrayItems(value)) {
      candidates.push({
        label: key,
        path: key,
        kind: "array",
        count: value.length,
        sampleKeys: buildSampleKeys(value[0]),
      });
      return;
    }

    if (value && typeof value === "object" && !Array.isArray(value)) {
      const childEntries = Object.entries(value);
      if (!childEntries.length) return;

      const allChildrenAreArrays = childEntries.every(
        ([, child]) => Array.isArray(child) && hasAllowedArrayItems(child as unknown[])
      );
      if (!allChildrenAreArrays) return;

      const totalCount = childEntries.reduce((sum, [, child]) => {
        if (Array.isArray(child)) {
          return sum + child.length;
        }
        return sum;
      }, 0);
      if (totalCount === 0) return;

      const sampleArrayEntry = childEntries.find(
        ([, child]) => Array.isArray(child) && child.length > 0
      );
      if (!sampleArrayEntry) return;

      const sampleArray = sampleArrayEntry[1] as unknown[];
      const sampleItem = sampleArray[0];

      candidates.push({
        label: key,
        path: key,
        kind: "grouped",
        count: totalCount,
        sampleKeys: buildSampleKeys(sampleItem),
      });
    }
  });

  return candidates;
};

type InteractiveOptionsWizardProps = {
  open: boolean;
  onClose: () => void;
  apiId: number | null;
  initial?: InteractionConfig | null;
  onApply: (config: InteractionConfig) => void;
  initialStepIndex?: number;
  onStepChange?: (index: number) => void;
  onPreviewCandidate?: (meta: { response_path: string; count: number }) => void;
};

export default function InteractiveOptionsWizard({
  open,
  onClose,
  apiId,
  initial,
  onApply,
  initialStepIndex,
  onStepChange,
  onPreviewCandidate,
}: InteractiveOptionsWizardProps) {
  const [internalOpen, setInternalOpen] = useState(open);
  const [currentStep, setCurrentStep] = useState(initialStepIndex ?? 0);
  const [previewData, setPreviewData] = useState<unknown | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [responseSnippet, setResponseSnippet] = useState("");
  const [selectedCandidate, setSelectedCandidate] = useState<ArrayCandidate | null>(null);
  const [saveTo, setSaveTo] = useState(initial?.save_to ?? "");
  const [saveToError, setSaveToError] = useState<string | null>(null);

  const candidates = useMemo(() => detectArrayCandidates(previewData), [previewData]);
  const suggestion = selectedCandidate
    ? guessSaveToFromPath(selectedCandidate.path)
    : initial?.response_path
      ? guessSaveToFromPath(initial.response_path)
      : "";

  const computedValues = selectedCandidate
    ? computeConfigFromCount(selectedCandidate.count)
    : initial && typeof initial.max_items === "number"
      ? { type: initial.type, max_items: initial.max_items }
      : { type: "menu" as const, max_items: 3 };

  const showTruncatedHint = selectedCandidate ? selectedCandidate.count > 10 : false;

  useEffect(() => {
    if (open !== internalOpen) {
      setInternalOpen(open);
    }
  }, [open, internalOpen]);

  useEffect(() => {
    if (initial?.save_to) {
      setSaveTo(initial.save_to);
      setSaveToError(
        isValidSaveTo(initial.save_to) ? null : "Key must start with a letter and only include letters, numbers, and _."
      );
    } else {
      setSaveTo("");
      setSaveToError("Key must start with a letter and only include letters, numbers, and _.");
    }
  }, [initial?.save_to, open]);

  useEffect(() => {
    if (internalOpen) {
      setCurrentStep(initialStepIndex ?? 0);
    }
  }, [internalOpen, initialStepIndex]);

  useEffect(() => {
    onStepChange?.(currentStep);
  }, [currentStep, onStepChange]);

  useEffect(() => {
    if (!previewData) {
      setSelectedCandidate(null);
      return;
    }
    if (initial?.response_path) {
      const match = candidates.find((candidate) => candidate.path === initial.response_path);
      if (match) {
        setSelectedCandidate(match);
        return;
      }
    }
    setSelectedCandidate((prev) => (prev && candidates.some((c) => c.path === prev.path) ? prev : null));
  }, [candidates, initial?.response_path, previewData]);

  useEffect(() => {
    if (!apiId) {
      setPreviewData(null);
      setResponseSnippet("");
      setPreviewError(null);
      setSelectedCandidate(null);
    }
  }, [apiId]);

  const handleOpenChange = (value: boolean) => {
    setInternalOpen(value);
    if (!value) {
      onClose();
    }
  };

  const runPreview = async () => {
    if (!apiId) {
      setPreviewError("Select an API to run preview.");
      return;
    }
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const response = await Api.previewApi(apiId);
      const payload =
        response?.data?.response ?? null;
      setPreviewData(payload);
      const snippet =
        typeof payload === "string"
          ? payload
          : JSON.stringify(payload, null, 2);
      const trimmed =
        snippet.length > MAX_SNIPPET_LENGTH
          ? `${snippet.slice(0, MAX_SNIPPET_LENGTH)}\n... (preview truncated)`
          : snippet;
      setResponseSnippet(trimmed);
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : "Failed to fetch preview.");
      setPreviewData(null);
      setResponseSnippet("");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSelectCandidate = (candidate: ArrayCandidate) => {
    setSelectedCandidate(candidate);
  };

  const handleSaveToChange = (value: string) => {
    const clean = sanitizeSaveTo(value);
    setSaveTo(clean);
    setSaveToError(
      clean
        ? isValidSaveTo(clean)
          ? null
          : "Key must start with a letter and only include letters, numbers, and _."
        : "Key must start with a letter and only include letters, numbers, and _."
    );
  };

  const handleNext = () => {
    if (currentStep < STEP_TITLES.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const canProceed = () => {
    if (currentStep === 0) {
      return Boolean(previewData);
    }
    if (currentStep === 1) {
      return Boolean(selectedCandidate);
    }
    if (currentStep === 2) {
      return Boolean(saveTo) && !saveToError;
    }
    return true;
  };

  const handleApply = () => {
    if (!selectedCandidate) return;
    if (!saveTo || saveToError) {
      setSaveToError("Key must start with a letter and only include letters, numbers, and _.");
      return;
    }
    const config: InteractionConfig = {
      type: computedValues.type,
      max_items: computedValues.max_items,
      response_path: selectedCandidate.path,
      save_to: saveTo,
    };
    onPreviewCandidate?.({ response_path: selectedCandidate.path, count: selectedCandidate.count });
    onApply(config);
    setInternalOpen(false);
    onClose();
  };

  const renderStepContent = () => {
    if (currentStep === 0) {
      return (
        <div className="space-y-3">
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">
              Run a live preview of the linked API to detect lists that can be converted into interactive options.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="default"
                onClick={runPreview}
                disabled={!apiId || previewLoading}
                className="flex-1 max-w-xs"
              >
                {previewLoading ? "Running preview..." : "Run API preview"}
              </Button>
              {!apiId && (
                <span className="text-xs text-rose-600">Select an API on the step to preview.</span>
              )}
              {previewData !== null && !previewLoading && (
                <span className="text-xs font-semibold text-emerald-600">Preview ready</span>
              )}
            </div>
          </div>
          {previewError && (
            <div className="rounded border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {previewError}
            </div>
          )}
          <div className="rounded-lg border bg-muted/10 p-3 text-xs font-mono">
            <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap">{responseSnippet || "No preview yet."}</pre>
          </div>
          <p className="text-[11px] text-muted-foreground">
            The preview response is trimmed for readability and limited to avoid very large payloads.
          </p>
        </div>
      );
    }

    if (currentStep === 1) {
      return (
        <div className="space-y-3">
          {candidates.length ? (
            <div className="grid gap-3">
              {candidates.map((candidate) => (
                <button
                  key={candidate.path || candidate.label}
                  type="button"
                  onClick={() => handleSelectCandidate(candidate)}
                  className={cn(
                    "flex flex-col border rounded-lg p-3 text-left transition hover:border-primary/80",
                    selectedCandidate?.path === candidate.path
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border bg-background"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {candidate.label}
                    </span>
                    {candidate.kind === "grouped" && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                        Grouped menu
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    Path: {candidate.path || "(root)"} (items: {candidate.count})
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Sample keys: {candidate.sampleKeys.join(", ")}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {previewData
                ? "No top-level arrays or grouped menus detected. Confirm that the API returns a list or grouped object at the root."
                : "Run the preview first to detect top-level arrays."}
            </p>
          )}
          <p className="text-[11px] text-muted-foreground">
            Only first-level arrays and grouped menus are shown. Choose one to surface as WhatsApp options.
          </p>
        </div>
      );
    }

    if (currentStep === 2) {
      return (
        <div className="space-y-3">
          <label className="block text-sm font-medium">
            Save user selection as
            <input
              type="text"
              value={saveTo}
              onChange={(event) => handleSaveToChange(event.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 font-mono text-sm"
              placeholder="e.g. facility or time_slot"
            />
          </label>
          {saveToError && (
            <p className="text-xs text-rose-600">{saveToError}</p>
          )}
          {suggestion && (
            <button
              type="button"
              onClick={() => handleSaveToChange(suggestion)}
              className="text-xs text-primary underline-offset-4 hover:underline"
            >
              Use suggestion: {suggestion}
            </button>
          )}
          <p className="text-xs text-muted-foreground">
            This key will be available in session variables as{" "}
            <code className="font-mono text-[11px]">{`{{ session.${saveTo || "<key>"} }`}</code>.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <div className="space-y-2 rounded-lg border border-border bg-muted/5 p-3">
          <p className="text-[11px] text-muted-foreground">Shows</p>
          <p className="font-semibold">{selectedCandidate ? selectedCandidate.path || "(root)" : "Not set"}</p>
          <p className="text-[11px] text-muted-foreground">Saves as</p>
          <p className="font-semibold">{saveTo || "Not set"}</p>
          <p className="text-[11px] text-muted-foreground">Mode</p>
          <p className="font-semibold">{computedValues.type === "buttons" ? "Buttons (auto)" : "Menu (auto)"}</p>
        </div>
        {showTruncatedHint && (
          <p className="text-[11px] text-amber-600">Only first 10 will be shown in WhatsApp.</p>
        )}
        <details className="rounded border border-border bg-background/80 p-3 text-sm" open>
          <summary className="font-semibold text-xs uppercase text-muted-foreground">
            Advanced (optional)
          </summary>
          <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
            <div>Type: {computedValues.type}</div>
            <div>Max items: {computedValues.max_items}</div>
          </div>
        </details>
      </div>
    );
  };

  return (
    <Dialog open={internalOpen} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Interactive options wizard</DialogTitle>
          <DialogDescription>
            Convert your API response into WhatsApp buttons or a menu without touching JSON paths.
          </DialogDescription>
        </DialogHeader>
        <div className="mb-4 grid gap-2 text-[11px] text-muted-foreground">
          {STEP_TITLES.map((label, idx) => (
            <div
              key={label}
              className={cn(
                "rounded-full border px-3 py-1 text-center",
                currentStep === idx
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background"
              )}
            >
              Step {idx + 1}: {label}
            </div>
          ))}
        </div>
        <div className="space-y-4">{renderStepContent()}</div>
        <DialogFooter className="mt-6 flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 0}
            className="min-w-[100px]"
          >
            Back
          </Button>
          {currentStep < STEP_TITLES.length - 1 ? (
            <Button variant="default" onClick={handleNext} disabled={!canProceed()} className="min-w-[100px]">
              Next
            </Button>
          ) : (
            <Button variant="default" onClick={handleApply} disabled={!canProceed()}>
              Apply
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => {
              setInternalOpen(false);
              onClose();
            }}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

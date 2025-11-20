"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { showCenteredAlert, showCenteredConfirm } from "@/lib/showAlert";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3000";

// ------------------------------
// Types
// ------------------------------

type ButtonItem = {
  id: string;
  type: "visit_website" | "call_phone" | "quick_reply";
  label: string;
  url?: string;
  phone?: string;
};

type TemplateCategory =
  | "Marketing"
  | "Utility"
  | "Authentication"
  | string
  | null;

type TemplateData = {
  contentid: number;
  title: string;
  type: string;
  status: string;
  lang: string;
  category: TemplateCategory;
  body: string;
  description?: string | null;
  footerText?: string | null;
  mediaurl?: string | null;
  expiresat?: string | null;
  placeholders?: Record<string, unknown> | null;
  tags: string[];
  buttons: ButtonItem[];
  headerType?: "none" | "text" | "media";
  headerText?: string | null;
  headerMediaType?: "image" | "video" | "document";
  isdeleted?: boolean | null;
};

const TEMPLATE_CATEGORY_OPTIONS: {
  value: TemplateCategory;
  label: string;
  subtitle: string;
  icon: string;
}[] = [
    {
      value: "Marketing",
      label: "Marketing",
      subtitle: "One-to-many bulk broadcast marketing messages",
      icon: "📣",
    },
    {
      value: "Utility",
      label: "Utility",
      subtitle: "Transactional updates triggered by a user action",
      icon: "🔔",
    },
    {
      value: "Authentication",
      label: "Authentication",
      subtitle: "One-time passwords and login verification",
      icon: "🔐",
    },
  ];

const SUPPORTED_LOCALES = [
  { value: "en", label: "English" },
  { value: "my", label: "Bahasa Melayu" },
  { value: "cn", label: "Chinese" },
];

function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

// Small helpers for modals
type ConfirmState = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
};

type FeedbackState = {
  open: boolean;
  title: string;
  message?: string;
  variant?: "success" | "error" | "confirm";
  primaryLabel?: string;
  secondaryLabel?: string;
  onPrimary?: () => void;
  onSecondary?: () => void;
};

// ------------------------------
// Component
// ------------------------------

function toDateTimeLocal(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 16);
}

export default function EditTemplatePage() {
  const params = useParams();
  const router = useRouter();
  const templateId = useMemo(
    () => (params?.id ? Number(params.id) : NaN),
    [params]
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<TemplateData>({
    contentid: 0,
    title: "",
    type: "message",
    status: "Draft",
    lang: "en",
    category: "Marketing",
    body: "",
    description: "",
    footerText: "",
    mediaurl: null,
    expiresat: "",
    placeholders: null,
    tags: [],
    buttons: [],
    headerType: "none",
    headerText: "",
    headerMediaType: "image",
    isdeleted: null,
  });

  // Tags input
  const [tagInput, setTagInput] = useState("");

  // Modal states
  const [confirm, setConfirm] = useState<ConfirmState>({
    open: false,
    title: "",
    message: "",
    confirmLabel: "Confirm",
    cancelLabel: "Cancel",
  });

  const [feedback, setFeedback] = useState<FeedbackState>({
    open: false,
    title: "",
    message: "",
  });

  const openConfirm = (cfg: Partial<ConfirmState>) => {
    setConfirm({
      open: true,
      title: cfg.title || "Are you sure?",
      message: cfg.message || "",
      confirmLabel: cfg.confirmLabel || "Confirm",
      cancelLabel: cfg.cancelLabel || "Cancel",
      onConfirm: cfg.onConfirm,
    });
  };

  const closeConfirm = () =>
    setConfirm((s) => ({
      ...s,
      open: false,
    }));

  const openFeedback = (cfg: Partial<FeedbackState>) => {
    setFeedback({
      open: true,
      title: cfg.title || "",
      message: cfg.message || "",
      primaryLabel: cfg.primaryLabel || "OK",
      secondaryLabel: cfg.secondaryLabel,
      onPrimary: cfg.onPrimary,
      onSecondary: cfg.onSecondary,
    });
  };

  const closeFeedback = () =>
    setFeedback((s) => ({
      ...s,
      open: false,
    }));

  // ------------------------------
  // Load template
  // ------------------------------

  useEffect(() => {
    if (!templateId) return;

    const load = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${API_BASE}/api/template/${templateId}`);
        if (!res.ok) throw new Error("Failed to load template");

        const data = await res.json();

        const isdeleted: boolean | null = data.isdeleted ?? null;
        const placeholders =
          (data.placeholders as Record<string, unknown> | null) || null;

        const headerType: TemplateData["headerType"] =
          data.headerType ||
          (placeholders?.headerType as TemplateData["headerType"]) ||
          (data.mediaurl ? "media" : "none");

        const headerText: string =
          data.headerText ||
          (placeholders?.headerText as string | null) ||
          "";

        const headerMediaType: TemplateData["headerMediaType"] =
          data.headerMediaType ||
          (placeholders?.headerMediaType as TemplateData["headerMediaType"]) ||
          "image";

        const footerText: string =
          data.footertext ||
          (placeholders?.footerText as string | null) ||
          "";

        const buttons: ButtonItem[] =
          data.buttons ||
          ((placeholders?.buttons as ButtonItem[] | undefined) ?? []);

        setForm({
          contentid: data.contentid,
          title: data.title || "",
          type: data.type,
          status: data.status,
          lang: (data.lang || data.defaultlang || "en")?.trim() || "en",
          category: data.category || "Marketing",
          body: data.body || data.description || "",
          description: data.description || "",
          footerText,
          mediaurl: data.mediaurl || null,
          expiresat: data.expiresat || "",
          placeholders,
          tags: data.tags ?? [],
          buttons,
          headerType,
          headerText,
          headerMediaType,
          isdeleted,
        });
      } catch (e: any) {
        console.error(e);
        setError(e.message || "Error loading template");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [templateId]);

  // ------------------------------
  // Buttons helpers
  // ------------------------------

  const addButton = (type: ButtonItem["type"]) => {
    setForm((prev) => ({
      ...prev,
      buttons: [
        ...(prev.buttons || []),
        {
          id: generateId(),
          type,
          label:
            type === "visit_website"
              ? "Visit website"
              : type === "call_phone"
                ? "Call now"
                : "Quick reply",
          url: type === "visit_website" ? "" : undefined,
          phone: type === "call_phone" ? "" : undefined,
        },
      ],
    }));
  };

  const updateButton = (id: string, changes: Partial<ButtonItem>) => {
    setForm((prev) => ({
      ...prev,
      buttons: prev.buttons!.map((btn) =>
        btn.id === id ? { ...btn, ...changes } : btn
      ),
    }));
  };

  const removeButton = (id: string) => {
    setForm((prev) => ({
      ...prev,
      buttons: prev.buttons!.filter((btn) => btn.id !== id),
    }));
  };

  // ------------------------------
  // Tags helpers
  // ------------------------------

  const addTags = () => {
    const tagList = tagInput
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (!tagList.length) return;

    setForm((prev) => ({
      ...prev,
      tags: [...(prev.tags || []), ...tagList],
    }));
    setTagInput("");
  };

  const removeTag = (name: string) => {
    setForm((prev) => ({
      ...prev,
      tags: prev.tags!.filter((t) => t !== name),
    }));
  };

  // ------------------------------
  // Save / Archive / Recover
  // ------------------------------

  const doSave = async () => {
    if (!form.title.trim()) {
      await showCenteredAlert("Title is required");
      openFeedback({
        title: "Missing title",
        message: "Please provide a title before saving the template.",
      });
      return;
    }

    setSaving(true);
    try {
      const finalMediaUrl =
        form.headerType === "media" && form.mediaurl?.trim()
          ? form.mediaurl.trim()
          : null;

      const expiresAtIso = form.expiresat
        ? new Date(form.expiresat).toISOString()
        : null;

      const placeholderData = {
        footerText: form.footerText || null,
        headerText: form.headerType === "text" ? form.headerText || "" : null,
        headerType: form.headerType,
        headerMediaType:
          form.headerType === "media" ? form.headerMediaType : null,
        buttons: form.buttons,
      };

      const payload = {
        ...form,
        status: form.status,
        lang: form.lang,
        body: form.body,
        description: form.description || form.body || null,
        mediaurl: finalMediaUrl,
        expiresat: expiresAtIso,
        footerText: placeholderData.footerText,
        headerText: placeholderData.headerText,
        headerType: placeholderData.headerType,
        headerMediaType: placeholderData.headerMediaType,
        buttons: placeholderData.buttons,
        placeholders: {
          ...(form.placeholders || {}),
          ...placeholderData,
        },
      };

      const res = await fetch(
        `${API_BASE}/api/template/${form.contentid}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) throw new Error("Failed to update template");

      await showCenteredAlert("Template updated successfully!");
    } catch (e: any) {
      await showCenteredAlert(e.message);
      openFeedback({
        title: "Template saved",
        message: "Your changes have been saved successfully.",
        primaryLabel: "Back to library",
        secondaryLabel: "Continue editing",
        onPrimary: () => {
          closeFeedback();
          router.push("/content/templates");
        },
        onSecondary: () => {
          closeFeedback();
        },
      });
    } catch (e: any) {
      console.error(e);
      openFeedback({
        title: "Save failed",
        message: e.message || "Unable to save this template.",
      });
    } finally {
      setSaving(false);
    }
  };

  // ----------------------------
  // SOFT DELETE HANDLER
  // ----------------------------
  const handleSoftDelete = async () => {
    const confirmed = await showCenteredConfirm("Are you sure you want to delete this template?");
    if (!confirmed) return;
    const doDelete = async () => {
      setSaving(true);

      try {
        const res = await fetch(
          `${API_BASE}/api/template/${form.contentid}/delete`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          }
        );

        const bodyText = await res.text();

        if (!res.ok) {
          openFeedback({
            title: "Delete failed",
            message:
              `Server response: ${res.status} ${res.statusText}\n` +
              (bodyText || ""),
            variant: "error",
            primaryLabel: "Close",
          });
          return;
        }

        setForm((prev) => ({ ...prev, isdeleted: true }));

        openFeedback({
          title: "Template archived",
          message:
            "This template has been archived and will no longer appear in the main library.",
          variant: "success",
          primaryLabel: "Back to library",
          onPrimary: () => router.push("/content/templates"),
        });

        if (!res.ok) throw new Error("Delete failed");

        await showCenteredAlert("Template deleted.");
        router.push("/content/templates");
      } catch (e: any) {
        await showCenteredAlert(e.message);
      } catch (err: any) {
        openFeedback({
          title: "Delete failed",
          message: err instanceof Error ? err.message : String(err),
          variant: "error",
          primaryLabel: "Close",
        });
      } finally {
        setSaving(false);
      }
    };

    const doRecover = async () => {
      setSaving(true);
      try {
        const res = await fetch(
          `${API_BASE}/api/template/${form.contentid}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isdeleted: false }),
          }
        );

        if (!res.ok) {
          const txt = await res.text();
          throw new Error(txt || "Failed to recover template");
        }

        setForm((prev) => ({ ...prev, isdeleted: false }));

        openFeedback({
          title: "Template recovered",
          message: "This template is now active again in the library.",
          variant: "success",
          primaryLabel: "Back to library",
          secondaryLabel: "Stay here",
          onPrimary: () => router.push("/content/templates"),
        });
      } catch (err: any) {
        openFeedback({
          title: "Recover failed",
          message: err instanceof Error ? err.message : String(err),
          variant: "error",
          primaryLabel: "Close",
        });
      } finally {
        setSaving(false);
      }
    };

    const handleSaveClick = () => {
      openConfirm({
        title: "Save changes?",
        message:
          "Are you sure you want to save the changes made to this template?",
        confirmLabel: "Save",
        cancelLabel: "Cancel",
        onConfirm: () => {
          closeConfirm();
          void doSave();
        },
      });
    };

    const handleCancelClick = () => {
      openConfirm({
        title: "Discard changes?",
        message: "Any unsaved changes will be lost if you leave this page.",
        confirmLabel: "Discard",
        cancelLabel: "Stay",
        onConfirm: () => {
          closeConfirm();
          router.push("/content/templates");
        },
      });
    };

    const handleDeleteClick = () => {
      if (form.isdeleted) return;

      openConfirm({
        title: "Archive template?",
        message:
          "This will archive the template so it no longer appears in the main library. You can recover it later.",
        confirmLabel: "Archive",
        cancelLabel: "Cancel",
        onConfirm: () => {
          closeConfirm();
          void doDelete();
        },
      });
    };

    const handleRecoverClick = () => {
      openConfirm({
        title: "Recover template?",
        message:
          "This will restore the template so it appears again in the library.",
        confirmLabel: "Recover",
        cancelLabel: "Cancel",
        onConfirm: () => {
          closeConfirm();
          void doRecover();
        },
      });
    };

    // ------------------------------
    // UI: loading / error
    // ------------------------------

    if (loading)
      return <div className="p-6 text-center text-sm">Loading...</div>;
    if (error)
      return (
        <div className="p-6 text-center text-sm text-red-500">{error}</div>
      );

    // ------------------------------
    // Render
    // ------------------------------

    return (
      <div className="space-y-6">
        {/* Header Row */}
        <div className="flex justify-between">
          <div>
            <h1 className="text-lg font-semibold">Edit Template: {form.title}</h1>
            <p className="text-sm text-muted-foreground">
              Modify template metadata.
            </p>
          </div>

          <Link
            href="/content/templates"
            className="text-sm text-primary hover:underline"
          >
            Back to library
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          {/* LEFT FORM */}
          <form
            id="edit-template-form"
            className="border rounded-xl p-6 space-y-6 bg-card"
          >
            {/* Title & Type */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="text-sm space-y-1">
                <span className="font-medium">Title</span>
                <input
                  className="w-full border rounded px-3 py-2"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </label>

              <label className="text-sm space-y-1">
                <span className="font-medium">Type</span>
                <select
                  className="w-full border rounded px-3 py-2"
                  value={form.type}
                  onChange={(e) =>
                    setForm({ ...form, type: e.target.value as string })
                  }
                >
                  <option value="message">Message</option>
                  <option value="media">Media</option>
                  <option value="flow">Flow</option>
                </select>
              </label>
            </div>

            {/* Status + Language row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="text-sm space-y-1">
                <span className="font-medium">Status</span>
                <select
                  className="w-full border rounded px-3 py-2"
                  value={form.status}
                  onChange={(e) =>
                    setForm({ ...form, status: e.target.value as string })
                  }
                >
                  <option value="Draft">Draft</option>
                  <option value="Active">Active</option>
                  <option value="Archived">Archived</option>
                </select>
              </label>

              <label className="text-sm space-y-1">
                <span className="font-medium">Language</span>
                <select
                  className="w-full border rounded px-3 py-2"
                  value={form.lang}
                  onChange={(e) =>
                    setForm({ ...form, lang: e.target.value as string })
                  }
                >
                  {SUPPORTED_LOCALES.map((loc) => (
                    <option key={loc.value} value={loc.value}>
                      {loc.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Category row – WANotifier-style cards */}
            <div className="mt-4 text-sm">
              <span className="font-medium block mb-1">Category</span>
              <p className="text-xs text-muted-foreground mb-3">
                Choose what type of message this template is used for.
              </p>

              <div className="grid gap-3 md:grid-cols-3">
                {TEMPLATE_CATEGORY_OPTIONS.map((opt) => {
                  const isSelected =
                    (form.category || "").toString().toLowerCase() ===
                    (opt.value || "").toString().toLowerCase();

                  return (
                    <button
                      key={opt.value || opt.label}
                      type="button"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          category: opt.value,
                        }))
                      }
                      className={[
                        "flex h-full flex-col items-start rounded-xl border bg-white px-3 py-3 text-left text-xs transition",
                        "hover:border-primary/60 hover:bg-primary/5",
                        isSelected
                          ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/30"
                          : "border-border",
                      ].join(" ")}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-lg">
                          {opt.icon}
                        </span>
                        <span className="font-semibold text-sm">{opt.label}</span>
                      </div>
                      <p className="text-[11px] leading-snug text-muted-foreground">
                        {opt.subtitle}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* TAGS – directly under Category */}
            <div className="border-t pt-4 mt-4 space-y-3">
              <h4 className="font-semibold text-sm">Tags</h4>

              <div className="flex flex-wrap gap-2">
                {form.tags?.map((t) => (
                  <span
                    key={t}
                    className="px-2 py-1 bg-muted border rounded-full text-xs flex items-center gap-2"
                  >
                    {t}
                    <button
                      type="button"
                      className="text-red-500"
                      onClick={() => removeTag(t)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>

              <div className="flex gap-2">
                <input
                  className="border rounded px-3 py-2 flex-1"
                  placeholder="Add tags (press Enter or click Add)..."
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTags();
                    }
                  }}
                />

                <button
                  type="button"
                  className="border rounded px-3 py-2 text-sm"
                  onClick={addTags}
                >
                  Add
                </button>
              </div>
            </div>

            {/* EXPIRY – right under Tags */}
            <div className="border-t pt-4 space-y-2">
              <h4 className="text-sm font-semibold">Expiry</h4>
              <input
                type="datetime-local"
                className="border rounded px-3 py-2"
                value={
                  form.expiresat
                    ? new Date(form.expiresat).toISOString().slice(0, 16)
                    : ""
                }
                onChange={(e) =>
                  setForm({ ...form, expiresat: e.target.value })
                }
              />
            </div>

            {/* HEADER SECTION */}
            <div className="border-t pt-4 space-y-3">
              <h4 className="font-semibold text-sm">
                Header{" "}
                <span className="text-xs text-muted-foreground">(Optional)</span>
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="text-sm space-y-1">
                  <span className="font-medium">Header Type</span>
                  <select
                    className="w-full border rounded px-3 py-2"
                    value={form.headerType}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        headerType: e.target.value as "none" | "text" | "media",
                      })
                    }
                  >
                    <option value="none">None</option>
                    <option value="text">Text</option>
                    <option value="media">Media</option>
                  </select>
                </label>

                {form.headerType === "media" && (
                  <label className="text-sm space-y-1">
                    <span className="font-medium">Media Type</span>
                    <select
                      className="w-full border rounded px-3 py-2"
                      value={form.headerMediaType}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          headerMediaType: e.target.value as
                            | "image"
                            | "video"
                            | "document",
                        })
                      }
                    >
                      <option value="image">Image</option>
                      <option value="video">Video</option>
                      <option value="document">Document</option>
                    </select>
                  </label>
                )}
              </div>

              {form.headerType === "text" && (
                <label className="text-sm block space-y-1">
                  <span className="font-medium">Header Text</span>
                  <input
                    className="w-full border rounded px-3 py-2"
                    value={form.headerText || ""}
                    onChange={(e) =>
                      setForm({ ...form, headerText: e.target.value })
                    }
                  />
                </label>
              )}

              {form.headerType === "media" && (
                <label className="text-sm block space-y-1">
                  <span className="font-medium">Header media URL</span>
                  <input
                    type="url"
                    className="w-full border rounded px-3 py-2"
                    placeholder="https://example.com/image.jpg"
                    value={form.mediaurl || ""}
                    onChange={(e) =>
                      setForm({ ...form, mediaurl: e.target.value })
                    }
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Provide a public URL to an image / media that will be rendered
                    above the message. Only URL is stored, no local file upload.
                  </p>
                </label>
              )}
            </div>

            {/* BODY */}
            <label className="text-sm border-t pt-4 block space-y-1">
              <span className="font-medium">Body</span>
              <textarea
                className="w-full border rounded px-3 py-2 min-h-32"
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
              />
            </label>

            {/* FOOTER */}
            <div className="border-t pt-4 space-y-2">
              <h4 className="font-semibold text-sm">
                Footer{" "}
                <span className="text-xs text-muted-foreground">(Optional)</span>
              </h4>
              <input
                className="w-full border rounded px-3 py-2"
                value={form.footerText || ""}
                onChange={(e) =>
                  setForm({ ...form, footerText: e.target.value })
                }
              />
            </div>

            {/* BUTTONS */}
            <div className="border-t pt-4 space-y-3">
              <h4 className="font-semibold text-sm">
                Buttons{" "}
                <span className="text-xs text-muted-foreground">(Optional)</span>
              </h4>

              <div className="flex flex-wrap gap-2 text-xs">
                <button
                  type="button"
                  className="border rounded px-3 py-1"
                  onClick={() => addButton("visit_website")}
                >
                  + Add Visit Website
                </button>

                <button
                  type="button"
                  className="border rounded px-3 py-1"
                  onClick={() => addButton("call_phone")}
                >
                  + Add Call Phone
                </button>

                <button
                  type="button"
                  className="border rounded px-3 py-1"
                  onClick={() => addButton("quick_reply")}
                >
                  + Add Quick Reply
                </button>
              </div>

              {form.buttons?.length > 0 && (
                <div className="space-y-3">
                  {form.buttons.map((btn) => (
                    <div key={btn.id} className="border rounded p-3 space-y-2">
                      <div className="flex justify-between">
                        <span className="font-medium text-sm">
                          {btn.type === "visit_website"
                            ? "Visit Website"
                            : btn.type === "call_phone"
                              ? "Call Phone"
                              : "Quick Reply"}
                        </span>

                        <button
                          type="button"
                          className="text-red-500 text-xs"
                          onClick={() => removeButton(btn.id)}
                        >
                          Remove
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <label className="text-xs space-y-1">
                          <span className="font-medium">Label</span>
                          <input
                            className="w-full border rounded px-2 py-1"
                            value={btn.label}
                            onChange={(e) =>
                              updateButton(btn.id, { label: e.target.value })
                            }
                          />
                        </label>

                        {btn.type === "visit_website" && (
                          <label className="col-span-1 md:col-span-2 text-xs space-y-1">
                            <span className="font-medium">URL</span>
                            <input
                              className="w-full border rounded px-2 py-1"
                              value={btn.url || ""}
                              onChange={(e) =>
                                updateButton(btn.id, { url: e.target.value })
                              }
                            />
                          </label>
                        )}

                        {btn.type === "call_phone" && (
                          <label className="col-span-1 md:col-span-2 text-xs space-y-1">
                            <span className="font-medium">Phone</span>
                            <input
                              className="w-full border rounded px-2 py-1"
                              value={btn.phone || ""}
                              onChange={(e) =>
                                updateButton(btn.id, { phone: e.target.value })
                              }
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </form>

          {/* RIGHT PANEL */}
          <aside className="space-y-4">
            {/* Actions */}
            <div className="p-4 border rounded-xl space-y-3 bg-card">
              <div className="flex justify-between items-center">
                <h4 className="text-sm font-semibold">Actions</h4>
                <span className="text-xs bg-muted px-2 py-0.5 rounded">
                  {form.status}
                </span>
              </div>

              <button
                type="button"
                className="w-full bg-primary text-primary-foreground rounded px-4 py-2 text-sm disabled:opacity-50"
                disabled={saving}
                onClick={handleSaveClick}
              >
                {saving
                  ? "Saving..."
                  : form.isdeleted
                    ? "Save Changes"
                    : "Save Template"}
              </button>

              <button
                type="button"
                className="w-full border rounded px-4 py-2 text-sm text-muted-foreground"
                onClick={handleCancelClick}
              >
                Cancel
              </button>

              {/* Archive button (soft delete) */}
              <button
                type="button"
                className={`w-full border rounded px-4 py-2 text-sm ${form.isdeleted
                  ? "border-slate-300 text-slate-400 cursor-not-allowed"
                  : "border-red-500 text-red-500"
                  }`}
                onClick={handleDeleteClick}
                disabled={!!form.isdeleted}
              >
                {form.isdeleted ? "Archived" : "Archive Template"}
              </button>

              {/* Recover button – only when archived */}
              {form.isdeleted && (
                <button
                  type="button"
                  className="w-full border border-emerald-500 text-emerald-600 rounded px-4 py-2 text-sm"
                  onClick={handleRecoverClick}
                >
                  Recover Template
                </button>
              )}
            </div>

            {/* WhatsApp Preview */}
            <div className="p-4 border rounded-xl bg-card space-y-3">
              <h4 className="text-sm font-semibold">Template Preview</h4>

              <div className="mx-auto max-w-xs rounded-2xl border bg-muted p-3">
                {form.headerType === "media" && form.mediaurl && (
                  <img
                    src={form.mediaurl}
                    className="rounded w-full object-cover max-h-40 mb-2"
                    alt="Header media"
                  />
                )}

                {form.headerType === "text" && form.headerText && (
                  <p className="text-xs font-semibold mb-1">
                    {form.headerText}
                  </p>
                )}

                <div className="bg-background rounded p-2 text-xs shadow">
                  {form.body.split("\n").map((line, i) => (
                    <p key={i}>{line || " "}</p>
                  ))}
                </div>

                {form.footerText && (
                  <p className="text-[10px] text-muted-foreground mt-2">
                    {form.footerText}
                  </p>
                )}

                {form.buttons?.length > 0 && (
                  <div className="border-t mt-2 pt-2 space-y-1">
                    {form.buttons.map((btn) => (
                      <button
                        key={btn.id}
                        className="w-full rounded-full border px-3 py-1.5 text-[11px] text-primary"
                        type="button"
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                Visual preview of how your template appears in WhatsApp.
              </p>
            </div>
          </aside>
        </div>

        {/* Confirm Modal */}
        {confirm.open && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30">
            <div className="w-full max-w-sm rounded-lg bg-card p-4 shadow-lg">
              <h3 className="text-sm font-semibold mb-2">{confirm.title}</h3>
              <p className="text-xs text-muted-foreground mb-4">
                {confirm.message}
              </p>
              <div className="flex justify-end gap-2 text-xs">
                <button
                  type="button"
                  className="px-3 py-1 rounded border"
                  onClick={closeConfirm}
                >
                  {confirm.cancelLabel || "Cancel"}
                </button>
                <button
                  type="button"
                  className="px-3 py-1 rounded bg-primary text-primary-foreground"
                  onClick={() => confirm.onConfirm && confirm.onConfirm()}
                >
                  {confirm.confirmLabel || "Confirm"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Feedback Modal */}
        {feedback.open && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30">
            <div className="w-full max-w-sm rounded-lg bg-card p-4 shadow-lg">
              <h3 className="text-sm font-semibold mb-2">{feedback.title}</h3>
              <p className="text-xs text-muted-foreground mb-4">
                {feedback.message}
              </p>
              <div className="flex justify-end gap-2 text-xs">
                {feedback.secondaryLabel && (
                  <button
                    type="button"
                    className="px-3 py-1 rounded border"
                    onClick={() =>
                      feedback.onSecondary
                        ? feedback.onSecondary()
                        : closeFeedback()
                    }
                  >
                    {feedback.secondaryLabel}
                  </button>
                )}
                <button
                  type="button"
                  className="px-3 py-1 rounded bg-primary text-primary-foreground"
                  onClick={() =>
                    feedback.onPrimary ? feedback.onPrimary() : closeFeedback()
                  }
                >
                  {feedback.primaryLabel || "OK"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
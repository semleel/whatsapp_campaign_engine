"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { showCenteredAlert, showCenteredConfirm } from "@/lib/showAlert";

// Types
type TemplateData = {
  contentid: number;
  title: string;
  type: string;
  status: string;
  lang: string;
  category: string | null;
  body: string;
  description?: string | null;
  footerText?: string | null;
  mediaurl?: string | null;
  expiresat?: string | null;
  placeholders?: Record<string, unknown> | null;
  tags: string[];          // <- not optional
  buttons: ButtonItem[];   // <- not optional
  headerType?: "none" | "text" | "media";
  headerText?: string | null;
  headerMediaType?: "image" | "video" | "document";
};


type ButtonItem = {
  id: string;
  type: "visit_website" | "call_phone" | "quick_reply";
  label: string;
  url?: string;
  phone?: string;
};

const SUPPORTED_LOCALES = [
  { value: "en", label: "English" },
  { value: "my", label: "Bahasa Melayu" },
  { value: "cn", label: "Chinese" }
];

function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

export default function EditTemplatePage() {
  const params = useParams();
  const router = useRouter();
  const templateId = useMemo(() => (params?.id ? Number(params.id) : NaN), [params]);

  // UI States
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Template Form Data
  const [form, setForm] = useState<TemplateData>({
    contentid: 0,
    title: "",
    type: "message",
    status: "Draft",
    lang: "en",
    category: "",
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
    headerMediaType: "image"
  });

  // Drag-drop image states
  const [dragActive, setDragActive] = useState(false);
  const [headerFilePreview, setHeaderFilePreview] = useState<string | null>(null);
  const [headerFile, setHeaderFile] = useState<File | null>(null);

  // Fetch template data
  useEffect(() => {
    if (!templateId) return;

    const load = async () => {
      try {
        setLoading(true);
        const res = await fetch(`http://localhost:3000/api/template/${templateId}`);
        if (!res.ok) throw new Error("Failed to load template");

        const data = await res.json();

        const placeholders =
          (data.placeholders as Record<string, unknown> | null) || null;
        const headerType =
          data.headerType ||
          (placeholders?.headerType as TemplateData["headerType"]) ||
          (data.mediaurl ? "media" : "none");
        const headerText =
          data.headerText ||
          (placeholders?.headerText as string | null) ||
          "";
        const headerMediaType =
          data.headerMediaType ||
          (placeholders?.headerMediaType as string | null) ||
          "image";
        const footerText =
          data.footertext ||
          (placeholders?.footerText as string | null) ||
          "";
        const buttons =
          data.buttons ||
          ((placeholders?.buttons as ButtonItem[] | undefined) ?? []);

        setForm({
          contentid: data.contentid,
          title: data.title,
          type: data.type,
          status: data.status,
          lang: (data.lang || data.defaultlang || "en")?.trim() || "en",
          category: data.category || "",
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
        });

        if (data.mediaurl) {
          setHeaderFilePreview(data.mediaurl);
        }
      } catch (e: any) {
        setError(e.message || "Error loading template");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [templateId]);

  // Drag handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (["dragenter", "dragover"].includes(e.type)) setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelected(file);
  };

  const handleFileSelected = (file: File) => {
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      showCenteredAlert("Only JPG or PNG allowed");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showCenteredAlert("Max 5MB file size allowed");
      return;
    }

    setHeaderFile(file);
    setHeaderFilePreview(URL.createObjectURL(file));
  };

  // Buttons logic
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
          phone: type === "call_phone" ? "" : undefined
        }
      ]
    }));
  };

  const updateButton = (id: string, changes: Partial<ButtonItem>) => {
    setForm((prev) => ({
      ...prev,
      buttons: prev.buttons!.map((btn) =>
        btn.id === id ? { ...btn, ...changes } : btn
      )
    }));
  };

  const removeButton = (id: string) => {
    setForm((prev) => ({
      ...prev,
      buttons: prev.buttons!.filter((btn) => btn.id !== id)
    }));
  };

  // Tags
  const [tagInput, setTagInput] = useState("");

  const addTags = () => {
    const tagList = tagInput.split(/[\s,]+/).map((t) => t.trim()).filter(Boolean);
    if (!tagList.length) return;

    setForm((prev) => ({
      ...prev,
      tags: [...(prev.tags || []), ...tagList]
    }));

    setTagInput("");
  };

  const removeTag = (name: string) => {
    setForm((prev) => ({
      ...prev,
      tags: prev.tags!.filter((t) => t !== name)
    }));
  };

  // ----------------------------
  // SAVE HANDLER (INSIDE COMPONENT)
  // ----------------------------
  const handleSave = async () => {
    if (!form.title.trim()) {
      await showCenteredAlert("Title is required");
      return;
    }

    setSaving(true);

    try {
      let finalMediaUrl = form.mediaurl;

      if (headerFile) {
        const uploadForm = new FormData();
        uploadForm.append("file", headerFile);

        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          body: uploadForm
        });

        if (!uploadRes.ok) throw new Error("Image upload failed");

        const uploadData = await uploadRes.json();
        finalMediaUrl = uploadData.url;
      }

      const expiresAtIso = form.expiresat
        ? new Date(form.expiresat).toISOString()
        : null;

      const placeholderData = {
        footerText: form.footerText || null,
        headerText: form.headerType === "text" ? form.headerText : null,
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
        placeholders: { ...(form.placeholders || {}), ...placeholderData },
      };

      const res = await fetch(`/api/template/${form.contentid}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error("Failed to update template");

      await showCenteredAlert("Template updated successfully!");
    } catch (e: any) {
      await showCenteredAlert(e.message);
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

    try {
      const res = await fetch(`/api/template/${form.contentid}/delete`, {
        method: "POST"
      });

      if (!res.ok) throw new Error("Delete failed");

      await showCenteredAlert("Template deleted.");
      router.push("/content/templates");
    } catch (e: any) {
      await showCenteredAlert(e.message);
    }
  };

  // UI loading/error
  if (loading) return <div className="p-6 text-center">Loading...</div>;
  if (error) return <div className="p-6 text-center text-red-500">{error}</div>;

  // ----------------------------
  // PAGE RETURN
  // ----------------------------
  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex justify-between">
        <div>
          <h1 className="text-lg font-semibold">Edit Template: {form.title}</h1>
          <p className="text-sm text-muted-foreground">Modify template metadata.</p>
        </div>

        <Link href="/content/templates" className="text-sm text-primary hover:underline">
          Back to library
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        {/* LEFT FORM */}
        <form id="edit-template-form" className="border rounded-xl p-6 space-y-6 bg-white">

          {/* Title & Type */}
          <div className="grid grid-cols-2 gap-4">
            <label className="text-sm">
              <span className="font-medium">Title</span>
              <input
                className="w-full border rounded px-3 py-2"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </label>

            <label className="text-sm">
              <span className="font-medium">Type</span>
              <select
                className="w-full border rounded px-3 py-2"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                <option value="message">Message</option>
                <option value="media">Media</option>
                <option value="flow">Flow</option>
              </select>
            </label>
          </div>

          {/* Status / Lang / Category */}
          <div className="grid grid-cols-3 gap-4">
            <label className="text-sm">
              <span className="font-medium">Status</span>
              <select
                className="w-full border rounded px-3 py-2"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option value="Draft">Draft</option>
                <option value="Active">Active</option>
                <option value="Archived">Archived</option>
              </select>
            </label>

            <label className="text-sm">
              <span className="font-medium">Language</span>
              <select
                className="w-full border rounded px-3 py-2"
                value={form.lang}
                onChange={(e) => setForm({ ...form, lang: e.target.value })}
              >
                {SUPPORTED_LOCALES.map((loc) => (
                  <option key={loc.value} value={loc.value}>
                    {loc.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <span className="font-medium">Category</span>
              <input
                className="w-full border rounded px-3 py-2"
                value={form.category || ""}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
            </label>
          </div>

          {/* HEADER SECTION */}
          <div className="border-t pt-4">
            <h4 className="font-semibold text-sm mb-3">
              Header <span className="text-xs text-muted-foreground">(Optional)</span>
            </h4>

            <div className="grid grid-cols-2 gap-4">
              <label className="text-sm">
                <span className="font-medium">Header Type</span>
                <select
                  className="w-full border rounded px-3 py-2"
                  value={form.headerType}
                  onChange={(e) =>
                    setForm({ ...form, headerType: e.target.value as "none" | "text" | "media" })
                  }
                >
                  <option value="none">None</option>
                  <option value="text">Text</option>
                  <option value="media">Media</option>
                </select>
              </label>

              {form.headerType === "media" && (
                <label className="text-sm">
                  <span className="font-medium">Media Type</span>
                  <select
                    className="w-full border rounded px-3 py-2"
                    value={form.headerMediaType}
                    onChange={(e) =>
                      setForm({ ...form, headerMediaType: e.target.value as any })
                    }
                  >
                    <option value="image">Image</option>
                  </select>
                </label>
              )}
            </div>

            {/* Drag & Drop */}
            {form.headerType === "media" && (
              <div
                className={`mt-3 p-5 rounded border-2 border-dashed text-center cursor-pointer ${dragActive ? "bg-primary/10 border-primary" : "border-gray-300"
                  }`}
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => document.getElementById("headerFileInput")?.click()}
              >
                {!headerFilePreview ? (
                  <div className="text-sm text-muted-foreground">
                    <p>📂 Drag & drop an image</p>
                    <p>or click to browse</p>
                    <p className="text-xs">JPEG/PNG only • Max 5MB</p>
                  </div>
                ) : (
                  <div>
                    <img
                      src={headerFilePreview}
                      className="mx-auto max-h-40 rounded shadow object-cover"
                    />
                    <button
                      type="button"
                      className="text-xs text-red-500 mt-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        setHeaderFile(null);
                        setHeaderFilePreview(null);
                      }}
                    >
                      Remove Image
                    </button>
                  </div>
                )}

                <input
                  type="file"
                  id="headerFileInput"
                  className="hidden"
                  accept="image/jpeg,image/png"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileSelected(f);
                  }}
                />
              </div>
            )}

            {form.headerType === "text" && (
              <label className="text-sm mt-3 block">
                <span className="font-medium">Header Text</span>
                <input
                  className="w-full border rounded px-3 py-2"
                  value={form.headerText || ""}
                  onChange={(e) => setForm({ ...form, headerText: e.target.value })}
                />
              </label>
            )}
          </div>

          {/* BODY */}
          <label className="text-sm border-t pt-4 block">
            <span className="font-medium">Body</span>
            <textarea
              className="w-full border rounded px-3 py-2 min-h-32"
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
            />
          </label>

          {/* FOOTER */}
          <div className="border-t pt-4">
            <h4 className="font-semibold text-sm">Footer (Optional)</h4>
            <input
              className="w-full border rounded px-3 py-2"
              value={form.footerText || ""}
              onChange={(e) => setForm({ ...form, footerText: e.target.value })}
            />
          </div>

          {/* BUTTONS */}
          <div className="border-t pt-4 space-y-3">
            <h4 className="font-semibold text-sm">Buttons (Optional)</h4>

            <div className="flex gap-2 text-xs">
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

                    <div className="grid grid-cols-3 gap-3">
                      <label className="text-xs">
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
                        <label className="col-span-2 text-xs">
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
                        <label className="col-span-2 text-xs">
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

          {/* TAGS */}
          <div className="border-t pt-4 space-y-3">
            <h4 className="font-semibold text-sm">Tags</h4>

            <div className="flex flex-wrap gap-2">
              {form.tags?.map((t) => (
                <span
                  key={t}
                  className="px-2 py-1 bg-muted border rounded-full text-xs flex items-center gap-2"
                >
                  {t}
                  <button
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
                placeholder="Add tags..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
              />

              <button
                type="button"
                className="border rounded px-3 py-2"
                onClick={addTags}
              >
                Add
              </button>
            </div>
          </div>

          {/* EXPIRY */}
          <div className="border-t pt-4 space-y-3">
            <h4 className="font-semibold text-sm">Expiry</h4>

            <input
              type="datetime-local"
              className="border rounded px-3 py-2"
              value={form.expiresat ? new Date(form.expiresat).toISOString().slice(0, 16) : ""}
              onChange={(e) => setForm({ ...form, expiresat: e.target.value })}
            />
          </div>
        </form>

        {/* RIGHT PANEL */}
        <aside className="space-y-4">
          {/* Actions */}
          <div className="p-4 border rounded-xl space-y-3 bg-white">
            <div className="flex justify-between">
              <h4 className="text-sm font-semibold">Actions</h4>
              <span className="text-xs bg-muted px-2 py-0.5 rounded">
                {form.status}
              </span>
            </div>

            <button
              className="w-full bg-primary text-primary-foreground rounded px-4 py-2 text-sm"
              disabled={saving}
              onClick={handleSave}
            >
              {saving ? "Saving..." : "Save Template"}
            </button>

            <Link
              href="/content/templates"
              className="w-full inline-block border rounded px-4 py-2 text-center text-sm text-muted-foreground"
            >
              Cancel
            </Link>

            <button
              className="w-full border border-red-500 text-red-500 rounded px-4 py-2 text-sm"
              onClick={handleSoftDelete}
            >
              Delete Template
            </button>
          </div>

          {/* WhatsApp Preview */}
          <div className="p-4 border rounded-xl bg-white space-y-3">
            <h4 className="text-sm font-semibold">Template Preview</h4>

            <div className="mx-auto max-w-xs rounded-2xl border bg-muted p-3">
              {/* Image Header */}
              {form.headerType === "media" && (headerFilePreview || form.mediaurl) && (
                <img
                  src={headerFilePreview || form.mediaurl!}
                  className="rounded w-full object-cover max-h-40 mb-2"
                />
              )}

              {/* Text Header */}
              {form.headerType === "text" && form.headerText && (
                <p className="text-xs font-semibold mb-1">{form.headerText}</p>
              )}

              {/* Body */}
              <div className="bg-background rounded p-2 text-xs shadow">
                {form.body.split("\n").map((line, i) => (
                  <p key={i}>{line || " "}</p>
                ))}
              </div>

              {/* Footer */}
              {form.footerText && (
                <p className="text-[10px] text-muted-foreground mt-2">{form.footerText}</p>
              )}

              {/* Buttons */}
              {form.buttons?.length > 0 && (
                <div className="border-t mt-2 pt-2 space-y-1">
                  {form.buttons.map((btn) => (
                    <button
                      key={btn.id}
                      className="w-full rounded-full border px-3 py-1.5 text-[11px] text-primary"
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
    </div>
  );
}

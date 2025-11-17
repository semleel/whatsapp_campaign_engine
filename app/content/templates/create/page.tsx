"use client";

import Link from "next/link";
import { useState } from "react";

const SUPPORTED_LOCALES = [
  { value: "en", label: "English" },
  { value: "my", label: "Bahasa Melayu" },
  { value: "cn", label: "Chinese" },
];

type ButtonType = "visit_website" | "call_phone" | "quick_reply";

type TemplateButton = {
  id: string;
  type: ButtonType;
  label: string;
  url?: string;
  phone?: string;
};

type TemplateForm = {
  title: string;
  type: string;
  category: string;
  status: string;
  lang: string;
  body: string;
  description: string;
  mediaurl: string; // keep for backend compatibility (we send null now)
  tags: string;
  expiresat: string;

  headerType: "none" | "text" | "media";
  headerMediaType: "image" | "video" | "document";
  headerText: string;
  footerText: string;
  buttons: TemplateButton[];
};

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

export default function ContentCreatePage() {
  const [form, setForm] = useState<TemplateForm>({
    title: "",
    type: "message",
    category: "",
    status: "Draft",
    lang: "en",
    body: "",
    description: "",
    mediaurl: "",
    tags: "",
    expiresat: "",
    headerType: "none",
    headerMediaType: "image",
    headerText: "",
    footerText: "",
    buttons: [],
  });

  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Header sample image (this is the ONLY media sample, like WANotifier)
  const [headerSampleFile, setHeaderSampleFile] = useState<File | null>(null);
  const [headerSamplePreview, setHeaderSamplePreview] = useState<string | null>(
    null
  );
  const [headerFileError, setHeaderFileError] = useState<string | null>(null);
  const [headerInputKey, setHeaderInputKey] = useState(0); // used to force input remount

  const handleChange = (
    e:
      | React.ChangeEvent<HTMLInputElement>
      | React.ChangeEvent<HTMLSelectElement>
      | React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleHeaderFileChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ["image/jpeg", "image/png"];
    if (!validTypes.includes(file.type)) {
      setHeaderFileError("Only JPEG and PNG images are allowed.");
      setHeaderSampleFile(null);
      setHeaderSamplePreview(null);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setHeaderFileError("Max file size is 5MB.");
      setHeaderSampleFile(null);
      setHeaderSamplePreview(null);
      return;
    }

    setHeaderFileError(null);
    setHeaderSampleFile(file);
    setHeaderSamplePreview(URL.createObjectURL(file));
  };

  const addButton = (type: ButtonType) => {
    setForm((prev) => ({
      ...prev,
      buttons: [
        ...prev.buttons,
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

  const updateButton = (id: string, changes: Partial<TemplateButton>) => {
    setForm((prev) => ({
      ...prev,
      buttons: prev.buttons.map((b) =>
        b.id === id ? { ...b, ...changes } : b
      ),
    }));
  };

  const removeButton = (id: string) => {
    setForm((prev) => ({
      ...prev,
      buttons: prev.buttons.filter((b) => b.id !== id),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage("Submitting...");

    try {
      let headerSampleDataUrl: string | null = null;

      if (headerSampleFile) {
        headerSampleDataUrl = await fileToDataUrl(headerSampleFile);
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
        category: form.category || null,
        status: form.status,
        lang: form.lang,
        body: form.body,
        description: form.description || form.body || null,
        mediaurl: null, // we use sample image instead of external URL
        expiresat: expiresAtIso,
        footerText: placeholderData.footerText,
        headerText: placeholderData.headerText,
        headerType: placeholderData.headerType,
        headerMediaType: placeholderData.headerMediaType,
        buttons: placeholderData.buttons,
        placeholders: placeholderData,
        headerSampleDataUrl,
      };

      const res = await fetch("http://localhost:3000/api/template/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const ct = res.headers.get("content-type") || "";
      const isJson = ct.includes("application/json");
      const data = isJson ? await res.json() : await res.text();

      if (res.ok && isJson) {
        const created = (data as any)?.data;
        const contentId: number | undefined = created?.contentid;

        // tags
        const tags = form.tags
          .split(/[\s,]+/)
          .map((t) => t.trim())
          .filter(Boolean);
        if (contentId && tags.length) {
          await fetch(`http://localhost:3000/api/template/${contentId}/tags`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tags }),
          });
        }

        // expiry
        if (contentId && form.expiresat) {
          const iso = new Date(form.expiresat).toISOString();
          await fetch(
            `http://localhost:3000/api/template/${contentId}/expire`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ expiresAt: iso }),
            }
          );
        }

        setMessage("Template created successfully.");
        setForm({
          title: "",
          type: "message",
          category: "",
          status: "Draft",
          lang: "en",
          body: "",
          description: "",
          mediaurl: "",
          tags: "",
          expiresat: "",
          headerType: "none",
          headerMediaType: "image",
          headerText: "",
          footerText: "",
          buttons: [],
        });
        setHeaderSampleFile(null);
        setHeaderSamplePreview(null);
        setHeaderFileError(null);
        setHeaderInputKey((k) => k + 1); // reset file input after submit
      } else {
        const msg =
          typeof data === "string"
            ? data
            : (data as any)?.error || "Unknown error";
        setMessage(`Error: ${msg}`);
      }
    } catch (err) {
      console.error(err);
      setMessage("Network error.");
    } finally {
      setSubmitting(false);
    }
  };

  const previewBody =
    form.body.trim() || "Body text here";
  const previewFooter =
    form.footerText.trim() || "Sent via Campaign Engine";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Create Template</h3>
          <p className="text-sm text-muted-foreground">
            Add a new WhatsApp-approved message, tag it with metadata,
            and keep the versioning trail clean.
          </p>
        </div>
        <Link
          href="/content/templates"
          className="text-sm font-medium text-primary hover:underline"
        >
          Back to library
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] items-start">
        {/* LEFT: form */}
        <form
          id="template-form"
          onSubmit={handleSubmit}
          className="rounded-xl border bg-card p-6 space-y-6"
        >
          {/* Basic info */}
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm font-medium">
              <span>Title</span>
              <input
                type="text"
                name="title"
                placeholder="e.g. Welcome Back"
                value={form.title}
                onChange={handleChange}
                className="w-full rounded-md border px-3 py-2"
                required
              />
            </label>
            <label className="space-y-1 text-sm font-medium">
              <span>Type</span>
              <select
                name="type"
                value={form.type}
                onChange={handleChange}
                className="w-full rounded-md border px-3 py-2"
              >
                <option value="message">Message</option>
                <option value="media">Media</option>
                <option value="flow">Flow</option>
              </select>
            </label>
          </div>

          {/* Status / language / category */}
          <div className="grid gap-4 md:grid-cols-3">
            <label className="space-y-1 text-sm font-medium">
              <span>Status</span>
              <select
                name="status"
                value={form.status}
                onChange={handleChange}
                className="w-full rounded-md border px-3 py-2"
              >
                <option value="Draft">Draft</option>
                <option value="Active">Active</option>
                <option value="Archived">Archived</option>
              </select>
            </label>
            <label className="space-y-1 text-sm font-medium">
              <span>Language</span>
              <select
                name="lang"
                value={form.lang}
                onChange={handleChange}
                className="w-full rounded-md border px-3 py-2"
                required
              >
                {SUPPORTED_LOCALES.map((locale) => (
                  <option key={locale.value} value={locale.value}>
                    {locale.label} ({locale.value.toUpperCase()})
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm font-medium">
              <span>Category</span>
              <input
                type="text"
                name="category"
                placeholder="Optional"
                value={form.category}
                onChange={handleChange}
                className="w-full rounded-md border px-3 py-2"
              />
            </label>
          </div>

          {/* Tags + expiry */}
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm font-medium">
              <span>Tags</span>
              <input
                type="text"
                name="tags"
                placeholder="e.g. RAYA2025 EN approved"
                value={form.tags}
                onChange={handleChange}
                className="w-full rounded-md border px-3 py-2"
              />
              <span className="text-xs text-muted-foreground">
                Separate with comma or space
              </span>
            </label>
            <label className="space-y-1 text-sm font-medium">
              <span>Expiry</span>
              <input
                type="datetime-local"
                name="expiresat"
                value={form.expiresat}
                onChange={handleChange}
                className="w-full rounded-md border px-3 py-2"
              />
              <span className="text-xs text-muted-foreground">
                Optional. Auto-hides after this time.
              </span>
            </label>
          </div>

          {/* Header (with upload, WANotifier style) */}
          <div className="space-y-3 border-t pt-4">
            <h4 className="text-sm font-semibold">
              Header{" "}
              <span className="text-xs text-muted-foreground">
                (Optional)
              </span>
            </h4>
            <p className="text-xs text-muted-foreground">
              Add a title or sample media that you want to show in the
              message header.
            </p>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1 text-sm font-medium">
                <span>Header type</span>
                <select
                  name="headerType"
                  value={form.headerType}
                  onChange={handleChange}
                  className="w-full rounded-md border px-3 py-2"
                >
                  <option value="none">None</option>
                  <option value="text">Text</option>
                  <option value="media">Media</option>
                </select>
              </label>

              {form.headerType === "media" && (
                <label className="space-y-1 text-sm font-medium">
                  <span>Media type</span>
                  <select
                    name="headerMediaType"
                    value={form.headerMediaType}
                    onChange={handleChange}
                    className="w-full rounded-md border px-3 py-2"
                  >
                    <option value="image">Image</option>
                    <option value="video">Video</option>
                    <option value="document">Document</option>
                  </select>
                </label>
              )}

              {form.headerType === "text" && (
                <label className="space-y-1 text-sm font-medium md:col-span-2">
                  <span>Header text</span>
                  <input
                    type="text"
                    name="headerText"
                    placeholder="Add a short title"
                    value={form.headerText}
                    onChange={handleChange}
                    className="w-full rounded-md border px-3 py-2"
                  />
                </label>
              )}
            </div>

            {form.headerType === "media" && (
              <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-start">
                <div className="space-y-2 text-sm">
                  <span className="font-medium">
                    Upload sample image
                  </span>
                  <div className="flex items-center gap-3">
                    {/* Styled "Choose file" button with key to force remount */}
                    <label
                      key={headerInputKey}
                      className="inline-flex items-center rounded-md border px-3 py-2 text-xs font-medium cursor-pointer hover:bg-muted"
                    >
                      Choose file
                      <input
                        type="file"
                        accept="image/jpeg,image/png"
                        onChange={handleHeaderFileChange}
                        className="sr-only"
                      />
                    </label>
                    {headerSamplePreview && (
                      <button
                        type="button"
                        className="text-xs text-red-500"
                        onClick={() => {
                          setHeaderSampleFile(null);
                          setHeaderSamplePreview(null);
                          setHeaderFileError(null);
                          setHeaderInputKey((k) => k + 1); // allow re-selecting same file
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Upload a sample image for WhatsApp to review the type
                    of image you will be sending using this template.
                    Supported formats: <strong>JPEG</strong> and{" "}
                    <strong>PNG</strong>. Max size: <strong>5MB</strong>.
                  </p>
                  {headerFileError && (
                    <p className="text-xs text-red-500">
                      {headerFileError}
                    </p>
                  )}
                </div>

                {headerSamplePreview && (
                  <div className="border rounded-md overflow-hidden bg-muted">
                    <img
                      src={headerSamplePreview}
                      alt="Header sample"
                      className="block w-full h-32 object-cover"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Body */}
          <label className="space-y-1 text-sm font-medium block border-t pt-4">
            <span>Body</span>
            <textarea
              name="body"
              placeholder="Message body and personalization notes"
              value={form.body}
              onChange={handleChange}
              className="w-full rounded-md border px-3 py-2 min-h-32"
            />
          </label>

          {/* Footer */}
          <div className="space-y-3 border-t pt-4">
            <h4 className="text-sm font-semibold">
              Footer{" "}
              <span className="text-xs text-muted-foreground">
                (Optional)
              </span>
            </h4>
            <label className="space-y-1 text-sm font-medium">
              <span>Footer text</span>
              <input
                type="text"
                name="footerText"
                placeholder="Sent via Campaign Engine"
                value={form.footerText}
                onChange={handleChange}
                className="w-full rounded-md border px-3 py-2"
              />
            </label>
          </div>

          {/* Buttons */}
          <div className="space-y-3 border-t pt-4">
            <h4 className="text-sm font-semibold">
              Buttons{" "}
              <span className="text-xs text-muted-foreground">
                (Optional)
              </span>
            </h4>
            <div className="flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                onClick={() => addButton("visit_website")}
                className="rounded-md border px-3 py-1 hover:bg-muted"
              >
                + Add Visit Website
              </button>
              <button
                type="button"
                onClick={() => addButton("call_phone")}
                className="rounded-md border px-3 py-1 hover:bg-muted"
              >
                + Add Call Phone
              </button>
              <button
                type="button"
                onClick={() => addButton("quick_reply")}
                className="rounded-md border px-3 py-1 hover:bg-muted"
              >
                + Add Quick Reply
              </button>
            </div>

            {form.buttons.length > 0 && (
              <div className="space-y-3">
                {form.buttons.map((btn) => (
                  <div
                    key={btn.id}
                    className="rounded-md border p-3 space-y-2 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        {btn.type === "visit_website"
                          ? "Call to Action – Visit website"
                          : btn.type === "call_phone"
                            ? "Call to Action – Call phone"
                            : "Quick reply"}
                      </span>
                      <button
                        type="button"
                        className="text-xs text-red-500"
                        onClick={() => removeButton(btn.id)}
                      >
                        Remove
                      </button>
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <label className="space-y-1 text-xs font-medium">
                        <span>Button text</span>
                        <input
                          type="text"
                          value={btn.label}
                          onChange={(e) =>
                            updateButton(btn.id, {
                              label: e.target.value,
                            })
                          }
                          className="w-full rounded-md border px-2 py-1"
                        />
                      </label>
                      {btn.type === "visit_website" && (
                        <label className="space-y-1 text-xs font-medium md:col-span-2">
                          <span>Website URL</span>
                          <input
                            type="text"
                            value={btn.url || ""}
                            onChange={(e) =>
                              updateButton(btn.id, {
                                url: e.target.value,
                              })
                            }
                            className="w-full rounded-md border px-2 py-1"
                            placeholder="https://example.com"
                          />
                        </label>
                      )}
                      {btn.type === "call_phone" && (
                        <label className="space-y-1 text-xs font-medium md:col-span-2">
                          <span>Phone number</span>
                          <input
                            type="text"
                            value={btn.phone || ""}
                            onChange={(e) =>
                              updateButton(btn.id, {
                                phone: e.target.value,
                              })
                            }
                            className="w-full rounded-md border px-2 py-1"
                            placeholder="+60..."
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

        {/* RIGHT: Actions + Preview */}
        <aside className="space-y-4">
          {/* Actions card */}
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Actions</h4>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {form.status || "Draft"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Save this template as a draft or submit it for supervisor
              review in your FYP demonstration.
            </p>
            <div className="flex flex-col gap-2 pt-1">
              <button
                type="submit"
                form="template-form"
                disabled={submitting}
                className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? "Saving..." : "Save template"}
              </button>
              <Link
                href="/content/templates"
                className="inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/60"
              >
                Cancel
              </Link>
            </div>
          </div>

          {/* Preview card */}
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <h4 className="text-sm font-semibold">Template Preview</h4>
            <div className="mx-auto max-w-xs rounded-2xl border bg-muted p-3">
              {/* header media preview (acts like WANotifier sample image) */}
              {form.headerType === "media" && headerSamplePreview && (
                <div className="mb-2 overflow-hidden rounded-md bg-background">
                  <img
                    src={headerSamplePreview}
                    alt="Header preview"
                    className="block w-full object-cover max-h-40"
                  />
                </div>
              )}

              {/* header text preview */}
              {form.headerType === "text" &&
                form.headerText.trim() && (
                  <p className="mb-1 text-xs font-semibold">
                    {form.headerText}
                  </p>
                )}

              {/* body bubble */}
              <div className="rounded-lg bg-background px-3 py-2 text-xs leading-relaxed shadow-sm">
                {previewBody.split("\n").map((line, i) => (
                  <p key={i}>
                    {line || (i === 0 ? "Body text here" : "")}
                  </p>
                ))}
              </div>

              {/* footer */}
              <p className="mt-2 text-[10px] text-muted-foreground">
                {previewFooter}
              </p>

              {/* buttons */}
              {form.buttons.length > 0 && (
                <div className="mt-2 border-t pt-2 space-y-1">
                  {form.buttons.map((btn) => (
                    <button
                      key={btn.id}
                      type="button"
                      className="w-full rounded-full border bg-background px-3 py-1.5 text-[11px] font-medium text-primary text-center"
                    >
                      {btn.label || "Button"}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              This preview is static for UI demonstration in your FYP.
              Actual WhatsApp rendering may differ slightly.
            </p>
          </div>
        </aside>
      </div>

      {message && (
        <p className="text-sm text-muted-foreground">{message}</p>
      )}
    </div>
  );
}

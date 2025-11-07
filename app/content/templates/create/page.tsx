"use client";

import Link from "next/link";
import { useState } from "react";

type TemplateForm = {
  title: string;
  type: string;
  category: string;
  status: string;
  defaultLang: string;
  description: string;
  mediaUrl: string;
};

export default function ContentCreatePage() {
  const [form, setForm] = useState<TemplateForm>({
    title: "",
    type: "message",
    category: "",
    status: "Draft",
    defaultLang: "en",
    description: "",
    mediaUrl: "",
  });
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage("Submitting…");

    const payload = {
      ...form,
      category: form.category || null,
      mediaUrl: form.mediaUrl || null,
    };

    try {
      const res = await fetch("http://localhost:3000/api/template/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const ct = res.headers.get("content-type") || "";
      const isJson = ct.includes("application/json");
      const data = isJson ? await res.json() : await res.text();
      if (res.ok && isJson) {
        setMessage("Template created successfully.");
        setForm({
          title: "",
          type: "message",
          category: "",
          status: "Draft",
          defaultLang: "en",
          description: "",
          mediaUrl: "",
        });
      } else {
        const msg = typeof data === "string" ? data : data?.error || "Unknown error";
        setMessage(`Error: ${msg}`);
      }
    } catch (err) {
      setMessage("Network error.");
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Create Template</h3>
          <p className="text-sm text-muted-foreground">
            Add a new WhatsApp-approved message, tag it with metadata, and keep the versioning trail clean.
          </p>
        </div>
        <Link href="/content/templates" className="text-sm font-medium text-primary hover:underline">
          Back to library
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="rounded-xl border bg-card p-6 space-y-5">
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
            <span>Default language</span>
            <input
              type="text"
              name="defaultLang"
              value={form.defaultLang}
              onChange={handleChange}
              className="w-full rounded-md border px-3 py-2 uppercase"
              maxLength={2}
              required
            />
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

        <label className="space-y-1 text-sm font-medium">
          <span>Media URL</span>
          <input
            type="text"
            name="mediaUrl"
            placeholder="https://… (optional)"
            value={form.mediaUrl}
            onChange={handleChange}
            className="w-full rounded-md border px-3 py-2"
          />
        </label>

        <label className="space-y-1 text-sm font-medium">
          <span>Description</span>
          <textarea
            name="description"
            placeholder="Message body and personalization notes"
            value={form.description}
            onChange={handleChange}
            className="w-full rounded-md border px-3 py-2 min-h-32"
          />
        </label>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <Link href="/content/templates" className="text-sm font-medium text-muted-foreground hover:text-foreground">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Save template"}
          </button>
        </div>
      </form>

      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}


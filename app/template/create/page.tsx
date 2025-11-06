"use client";

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

export default function CreateTemplatePage() {
  const [form, setForm] = useState<TemplateForm>({
    title: "",
    type: "message",
    category: "",
    status: "Draft",
    defaultLang: "en",
    description: "",
    mediaUrl: "",
  });
  const [message, setMessage] = useState("");

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("Submitting...");

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
        const msg = typeof data === "string" ? data : (data?.error || "Unknown error");
        setMessage(`Error: ${msg}`);
      }
    } catch (err) {
      setMessage("Network error.");
      console.error(err);
    }
  };

  return (
    <div className="max-w-2xl mx-auto mt-10 p-6 bg-white rounded-2xl shadow-lg">
      <h1 className="text-2xl font-bold mb-4">Create Template</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          name="title"
          placeholder="Title"
          value={form.title}
          onChange={handleChange}
          className="w-full p-2 border rounded"
          required
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Type</label>
            <select
              name="type"
              value={form.type}
              onChange={handleChange}
              className="w-full p-2 border rounded"
              required
            >
              <option value="message">message</option>
              <option value="media">media</option>
              <option value="flow">flow</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">Status</label>
            <select
              name="status"
              value={form.status}
              onChange={handleChange}
              className="w-full p-2 border rounded"
            >
              <option value="Draft">Draft</option>
              <option value="Active">Active</option>
              <option value="Archived">Archived</option>
            </select>
          </div>
        </div>

        <input
          type="text"
          name="category"
          placeholder="Category (optional)"
          value={form.category}
          onChange={handleChange}
          className="w-full p-2 border rounded"
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1">
            <label className="block text-sm text-gray-600 mb-1">Default Language</label>
            <input
              type="text"
              name="defaultLang"
              placeholder="en"
              value={form.defaultLang}
              onChange={handleChange}
              className="w-full p-2 border rounded"
              maxLength={2}
              required
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm text-gray-600 mb-1">Media URL (optional)</label>
            <input
              type="text"
              name="mediaUrl"
              placeholder="https://..."
              value={form.mediaUrl}
              onChange={handleChange}
              className="w-full p-2 border rounded"
            />
          </div>
        </div>

        <textarea
          name="description"
          placeholder="Description"
          value={form.description}
          onChange={handleChange}
          className="w-full p-2 border rounded min-h-28"
        />

        <button
          type="submit"
          className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700"
        >
          Create Template
        </button>
      </form>

      {message && <p className="mt-4 text-center text-gray-700">{message}</p>}
    </div>
  );
}

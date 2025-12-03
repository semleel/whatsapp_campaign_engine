"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, Pencil, Trash2, X, RefreshCcw } from "lucide-react";
import { Api } from "@/lib/client";
import type { FlowListItem, SystemFlow, SystemKeyword } from "@/lib/types";
import { useRouter } from "next/navigation";

type KeywordFormState = {
  keyword: string;
  userflowid: string;
  systemflowid: string;
  is_active: boolean;
};

const emptyForm: KeywordFormState = {
  keyword: "",
  userflowid: "",
  systemflowid: "",
  is_active: true,
};

export default function SystemKeywordsPage() {
  const router = useRouter();
  const [keywords, setKeywords] = useState<SystemKeyword[]>([]);
  const [userFlows, setUserFlows] = useState<FlowListItem[]>([]);
  const [systemFlows, setSystemFlows] = useState<SystemFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingKeyword, setEditingKeyword] = useState<SystemKeyword | null>(null);
  const [form, setForm] = useState<KeywordFormState>(emptyForm);

  const handleAuthError = (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err || "");
    if (msg.toLowerCase().includes("invalid or expired token")) {
      setError("Session expired. Please sign in again.");
      router.push("/auth/login");
      return true;
    }
    return false;
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const [kwData, flows, sysFlows] = await Promise.all([
        Api.listSystemKeywords(),
        Api.listFlows(),
        Api.listSystemFlows(),
      ]);

      const filteredFlows = (flows || []).filter((f) => {
        const status = (f.status || "").toLowerCase();
        return status === "active" || status === "draft";
      });

      setKeywords(kwData || []);
      setUserFlows(filteredFlows);
      setSystemFlows(sysFlows || []);
    } catch (err) {
      if (!handleAuthError(err)) {
        setError(err instanceof Error ? err.message : "Failed to load system keywords.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreate = () => {
    setEditingKeyword(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (kw: SystemKeyword) => {
    setEditingKeyword(kw);
    setForm({
      keyword: kw.keyword,
      userflowid: String(kw.userflowid),
      systemflowid: kw.systemflowid ? String(kw.systemflowid) : "",
      is_active: kw.is_active,
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setForm(emptyForm);
    setEditingKeyword(null);
  };

  const handleSave = async () => {
    if (!form.keyword.trim() || !form.userflowid) {
      setError("Keyword and user flow are required.");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payload = {
        keyword: form.keyword.trim(),
        userflowid: Number(form.userflowid),
        systemflowid: form.systemflowid ? Number(form.systemflowid) : null,
        is_active: form.is_active,
      };

      if (editingKeyword) {
        await Api.updateSystemKeyword(editingKeyword.keyword, payload);
      } else {
        await Api.createSystemKeyword(payload);
      }

      closeModal();
      await loadData();
      setMessage("Keyword saved.");
    } catch (err) {
      if (!handleAuthError(err)) {
        setError(err instanceof Error ? err.message : "Failed to save keyword.");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (kw: SystemKeyword) => {
    if (!confirm(`Delete system keyword "${kw.keyword}"?`)) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await Api.deleteSystemKeyword(kw.keyword);
      await loadData();
      setMessage("Keyword deleted.");
    } catch (err) {
      if (!handleAuthError(err)) {
        setError(err instanceof Error ? err.message : "Failed to delete keyword.");
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-full flex items-center justify-center bg-[#f8f8f8]">
        <Loader2 className="animate-spin text-[#43b899]" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#f8f8f8] text-[#3e3e55] font-sans">
      <div className="max-w-6xl mx-auto p-8 space-y-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">System Keywords</h1>
            <p className="text-sm text-[#8e8e9e] mt-1">
              Configure system-level keywords (menu, restart, onboarding, etc) and map them to user flows.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={loadData}
              className="px-3 py-2 rounded bg-white border border-[#e0e0e7] text-sm flex items-center gap-2 hover:bg-[#f0f0f0]"
            >
              <RefreshCcw size={16} /> Refresh
            </button>
            <Link
              href="/flows"
              className="px-3 py-2 rounded bg-white border border-[#e0e0e7] text-sm hover:bg-[#f0f0f0]"
            >
              Back to Flows
            </Link>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-[#ffe6e6] border border-[#d95e5e] text-[#cc3d3d] text-sm rounded">
            {error}
          </div>
        )}
        {message && (
          <div className="p-3 bg-[#e7f6ef] border border-[#a6e1c4] text-[#1d7b55] text-sm rounded">
            {message}
          </div>
        )}

        <section className="bg-white rounded-lg border border-[#e0e0e7] p-6 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold text-lg">System Keywords</h2>
            <button
              onClick={openCreate}
              className="bg-[#43b899] hover:bg-[#058563] text-white px-4 py-2 rounded-md flex items-center gap-2 text-sm font-bold"
            >
              <Plus size={16} /> Add Keyword
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[#8e8e9e] border-b">
                  <th className="py-2">Keyword</th>
                  <th>User Flow</th>
                  <th>System Flow Code</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {keywords.map((k) => (
                  <tr key={k.keyword} className="border-b last:border-0">
                    <td className="py-3 font-mono">{k.keyword}</td>
                    <td>{k.userflowname || `#${k.userflowid}`}</td>
                    <td>{k.systemflowcode || "-"}</td>
                    <td>
                      <span
                        className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                          k.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {k.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>{k.createdat ? new Date(k.createdat).toLocaleString() : "-"}</td>
                    <td className="text-right space-x-2">
                      <button
                        onClick={() => openEdit(k)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded border text-xs hover:bg-[#f8f8f8]"
                      >
                        <Pencil size={14} /> Edit
                      </button>
                      <button
                        onClick={() => handleDelete(k)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded border border-red-300 text-red-700 text-xs hover:bg-red-50"
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {!keywords.length && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-[#8e8e9e]">
                      No system keywords yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {modalOpen && (
        <Modal onClose={closeModal}>
          <h3 className="text-lg font-bold mb-4">
            {editingKeyword ? "Edit System Keyword" : "Create System Keyword"}
          </h3>

          <label className="block text-xs font-bold text-[#8e8e9e] uppercase mb-1">
            Keyword / Command
          </label>
          <input
            className="w-full p-2.5 border rounded mb-3 text-sm"
            placeholder="e.g. /menu, /start, /reset"
            value={form.keyword}
            onChange={(e) => setForm((prev) => ({ ...prev, keyword: e.target.value }))}
            disabled={!!editingKeyword}
          />

          <label className="block text-xs font-bold text-[#8e8e9e] uppercase mb-1">
            User Flow
          </label>
          <select
            className="w-full p-2.5 border rounded mb-3 text-sm"
            value={form.userflowid}
            onChange={(e) => setForm((prev) => ({ ...prev, userflowid: e.target.value }))}
          >
            <option value="">-- Select user flow --</option>
            {userFlows.map((uf) => (
              <option key={uf.userflowid} value={uf.userflowid}>
                {uf.userflowname} (#{uf.userflowid})
              </option>
            ))}
          </select>

          <label className="block text-xs font-bold text-[#8e8e9e] uppercase mb-1">
            Optional System Flow
          </label>
          <select
            className="w-full p-2.5 border rounded mb-3 text-sm"
            value={form.systemflowid}
            onChange={(e) => setForm((prev) => ({ ...prev, systemflowid: e.target.value }))}
          >
            <option value="">-- None --</option>
            {systemFlows.map((sf) => (
              <option key={sf.systemflowid} value={sf.systemflowid}>
                {sf.code} - {sf.userflowname || `#${sf.userflowid}`}
              </option>
            ))}
          </select>

          <label className="inline-flex items-center gap-2 text-sm mb-4">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
            />
            Active
          </label>

          <div className="flex justify-end gap-2">
            <button
              onClick={closeModal}
              className="px-4 py-2 rounded border text-sm"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 rounded bg-[#43b899] text-white text-sm font-bold disabled:opacity-60"
              disabled={saving}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white w-full max-w-lg rounded-xl border border-[#e0e0e7] shadow-xl p-6 relative">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-[#8e8e9e] hover:text-[#3e3e55]"
        >
          <X size={18} />
        </button>
        {children}
      </div>
    </div>
  );
}

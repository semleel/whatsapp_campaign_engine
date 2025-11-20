"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3000";

type Tag = {
  tagid: number;
  name: string;
  isdeleted?: boolean | null;
  createdat?: string | null;
  updatedat?: string | null;
};

type FilterStatus = "All" | "Active" | "Archived";

type ConfirmState = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
};

export default function TagsPage() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<FilterStatus>("All");

  // create
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  // edit
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  // feedback banner
  const [message, setMessage] = useState<string | null>(null);

  // confirm modal (WANotifier-style, same as template page)
  const [confirm, setConfirm] = useState<ConfirmState>({
    open: false,
    title: "",
    message: "",
    confirmLabel: "Confirm",
    cancelLabel: "Cancel",
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

  const loadTags = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE}/api/tags?includeDeleted=true`);
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }
      const data: Tag[] = await res.json();
      setTags(data);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Failed to load tags");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTags();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showMsg = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 2500);
  };

  const filteredTags = useMemo(() => {
    return tags.filter((t) => {
      if (filter === "All") return true;
      const archived = !!t.isdeleted;
      if (filter === "Active") return !archived;
      if (filter === "Archived") return archived;
      return true;
    });
  }, [tags, filter]);

  const createTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      showMsg("Tag name is required");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE}/api/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });

      const ct = res.headers.get("content-type") || "";
      const data = ct.includes("application/json")
        ? await res.json()
        : await res.text();

      if (!res.ok) {
        const errMsg =
          typeof data === "string"
            ? data
            : data?.error || data?.message || "Failed to create tag";
        throw new Error(errMsg);
      }

      setNewName("");
      showMsg("Tag created");
      await loadTags();
    } catch (e: any) {
      console.error(e);
      showMsg(e?.message || "Failed to create tag");
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (tag: Tag) => {
    setEditingId(tag.tagid);
    setEditName(tag.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
  };

  const saveEdit = async (tagid: number) => {
    if (!editName.trim()) {
      showMsg("Tag name cannot be empty");
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/tags/${tagid}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      });

      const ct = res.headers.get("content-type") || "";
      const data = ct.includes("application/json")
        ? await res.json()
        : await res.text();

      if (!res.ok) {
        const errMsg =
          typeof data === "string"
            ? data
            : data?.error || data?.message || "Failed to update tag";
        throw new Error(errMsg);
      }

      showMsg("Tag updated");
      setEditingId(null);
      setEditName("");
      await loadTags();
    } catch (e: any) {
      console.error(e);
      showMsg(e?.message || "Failed to update tag");
    }
  };

  // actual archive call
  const performArchive = async (tag: Tag) => {
    try {
      const res = await fetch(`${API_BASE}/api/tags/${tag.tagid}/archive`, {
        method: "POST",
      });
      const txt = await res.text();
      if (!res.ok) {
        throw new Error(txt || "Failed to archive tag");
      }
      showMsg("Tag archived");
      await loadTags();
    } catch (e: any) {
      console.error(e);
      showMsg(e?.message || "Failed to archive tag");
    }
  };

  // actual recover call
  const performRecover = async (tag: Tag) => {
    try {
      const res = await fetch(`${API_BASE}/api/tags/${tag.tagid}/recover`, {
        method: "POST",
      });
      const txt = await res.text();
      if (!res.ok) {
        throw new Error(txt || "Failed to recover tag");
      }
      showMsg("Tag recovered");
      await loadTags();
    } catch (e: any) {
      console.error(e);
      showMsg(e?.message || "Failed to recover tag");
    }
  };

  // open confirm modals (same UX as template page)
  const archiveTag = (tag: Tag) => {
    openConfirm({
      title: "Archive tag?",
      message: `This will archive the tag "${tag.name}" so it no longer appears in the active list.`,
      confirmLabel: "Archive",
      cancelLabel: "Cancel",
      onConfirm: () => {
        closeConfirm();
        void performArchive(tag);
      },
    });
  };

  const recoverTag = (tag: Tag) => {
    openConfirm({
      title: "Recover tag?",
      message: `This will restore the tag "${tag.name}" so it appears again in the list.`,
      confirmLabel: "Recover",
      cancelLabel: "Cancel",
      onConfirm: () => {
        closeConfirm();
        void performRecover(tag);
      },
    });
  };

  const formatDate = (value?: string | null) => {
    if (!value) return "-";
    try {
      return new Date(value).toLocaleString();
    } catch {
      return value;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Tags</h3>
          <p className="text-sm text-muted-foreground">
            Define reusable tags to classify templates, similar to genres on
            Steam.
          </p>
        </div>
        <Link
          href="/content/templates"
          className="text-sm text-primary hover:underline"
        >
          Back to Template Library
        </Link>
      </div>

      {/* Info / message row */}
      {message && (
        <div className="rounded-md border bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-md border bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Create new tag */}
      <form
        onSubmit={createTag}
        className="rounded-xl border bg-card p-4 flex flex-wrap items-center gap-3"
      >
        <div className="flex-1 min-w-[220px]">
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            New tag name
          </label>
          <input
            type="text"
            className="w-full rounded-md border px-3 py-2 text-sm"
            placeholder="e.g. Open World, Promotions, OTP"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
        </div>
        <button
          type="submit"
          disabled={creating}
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-50"
        >
          {creating ? "Creating..." : "Add Tag"}
        </button>
      </form>

      {/* List + filters */}
      <div className="rounded-xl border bg-card p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 className="text-sm font-semibold">Tag list</h4>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Filter:</span>
            <div className="inline-flex rounded-md border bg-background p-1">
              {(["All", "Active", "Archived"] as FilterStatus[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1 rounded-md ${
                    filter === f
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <p className="text-xs text-muted-foreground">Loading tags...</p>
        ) : filteredTags.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No tags found. Try changing the filter or create your first tag
            above.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-xs">
                    ID
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-xs">
                    Name
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-xs">
                    Status
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-xs">
                    Created
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-xs">
                    Updated
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-xs">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredTags.map((tag) => {
                  const archived = !!tag.isdeleted;
                  const isEditing = editingId === tag.tagid;

                  return (
                    <tr key={tag.tagid} className="border-t">
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {tag.tagid}
                      </td>
                      <td className="px-3 py-2 text-sm">
                        {isEditing ? (
                          <input
                            className="w-full rounded-md border px-2 py-1 text-sm"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                          />
                        ) : (
                          tag.name
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 ${
                            archived
                              ? "bg-slate-100 text-slate-600 border-slate-300"
                              : "bg-emerald-50 text-emerald-700 border-emerald-200"
                          }`}
                        >
                          {archived ? "Archived" : "Active"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {formatDate(tag.createdat)}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {formatDate(tag.updatedat)}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {isEditing ? (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="rounded-md border px-2 py-1"
                              onClick={() => saveEdit(tag.tagid)}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="rounded-md border px-2 py-1 text-muted-foreground"
                              onClick={cancelEdit}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="text-primary hover:underline"
                              onClick={() => startEdit(tag)}
                            >
                              Edit
                            </button>
                            {!archived ? (
                              <button
                                type="button"
                                className="text-red-500 hover:underline"
                                onClick={() => archiveTag(tag)}
                              >
                                Archive
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="text-emerald-600 hover:underline"
                                onClick={() => recoverTag(tag)}
                              >
                                Recover
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirm Modal – same style as template page */}
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
    </div>
  );
}

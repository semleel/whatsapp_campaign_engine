 "use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Api } from "@/lib/client";
import { usePrivilege } from "@/lib/permissions";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3000";

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
  const { canView, canCreate, canUpdate, canArchive, loading: privLoading } =
    usePrivilege("content");

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
      if (privLoading) return;
      if (!canView) {
        setError("You do not have permission to view tags.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      const data: Tag[] = await Api.listTags(true);
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
  }, [canView, privLoading]);

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
    if (!canCreate) {
      showMsg("You do not have permission to create tags.");
      return;
    }
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
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }
      setNewName("");
      showMsg("Tag created");
      await loadTags();
    } catch (err: any) {
      console.error(err);
      showMsg(err?.message || "Failed to create tag");
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (tag: Tag) => {
    if (!canUpdate) {
      showMsg("You do not have permission to edit tags.");
      return;
    }
    setEditingId(tag.tagid);
    setEditName(tag.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
  };

  const saveEdit = async () => {
    if (!editingId) return;
    if (!canUpdate) {
      showMsg("You do not have permission to edit tags.");
      return;
    }
    const name = editName.trim();
    if (!name) {
      showMsg("Name is required");
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/tags/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }
      showMsg("Tag updated");
      setEditingId(null);
      setEditName("");
      await loadTags();
    } catch (err: any) {
      console.error(err);
      showMsg(err?.message || "Failed to update tag");
    }
  };

  const handleArchive = (tag: Tag) => {
    if (!canArchive) {
      showMsg("You do not have permission to archive tags.");
      return;
    }
    openConfirm({
      title: "Archive tag?",
      message: `Archive tag "${tag.name}"?`,
      confirmLabel: "Archive",
      onConfirm: () => doArchive(tag.tagid),
    });
  };

  const handleRecover = (tag: Tag) => {
    if (!canUpdate) {
      showMsg("You do not have permission to update tags.");
      return;
    }
    openConfirm({
      title: "Recover tag?",
      message: `Recover tag "${tag.name}"?`,
      confirmLabel: "Recover",
      onConfirm: () => doRecover(tag.tagid),
    });
  };

  const doArchive = async (id: number) => {
    const res = await fetch(`/api/tags/${id}/archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error(await res.text());
    showMsg("Tag archived.");
    await loadTags();
  };

  const doRecover = async (id: number) => {
    const res = await fetch(`/api/tags/${id}/recover`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error(await res.text());
    showMsg("Tag recovered.");
    await loadTags();
  };

  if (!privLoading && !canView) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
        You do not have permission to view tags.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Loading tags...</div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-sm text-red-600">{error}</div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Content Tags</h3>
          <p className="text-sm text-muted-foreground">
            Organize templates with reusable tags. Archived tags remain linked to history.
          </p>
        </div>
        {canCreate && (
          <Link
            href="/content/tags/create"
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90"
          >
            New Tag
          </Link>
        )}
      </div>

      {message && (
        <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-700">
          {message}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          className="rounded-md border px-3 py-2 text-sm"
          value={filter}
          onChange={(e) => setFilter(e.target.value as FilterStatus)}
        >
          <option value="All">All</option>
          <option value="Active">Active</option>
          <option value="Archived">Archived</option>
        </select>
        <span className="text-xs text-muted-foreground">{tags.length} tags</span>
      </div>

      {/* Create form */}
      {canCreate && (
        <form onSubmit={createTag} className="flex flex-wrap items-center gap-2">
          <input
            className="w-full max-w-xs rounded-md border px-3 py-2 text-sm"
            placeholder="New tag name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button
            type="submit"
            className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            disabled={creating}
          >
            {creating ? "Creating..." : "Create"}
          </button>
        </form>
      )}

      {/* Tag table */}
      <div className="rounded-xl border overflow-x-auto bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Name</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-left font-medium">Updated</th>
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredTags.map((tag) => {
              const isArchived = !!tag.isdeleted;
              const active = !isArchived;
              return (
                <tr key={tag.tagid} className="border-t">
                  <td className="px-3 py-2">
                    {editingId === tag.tagid ? (
                      <input
                        className="rounded-md border px-2 py-1 text-sm"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                    ) : (
                      <span className="font-medium">{tag.name}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {active ? (
                      <span className="pill bg-emerald-100 text-emerald-700">Active</span>
                    ) : (
                      <span className="pill bg-slate-100 text-slate-700">Archived</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {tag.updatedat ? new Date(tag.updatedat).toLocaleString() : "-"}
                  </td>
                  <td className="px-3 py-2 text-right space-x-2">
                    {editingId === tag.tagid ? (
                      <>
                        <button
                          type="button"
                          onClick={saveEdit}
                          className="rounded-md border px-2 py-1 text-xs"
                          disabled={!canUpdate}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="rounded-md border px-2 py-1 text-xs"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        {canUpdate && active && (
                          <button
                            type="button"
                            onClick={() => startEdit(tag)}
                            className="rounded-md border px-2 py-1 text-xs"
                          >
                            Edit
                          </button>
                        )}
                        {active && canArchive && (
                          <button
                            type="button"
                            onClick={() => handleArchive(tag)}
                            className="rounded-md border px-2 py-1 text-xs text-rose-700 border-rose-200"
                          >
                            Archive
                          </button>
                        )}
                        {!active && canUpdate && (
                          <button
                            type="button"
                            onClick={() => handleRecover(tag)}
                            className="rounded-md border px-2 py-1 text-xs"
                          >
                            Recover
                          </button>
                        )}
                        {!canUpdate && !canArchive && (
                          <span className="text-xs text-muted-foreground">View only</span>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE_URL, clearStoredSession, getStoredAdmin, getStoredToken } from "@/lib/auth";

type Staff = {
  adminid: number;
  name: string | null;
  email: string;
  role: string | null;
  phonenum?: string | null;
  is_active?: boolean | null;
  createdat?: string | null;
};

const NEW_STAFF_DEFAULT = {
  name: "",
  email: "",
  password: "",
  confirmPassword: "",
  phonenum: "",
};

export default function StaffPage() {
  const router = useRouter();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [currentAdminId, setCurrentAdminId] = useState<number | null>(null);
  const [currentAdminRole, setCurrentAdminRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [newStaff, setNewStaff] = useState({ ...NEW_STAFF_DEFAULT });
  const [creating, setCreating] = useState(false);

  const [editId, setEditId] = useState<number | null>(null);
  const [editOriginal, setEditOriginal] = useState<Staff | null>(null);
  const [editData, setEditData] = useState({
    name: "",
    email: "",
    phonenum: "",
    password: "",
    confirmPassword: "",
    is_active: true as boolean | null | undefined,
  });
  const [showEditConfirm, setShowEditConfirm] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<"recent" | "oldest" | "name">("recent");

  function sanitizePayload(obj: Record<string, any>) {
    return Object.fromEntries(
      Object.entries(obj).filter(([_, v]) => v !== undefined && v !== null && v !== "")
    );
  }

  function rolePriority(role: string | null | undefined) {
    if (!role) return 1;
    return role.toLowerCase() === "admin" ? 0 : 1;
  }

  function formatRole(role: string | null | undefined) {
    const r = (role || "").trim();
    if (!r) return "-";
    return r.charAt(0).toUpperCase() + r.slice(1).toLowerCase();
  }

  function parseDate(value: string | null | undefined) {
    const t = value ? Date.parse(value) : NaN;
    return Number.isNaN(t) ? 0 : t;
  }

  const displayedStaff = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = !term
      ? staff
      : staff.filter((s) => {
          return (
            (s.name || "").toLowerCase().includes(term) ||
            (s.email || "").toLowerCase().includes(term) ||
            (s.phonenum || "").toLowerCase().includes(term)
          );
        });

    const sorted = [...filtered].sort((a, b) => {
      // Always pin admins first
      const rpA = rolePriority(a.role);
      const rpB = rolePriority(b.role);
      if (rpA !== rpB) return rpA - rpB;

      if (sortKey === "name") {
        return (a.name || a.email).localeCompare(b.name || b.email);
      }

      const da = parseDate(a.createdat);
      const db = parseDate(b.createdat);
      const diff = sortKey === "recent" ? db - da : da - db;
      if (diff !== 0) return diff;

      // tie-breaker by id
      return a.adminid - b.adminid;
    });

    return sorted;
  }, [staff, search, sortKey]);

  useEffect(() => {
    const admin = getStoredAdmin();
    if (admin?.id) setCurrentAdminId(admin.id);
    if (admin?.role) setCurrentAdminRole((admin.role as string).toLowerCase());
    loadStaff();
  }, []);

  async function loadStaff() {
    try {
      setLoading(true);
      setError(null);
      const token = getStoredToken();
      if (!token) {
        router.replace("/login");
        return;
      }

      const res = await fetch(`${API_BASE_URL}/api/admin`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) {
        clearStoredSession();
        router.replace("/login");
        return;
      }
      if (res.status === 403) {
        setError("You need admin permissions to manage staff.");
        return;
      }
      if (!res.ok) throw new Error(`Failed to load staff (${res.status})`);

      const data = await res.json();
      setStaff(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message || "Failed to load staff");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    try {
      setCreating(true);
      const token = getStoredToken();
      if (!token) {
        router.replace("/login");
        return;
      }

      if (!newStaff.email || !newStaff.password) {
        setError("Email and password are required");
        return;
      }
      if (newStaff.password !== newStaff.confirmPassword) {
        setError("Password and confirmation do not match");
        return;
      }

      if (!window.confirm(`Create staff ${newStaff.email}?`)) {
        setCreating(false);
        return;
      }

      const res = await fetch(`${API_BASE_URL}/api/admin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(newStaff),
      });

      if (res.status === 401) {
        clearStoredSession();
        router.replace("/login");
        return;
      }
      if (res.status === 403) {
        setError("You need admin permissions to create staff.");
        return;
      }

      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail?.error || `Failed to create staff (${res.status})`);
      }

      setMessage("Staff created");
      setNewStaff({ ...NEW_STAFF_DEFAULT });
      await loadStaff();
    } catch (err: any) {
      setError(err.message || "Failed to create staff");
    } finally {
      setCreating(false);
    }
  }

  function startEdit(member: Staff) {
    if (member.role?.toLowerCase() === "admin" && currentAdminRole !== "admin") {
      setError("Staff cannot edit admin information.");
      return;
    }
    setMessage(null);
    setEditId(member.adminid);
    setEditOriginal(member);
    setEditData({
      name: member.name || "",
      email: member.email,
      phonenum: member.phonenum || "",
      password: "",
      confirmPassword: "",
      is_active: member.is_active ?? true,
    });
    setShowEditConfirm(false);
  }

  function cancelEdit() {
    setEditId(null);
    setEditOriginal(null);
    setEditData({
      name: "",
      email: "",
      phonenum: "",
      password: "",
      confirmPassword: "",
      is_active: true,
    });
    setShowEditConfirm(false);
  }

  function toggleEdit(member: Staff) {
    if (member.role?.toLowerCase() === "admin" && currentAdminRole !== "admin") {
      setError("Staff cannot edit admin information.");
      return;
    }
    if (editId === member.adminid) {
      cancelEdit();
    } else {
      startEdit(member);
    }
  }

  function undoChanges() {
    if (!editOriginal) {
      cancelEdit();
      return;
    }
    setEditData({
      name: editOriginal.name || "",
      email: editOriginal.email,
      phonenum: editOriginal.phonenum || "",
      password: "",
      confirmPassword: "",
      is_active: editOriginal.is_active ?? true,
    });
    setShowEditConfirm(false);
    setMessage(null);
    setError(null);
  }

  async function saveEdit(id: number | null) {
    if (!id) return;
    const passwordProvided = !!(editData.password || editData.confirmPassword);
    if (passwordProvided) {
      if (!editData.password || !editData.confirmPassword) {
        setError("Password and confirmation are required");
        return;
      }
      if (editData.password !== editData.confirmPassword) {
        setError("Password and confirmation do not match");
        return;
      }
    }
    if (!window.confirm("Save these changes?")) return;
    try {
      setSavingEdit(true);
      setMessage(null);
      setError(null);
      const token = getStoredToken();
      if (!token) {
        router.replace("/login");
        return;
      }

      const payload = sanitizePayload({
        name: editData.name,
        email: editData.email,
        phonenum: editData.phonenum,
        is_active: editData.is_active,
        password: editData.password,
      });

      const res = await fetch(`${API_BASE_URL}/api/admin/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.status === 401) {
        clearStoredSession();
        router.replace("/login");
        return;
      }
      if (res.status === 403) {
        setError("You need admin permissions to update staff.");
        return;
      }
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail?.error || `Failed to update staff (${res.status})`);
      }

      const updated = await res.json();
      setStaff((list) => list.map((row) => (row.adminid === id ? { ...row, ...updated } : row)));
      setEditOriginal(updated);
      startEdit(updated);
      setShowEditConfirm(false);
      setMessage("Staff updated");
    } catch (err: any) {
      setError(err.message || "Failed to update staff");
    } finally {
      setSavingEdit(false);
    }
  }

  async function toggleActive(member: Staff) {
    if (member.role?.toLowerCase() === "admin" && currentAdminRole !== "admin") {
      setError("Staff cannot change admin status.");
      return;
    }
    if (currentAdminId && member.adminid === currentAdminId) {
      setError("You cannot deactivate your own account.");
      return;
    }
    const newActive = member.is_active === false ? true : false;
    const actionLabel = newActive ? "activate" : "deactivate";
    if (!window.confirm(`Are you sure you want to ${actionLabel} ${member.email}?`)) return;
    setEditId(null);
    setError(null);
    try {
      const token = getStoredToken();
      if (!token) {
        router.replace("/login");
        return;
      }
      const res = await fetch(`${API_BASE_URL}/api/admin/${member.adminid}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(
          sanitizePayload({
            name: member.name,
            email: member.email,
            phonenum: member.phonenum,
            is_active: newActive,
          })
        ),
      });

      if (res.status === 401) {
        clearStoredSession();
        router.replace("/login");
        return;
      }
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail?.error || `Failed to update status (${res.status})`);
      }

      setStaff((list) =>
        list.map((row) =>
          row.adminid === member.adminid ? { ...row, is_active: newActive } : row
        )
      );
    } catch (err: any) {
      setError(err.message || "Failed to change status");
    }
  }

  async function deleteStaff(member: Staff) {
    if (member.role?.toLowerCase() === "admin" && currentAdminRole !== "admin") {
      setError("Staff cannot disable admin accounts.");
      return;
    }
    if (currentAdminId && member.adminid === currentAdminId) {
      setError("You cannot disable your own account.");
      return;
    }
    if (!window.confirm(`Disable staff ${member.email}? This will mark them inactive.`)) return;
    setError(null);
    try {
      const token = getStoredToken();
      if (!token) {
        router.replace("/login");
        return;
      }

      const res = await fetch(`${API_BASE_URL}/api/admin/${member.adminid}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) {
        clearStoredSession();
        router.replace("/login");
        return;
      }
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail?.error || `Failed to disable staff (${res.status})`);
      }

      setStaff((list) =>
        list.map((row) =>
          row.adminid === member.adminid ? { ...row, is_active: false } : row
        )
      );
    } catch (err: any) {
      setError(err.message || "Failed to disable staff");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Staff directory</h3>
          <p className="text-sm text-muted-foreground">
            Manage staff accounts (create, update details, activate/deactivate).
          </p>
        </div>
      </div>

      <form onSubmit={handleCreate} className="rounded-xl border p-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Full name</label>
            <input
              className="w-full rounded-md border px-3 py-2 text-sm"
              value={newStaff.name}
              onChange={(e) => setNewStaff((s) => ({ ...s, name: e.target.value }))}
              placeholder="Jane Doe"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Email *</label>
            <input
              className="w-full rounded-md border px-3 py-2 text-sm"
              type="email"
              value={newStaff.email}
              onChange={(e) => setNewStaff((s) => ({ ...s, email: e.target.value }))}
              placeholder="jane@company.com"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Phone</label>
            <input
              className="w-full rounded-md border px-3 py-2 text-sm"
              value={newStaff.phonenum}
              onChange={(e) => setNewStaff((s) => ({ ...s, phonenum: e.target.value }))}
              placeholder="+65..."
            />
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3 items-end">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Password *</label>
            <input
              className="w-full rounded-md border px-3 py-2 text-sm"
              type="password"
              value={newStaff.password}
              onChange={(e) => setNewStaff((s) => ({ ...s, password: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Confirm password *</label>
            <input
              className="w-full rounded-md border px-3 py-2 text-sm"
              type="password"
              value={newStaff.confirmPassword}
              onChange={(e) => setNewStaff((s) => ({ ...s, confirmPassword: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-1">
            <button
              type="submit"
              disabled={creating}
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              {creating ? "Saving..." : "Add staff"}
            </button>
          </div>
        </div>
      </form>

      {loading && <p className="text-sm text-muted-foreground">Loading staff...</p>}
      {error && !loading && <p className="text-sm text-red-600">{error}</p>}
      {message && !loading && !error && <p className="text-sm text-emerald-700">{message}</p>}

      {!loading && !error && (
        <>
          <div className="mt-4">
            <h4 className="text-base font-semibold">Staff list</h4>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <input
                className="rounded-md border px-3 py-2 text-sm"
                placeholder="Search name, email, phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Sort by</label>
              <select
                className="rounded-md border px-2 py-1 text-sm"
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
              >
                <option value="recent">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="name">Name A-Z</option>
              </select>
            </div>
          </div>
          <div className="rounded-xl border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Name</th>
                  <th className="px-3 py-2 text-left font-medium">Email</th>
                  <th className="px-3 py-2 text-left font-medium">Role</th>
                  <th className="px-3 py-2 text-left font-medium">Phone</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-left font-medium">Created</th>
                  <th className="px-3 py-2 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
              {displayedStaff.map((member) => (
                <Fragment key={member.adminid}>
                  <tr className="border-t align-middle">
                      <td className="px-3 py-2">{member.name || "-"}</td>
                      <td className="px-3 py-2">{member.email}</td>
                      <td className="px-3 py-2">{formatRole(member.role)}</td>
                      <td className="px-3 py-2">{member.phonenum || "-"}</td>
                      <td className="px-3 py-2 text-xs">
                        {member.is_active === false ? (
                          <span className="rounded-full bg-rose-100 px-3 py-1 text-rose-700">
                            Inactive
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {member.createdat ? new Date(member.createdat).toLocaleDateString() : "-"}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            className={`btn flex items-center gap-1 ${member.role?.toLowerCase() === "admin" && currentAdminRole !== "admin" ? "opacity-60 cursor-not-allowed border border-sky-100" : "border border-sky-200 bg-sky-50 text-sky-700"}`}
                            onClick={() => toggleEdit(member)}
                            disabled={member.role?.toLowerCase() === "admin" && currentAdminRole !== "admin"}
                          >
                            <span>Edit</span>
                            <svg
                              className={`h-3.5 w-3.5 transition-transform ${editId === member.adminid ? "rotate-180" : ""}`}
                              viewBox="0 0 20 20"
                              fill="currentColor"
                              aria-hidden="true"
                            >
                              <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.17l3.71-2.94a.75.75 0 0 1 .94 1.17l-4.19 3.33a.75.75 0 0 1-.94 0l-4.19-3.33a.75.75 0 0 1-.02-1.06z" />
                            </svg>
                          </button>
                          {currentAdminId === member.adminid ? (
                            <>
                              <button className="btn btn-ghost opacity-60 cursor-not-allowed" disabled>
                                Deactivate
                              </button>
                              <button className="btn btn-ghost opacity-60 cursor-not-allowed" disabled>
                                Disable
                              </button>
                            </>
                          ) : member.role?.toLowerCase() === "admin" && currentAdminRole !== "admin" ? (
                            <>
                              <button className="btn btn-ghost opacity-60 cursor-not-allowed" disabled>
                                Deactivate
                              </button>
                              <button className="btn btn-ghost opacity-60 cursor-not-allowed" disabled>
                                Disable
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                className={`btn ${member.is_active === false ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-amber-50 text-amber-700 border border-amber-200"}`}
                                onClick={() => toggleActive(member)}
                              >
                                {member.is_active === false ? "Activate" : "Deactivate"}
                              </button>
                              <button
                                className="btn bg-rose-50 text-rose-700 border border-rose-200"
                                onClick={() => deleteStaff(member)}
                              >
                                Disable
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>

                    {editId === member.adminid && (
                      <tr className="border-t bg-muted/20">
                        <td colSpan={7} className="px-3 py-3">
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <h4 className="text-base font-semibold">Edit Personal Info</h4>
                                <p className="text-xs text-muted-foreground">Updating: #{editId}</p>
                              </div>
                              <button
                                className="btn border border-rose-200 bg-rose-50 text-rose-700"
                                onClick={cancelEdit}
                              >
                                Close
                              </button>
                            </div>

                            <div className="grid gap-3 md:grid-cols-2">
                              <div className="space-y-1">
                                <label className="text-xs font-semibold text-muted-foreground">Full name</label>
                                <input
                                  className="w-full rounded-md border px-3 py-2 text-sm"
                                  value={editData.name}
                                  onChange={(e) => setEditData((s) => ({ ...s, name: e.target.value }))}
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs font-semibold text-muted-foreground">Email</label>
                                <input
                                  className="w-full rounded-md border px-3 py-2 text-sm"
                                  value={editData.email}
                                  onChange={(e) => setEditData((s) => ({ ...s, email: e.target.value }))}
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs font-semibold text-muted-foreground">Phone</label>
                                <input
                                  className="w-full rounded-md border px-3 py-2 text-sm"
                                  value={editData.phonenum}
                                  onChange={(e) => setEditData((s) => ({ ...s, phonenum: e.target.value }))}
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs font-semibold text-muted-foreground">Password (optional)</label>
                                <input
                                  className="w-full rounded-md border px-3 py-2 text-sm"
                                  type="password"
                                  value={editData.password}
                                  onFocus={() => setShowEditConfirm(true)}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setEditData((s) => ({ ...s, password: val }));
                                    setShowEditConfirm(!!val);
                                  }}
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs font-semibold text-muted-foreground">Status</label>
                                <select
                                  className="w-full rounded-md border px-3 py-2 text-sm"
                                  value={editData.is_active ? "active" : "inactive"}
                                  onChange={(e) =>
                                    setEditData((s) => ({ ...s, is_active: e.target.value === "active" }))
                                  }
                                  disabled={currentAdminId === editId}
                                >
                                  <option value="active">Active</option>
                                  <option value="inactive">Inactive</option>
                                </select>
                                {currentAdminId === editId && (
                                  <p className="text-xs text-amber-600">You cannot deactivate your own account.</p>
                                )}
                              </div>
                              {showEditConfirm && (
                                <div className="space-y-1">
                                  <label className="text-xs font-semibold text-muted-foreground">Confirm password</label>
                                  <input
                                    className="w-full rounded-md border px-3 py-2 text-sm"
                                    type="password"
                                    value={editData.confirmPassword}
                                    onChange={(e) =>
                                      setEditData((s) => ({ ...s, confirmPassword: e.target.value }))
                                    }
                                    placeholder="Re-enter password"
                                  />
                                </div>
                              )}
                            </div>

                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => saveEdit(editId)}
                                disabled={savingEdit}
                                className="btn btn-primary"
                              >
                                {savingEdit ? "Saving..." : "Save changes"}
                              </button>
                              <button type="button" className="btn btn-ghost" onClick={undoChanges}>
                                Undo changes
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

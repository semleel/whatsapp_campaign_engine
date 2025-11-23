// Client-side privilege helpers.
// These are intentionally simple; server-side enforcement lives in src/middleware/permission.ts.

"use client";

import { useEffect, useState } from "react";
import { Api } from "./client";
import { getStoredAdmin } from "./auth";

export type PrivilegeFlags = {
  view: boolean;
  create: boolean;
  update: boolean;
  archive: boolean;
};

// Stored format in localStorage (fallback when API hasn’t loaded yet)
type PrivilegeStore = {
  general: Record<string, boolean>;
  perStaff: Record<number, Record<string, boolean>>;
};

const STORAGE_KEY = "staff_privileges_v1";

function loadPrivilegeStore(): PrivilegeStore {
  if (typeof window === "undefined") return { general: {}, perStaff: {} };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { general: {}, perStaff: {} };
    const parsed = JSON.parse(raw);
    // normalize numeric keys
    const perStaff: Record<number, Record<string, boolean>> = {};
    Object.entries(parsed?.perStaff || {}).forEach(([k, v]) => {
      const id = Number(k);
      if (!Number.isNaN(id)) perStaff[id] = v as Record<string, boolean>;
    });
    return { general: parsed?.general || {}, perStaff };
  } catch {
    return { general: {}, perStaff: {} };
  }
}

function savePrivilegeStore(store: PrivilegeStore) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  window.dispatchEvent(new Event("privileges-changed"));
}

function flattenPrivileges(
  privileges: Record<string, PrivilegeFlags>
): Record<string, boolean> {
  const flat: Record<string, boolean> = {};
  Object.entries(privileges || {}).forEach(([resource, flags]) => {
    flat[`core-access.${resource}.view`] = !!flags.view;
    flat[`core-access.${resource}.create`] = !!flags.create;
    flat[`core-access.${resource}.update`] = !!flags.update;
    flat[`core-access.${resource}.archive`] = !!flags.archive;
  });
  return flat;
}

export function persistPrivilegesForUser(
  userId: number,
  privileges: Record<string, PrivilegeFlags>
) {
  const store = loadPrivilegeStore();
  store.perStaff[userId] = flattenPrivileges(privileges);
  savePrivilegeStore(store);
}

export function getEffectivePrivilegesForUser(userId: number | null | undefined): Record<string, boolean> {
  const store = loadPrivilegeStore();
  if (!userId) return store.general;
  return store.perStaff[userId] || store.general;
}

export function hasPrivilege(
  userId: number | null | undefined,
  resourceId: string,
  action: "view" | "create" | "update" | "archive"
): boolean {
  const effective = getEffectivePrivilegesForUser(userId);
  return !!effective[`core-access.${resourceId}.${action}`];
}

export function getPrivilegeFlags(
  userId: number | null | undefined,
  resourceId: string
): PrivilegeFlags {
  return {
    view: hasPrivilege(userId, resourceId, "view"),
    create: hasPrivilege(userId, resourceId, "create"),
    update: hasPrivilege(userId, resourceId, "update"),
    archive: hasPrivilege(userId, resourceId, "archive"),
  };
}

export async function refreshPrivilegesForCurrentUser(): Promise<Record<string, boolean>> {
  const admin = getStoredAdmin();
  if (!admin?.id) return {};
  try {
    const res = await Api.getPrivileges(admin.id);
    persistPrivilegesForUser(admin.id, res.privileges || {});
    return flattenPrivileges(res.privileges || {});
  } catch (err) {
    const msg = (err as any)?.message?.toString().toLowerCase() || "";
    // Swallow expired/revoked tokens to avoid noisy console errors while keeping cached privileges.
    if (
      msg.includes("token expired") ||
      msg.includes("revoked") ||
      msg.includes("unauthorized")
    ) {
      return getEffectivePrivilegesForUser(admin.id);
    }
    console.warn("Failed to refresh privileges", err);
    return getEffectivePrivilegesForUser(admin.id);
  }
}

export function usePrivilege(resourceId: string) {
  const adminProfile = getStoredAdmin();
  const adminId = adminProfile?.id ?? null;
  const isAdmin = (adminProfile?.role || "").toLowerCase() === "admin";
  const [flags, setFlags] = useState<PrivilegeFlags>(() =>
    isAdmin
      ? { view: true, create: true, update: true, archive: true }
      : getPrivilegeFlags(adminId, resourceId)
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isAdmin) {
      setFlags({ view: true, create: true, update: true, archive: true });
      setLoading(false);
      return;
    }
    const userId = getStoredAdmin()?.id ?? null;
    if (!userId) {
      setFlags({ view: false, create: false, update: false, archive: false });
      setLoading(false);
      return;
    }
    // Start with cached privileges, then refresh from API
    setFlags(getPrivilegeFlags(userId, resourceId));
    refreshPrivilegesForCurrentUser()
      .then((flat) => {
        setFlags({
          view: !!flat[`core-access.${resourceId}.view`],
          create: !!flat[`core-access.${resourceId}.create`],
          update: !!flat[`core-access.${resourceId}.update`],
          archive: !!flat[`core-access.${resourceId}.archive`],
        });
      })
      .finally(() => setLoading(false));
  }, [resourceId, adminId, isAdmin]);

  return {
    flags,
    loading,
    canView: flags.view,
    canCreate: flags.create,
    canUpdate: flags.update,
    canArchive: flags.archive,
  };
}

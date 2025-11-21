// Client-side privilege helpers.
// These are intentionally simple; server-side enforcement lives in src/middleware/permission.ts.

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

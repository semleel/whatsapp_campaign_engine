"use client";

import { useEffect, useState } from "react";
import { Api } from "./client";
import { getStoredAdmin } from "./auth";

export type PrivilegeState = {
  loading: boolean;
  canView: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canArchive: boolean;
};

type PrivMap = Record<string, { view: boolean; create: boolean; update: boolean; archive: boolean }>;

const privilegeCache = new Map<number, PrivMap>();
const fetchPromises = new Map<number, Promise<void>>();

const EMPTY_PRIV: PrivilegeState = {
  loading: true,
  canView: false,
  canCreate: false,
  canUpdate: false,
  canArchive: false,
};

function selectModulePriv(moduleKey: string, privs: PrivMap | null): PrivilegeState {
  const module = (privs && privs[moduleKey]) || {
    view: false,
    create: false,
    update: false,
    archive: false,
  };

  return {
    loading: false,
    canView: !!module.view,
    canCreate: !!module.create,
    canUpdate: !!module.update,
    canArchive: !!module.archive,
  };
}

export function usePrivilege(moduleKey: string): PrivilegeState {
  const initialAdminId =
    typeof window !== "undefined" ? getStoredAdmin()?.id ?? null : null;
  const initialRole =
    typeof window !== "undefined" ? (getStoredAdmin()?.role || "").toLowerCase() : "";
  const isAdminRole = initialRole === "admin" || initialRole === "super";
  const initialPrivs = initialAdminId ? privilegeCache.get(initialAdminId) || null : null;

  const [state, setState] = useState<PrivilegeState>(() =>
    isAdminRole
      ? { loading: false, canView: true, canCreate: true, canUpdate: true, canArchive: true }
      : initialPrivs
      ? selectModulePriv(moduleKey, initialPrivs)
      : EMPTY_PRIV
  );
  const [authVersion, setAuthVersion] = useState(0);

  useEffect(() => {
    function handleAuthChanged() {
      privilegeCache.clear();
      fetchPromises.clear();
      setState(EMPTY_PRIV);
      setAuthVersion((v) => v + 1);
    }

    if (typeof window !== "undefined") {
      window.addEventListener("auth-changed", handleAuthChanged);
      return () => {
        window.removeEventListener("auth-changed", handleAuthChanged);
      };
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const admin = getStoredAdmin();
    const adminId = admin?.id ?? null;
    const role = (admin?.role || "").toLowerCase();
    const isAdmin = role === "admin" || role === "super";

    if (isAdmin) {
      setState({
        loading: false,
        canView: true,
        canCreate: true,
        canUpdate: true,
        canArchive: true,
      });
      return () => {
        cancelled = true;
      };
    }

    async function ensurePrivilegesLoaded(currentAdminId: number | null) {
      if (!currentAdminId) {
        if (!cancelled) {
          setState({ ...EMPTY_PRIV, loading: false });
        }
        return;
      }

      try {
        if (!privilegeCache.has(currentAdminId)) {
          let promise = fetchPromises.get(currentAdminId);
          if (!promise) {
            promise = Api.getPrivileges(currentAdminId)
              .then((res) => {
                privilegeCache.set(currentAdminId, res.privileges || {});
              })
              .finally(() => {
                fetchPromises.delete(currentAdminId);
              });
            fetchPromises.set(currentAdminId, promise);
          }
          await promise;
        }

        if (cancelled) return;
        const privs = privilegeCache.get(currentAdminId) || null;
        setState(selectModulePriv(moduleKey, privs));
      } catch (err) {
        if (cancelled) return;
        setState({ ...EMPTY_PRIV, loading: false });
        console.error("[usePrivilege] Failed to load privileges:", err);
      }
    }

    ensurePrivilegesLoaded(adminId);

    return () => {
      cancelled = true;
    };
  }, [moduleKey, authVersion]);

  return state;
}

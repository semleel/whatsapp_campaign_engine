"use client";

import { useEffect, useState } from "react";
import { Api } from "./client";

export type PrivilegeState = {
  loading: boolean;
  canView: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canArchive: boolean;
};

type PrivMap = Record<string, { view: boolean; create: boolean; update: boolean; archive: boolean }>;

let cachedPrivileges: PrivMap | null = null;
let fetchPromise: Promise<void> | null = null;

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
  const [state, setState] = useState<PrivilegeState>(() =>
    cachedPrivileges ? selectModulePriv(moduleKey, cachedPrivileges) : EMPTY_PRIV
  );

  useEffect(() => {
    let cancelled = false;

    async function ensurePrivilegesLoaded() {
      try {
        if (!cachedPrivileges) {
          if (!fetchPromise) {
            fetchPromise = Api.getPrivileges(1)
              .then((res) => {
                cachedPrivileges = res.privileges || {};
              })
              .finally(() => {
                fetchPromise = null;
              });
          }
          await fetchPromise;
        }

        if (cancelled) return;
        setState(selectModulePriv(moduleKey, cachedPrivileges));
      } catch (err) {
        if (cancelled) return;
        setState((prev) => ({ ...prev, loading: false }));
        console.error("[usePrivilege] Failed to load privileges:", err);
      }
    }

    ensurePrivilegesLoaded();

    return () => {
      cancelled = true;
    };
  }, [moduleKey]);

  return state;
}

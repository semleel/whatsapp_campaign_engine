"use client";

import { ReactNode } from "react";
import { usePrivilege } from "@/lib/permissions";

type Props = {
  resource: string;
  children: ReactNode;
  fallback?: ReactNode;
};

/**
 * Client-side gate for page-level visibility.
 * Shows a fallback message when the current user lacks view permission.
 */
export default function PrivilegeGate({ resource, children, fallback }: Props) {
  const { canView, loading } = usePrivilege(resource);

  if (loading) return null;
  if (!canView) {
    return (
      (fallback as any) || (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          You do not have permission to view this section.
        </div>
      )
    );
  }

  return <>{children}</>;
}

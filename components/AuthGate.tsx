"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getStoredAdmin, getStoredToken } from "@/lib/auth";

const PUBLIC_ROUTES = new Set(["/login"]);

export default function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const [checked, setChecked] = useState(() => PUBLIC_ROUTES.has(pathname));
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    const admin = getStoredAdmin();
    if (admin?.role) setRole(admin.role);

    if (PUBLIC_ROUTES.has(pathname)) {
      setChecked(true);
      return;
    }

    const token = getStoredToken();
    if (!token) {
      router.replace("/login");
      return;
    }

    setChecked(true);
  }, [pathname, router]);

  if (!checked) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Checking session...
      </div>
    );
  }

  return <>{children}</>;
}

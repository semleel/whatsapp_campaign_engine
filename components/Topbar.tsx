"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getStoredAdmin, requestLogout } from "@/lib/auth";
import ThemeToggle from "./ThemeToggle";

const HIDDEN_ROUTES = new Set(["/login"]);

export default function Topbar() {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [adminEmail, setAdminEmail] = useState<string | undefined>();
  const [adminName, setAdminName] = useState<string | undefined | null>();
  const [adminRole, setAdminRole] = useState<string | undefined | null>();
  const roleLabel = adminRole ? adminRole.charAt(0).toUpperCase() + adminRole.slice(1) : "Staff";

  useEffect(() => {
    const admin = getStoredAdmin();
    setAdminEmail(admin?.email || undefined);
    setAdminName(admin?.name);
    setAdminRole(admin?.role);
  }, [pathname]);

  const initials = useMemo(() => {
    const source = (adminName || adminEmail || "").trim();
    if (!source) return "";
    return source
      .split(/\s+/)
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }, [adminEmail, adminName]);

  if (HIDDEN_ROUTES.has(pathname)) return null;

  async function handleLogout() {
    try {
      setLoading(true);
      await requestLogout();
      router.replace("/login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="h-14 border-b border-border flex items-center justify-between px-4 bg-[linear-gradient(90deg,rgba(0,0,0,0)_0%,color-mix(in_oklch,var(--primary)6%,transparent)_50%,rgba(0,0,0,0)_100%)]">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">Team Dashboard</h1>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden md:flex items-center gap-2 rounded-lg border border-border bg-secondary px-2">
          <svg width="16" height="16" viewBox="0 0 24 24" className="opacity-70">
            <path fill="currentColor" d="m21.53 20.47l-3.66-3.66A8.49 8.49 0 0 0 19 11.5A8.5 8.5 0 1 0 10.5 20a8.49 8.49 0 0 0 5.31-1.13l3.66 3.66zM4 11.5A6.5 6.5 0 1 1 10.5 18A6.51 6.51 0 0 1 4 11.5" />
          </svg>
          <input
            placeholder="Search..."
            className="bg-transparent text-sm py-1.5 outline-none placeholder:opacity-60"
          />
        </div>

        <ThemeToggle />

        {adminEmail && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/70 px-3 py-1.5 text-sm">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary font-semibold">
              {initials || "A"}
            </div>
            <div className="leading-tight">
              <div className="font-medium">{adminName || adminEmail}</div>
              <div className="text-xs text-muted-foreground">{roleLabel}</div>
            </div>
          </div>
        )}

        <button className="btn btn-ghost">Feedback</button>
        <button
          onClick={handleLogout}
          disabled={loading}
          className="btn btn-primary"
        >
          {loading ? "Logging out..." : "Logout"}
        </button>
      </div>
    </div>
  );
}

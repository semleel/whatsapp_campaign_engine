"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import SidebarSection from "./SidebarSection";
import { MENU } from "@/lib/menuConfig";
import { getStoredAdmin } from "@/lib/auth";
import { Api } from "@/lib/client";
import { persistPrivilegesForUser } from "@/lib/permissions";

export default function Sidebar() {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);
  const [allowedSections, setAllowedSections] = useState<Set<string>>(new Set());
  const [accessReady, setAccessReady] = useState(false);

  async function refreshAccess() {
    const admin = getStoredAdmin();
    setRole(admin?.role || null);
    if (admin?.id) {
      try {
        const res = await Api.getPrivileges(admin.id);
        persistPrivilegesForUser(admin.id, res.privileges || {});
        const allowed = new Set<string>();
        Object.entries(res.privileges || {}).forEach(([resource, flags]) => {
          if (flags && (flags as any).view) {
            allowed.add(resource);
          }
        });
        setAllowedSections(allowed);
      } catch {
        setAllowedSections(new Set());
      }
    } else {
      setAllowedSections(new Set());
    }
    setAccessReady(true);
  }

  useEffect(() => {
    refreshAccess();
  }, [pathname]);

  useEffect(() => {
    const handleExternalChange = () => refreshAccess();
    window.addEventListener("storage", handleExternalChange);
    window.addEventListener("focus", handleExternalChange);
    window.addEventListener("auth-changed", handleExternalChange as EventListener);
    window.addEventListener("privileges-changed", handleExternalChange as EventListener);
    return () => {
      window.removeEventListener("storage", handleExternalChange);
      window.removeEventListener("focus", handleExternalChange);
      window.removeEventListener("auth-changed", handleExternalChange as EventListener);
      window.removeEventListener("privileges-changed", handleExternalChange as EventListener);
    };
  }, []);

  const isStaff = (role || "").trim().toLowerCase() === "staff";
  const filteredMenu = useMemo(() => {
    if (!isStaff) return MENU;
    if (!accessReady) return [];
    return MENU.filter((section) => allowedSections.has(section.id));
  }, [isStaff, accessReady, allowedSections]);

  // Derive the section id for the current path
  const currentSectionId = useMemo(() => {
    const p = (pathname || "/").replace(/\/+$/, "");
    for (const section of MENU) {
      for (const item of section.items) {
        const h = (item.href || "/").replace(/\/+$/, "");
        const isMatch = item.exact
          ? p === h
          : p === h || p.startsWith(h + "/");
        if (isMatch) return section.id;
      }
    }
    return null;
  }, [pathname]);

  // Redirect staff away from disallowed sections
  useEffect(() => {
    if (!isStaff || !accessReady) return;
    if (!currentSectionId) return;
    if (allowedSections.has(currentSectionId)) return;

    // Find first allowed entry to redirect
    const firstAllowed = MENU.find((s) => allowedSections.has(s.id));
    const fallbackHref = firstAllowed?.items[0]?.href || "/";
    router.replace(fallbackHref);
  }, [isStaff, accessReady, currentSectionId, allowedSections, router]);

  if (pathname === "/login") return null;

  return (
    <aside className="hidden md:flex md:w-72 md:flex-col md:sticky md:top-0 md:h-screen border-r border-border bg-sidebar text-sidebar-foreground">
      <div className="h-14 shrink-0 flex items-center px-4 border-b border-border">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Ops Control
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {filteredMenu.map((section) => (
          <SidebarSection
            key={section.id}
            section={section}
            // Admin/Super bypass privilege filtering; staff respects allowedSections
            allowed={!isStaff || allowedSections.has(section.id)}
          />
        ))}
      </nav>

      <div className="p-3 border-t border-border text-xs text-muted-foreground">
        v1.0 - Messaging Control Center
      </div>
    </aside>
  );
}

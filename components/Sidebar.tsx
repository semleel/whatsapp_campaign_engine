"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import SidebarSection from "./SidebarSection";
import { MENU } from "@/lib/menuConfig";
import { getStoredAdmin } from "@/lib/auth";
import { Api } from "@/lib/client";
import Image from "next/image";

export default function Sidebar() {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);
  const [allowedSections, setAllowedSections] = useState<Set<string>>(new Set());
  const [accessReady, setAccessReady] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("sidebar-collapsed") === "true";
  });
  const persistedCollapsed = useRef<boolean>(collapsed);

  async function refreshAccess() {
    const admin = getStoredAdmin();
    setRole(admin?.role || null);
    if (admin?.id) {
      try {
        const res = await Api.getPrivileges(admin.id);
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

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar-collapsed", String(next));
      persistedCollapsed.current = next;
      return next;
    });
  };

  useEffect(() => {
    const handler = () => {
      toggleCollapsed();
    };
    window.addEventListener("sidebar-toggle", handler as any);
    return () => window.removeEventListener("sidebar-toggle", handler as any);
  }, []);

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
    <aside
      onMouseEnter={() => {
        if (persistedCollapsed.current) setCollapsed(false);
      }}
      onMouseLeave={() => {
        if (persistedCollapsed.current) setCollapsed(true);
      }}
      className={`hidden md:flex ${collapsed ? "md:w-20" : "md:w-72"} transition-all duration-200 md:flex-col md:sticky md:top-0 md:h-screen border-r border-border bg-sidebar text-sidebar-foreground overflow-hidden`}
    >
      <div className="h-14 shrink-0 flex items-center px-3 border-b border-border">
        <div className="flex items-center justify-between w-full gap-2">
          <Link
            href="/"
            className={`flex items-center ${collapsed ? "justify-center w-full" : "gap-2"}`}
          >
            {collapsed ? (
              <div className="relative h-10 w-10">
                <Image
                  src="/LOGO_icon.png"
                  alt="WICE icon"
                  fill
                  className="object-contain"
                  priority
                />
              </div>
            ) : (
              <div className="relative h-12 w-32">
                <Image
                  src="/LOGO_WICE.png"
                  alt="WICE logo"
                  fill
                  className="object-contain"
                  priority
                />
              </div>
            )}
          </Link>
          <button
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={toggleCollapsed}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-secondary text-foreground shadow-sm hover:bg-secondary/80 transition"
          >
            <svg
              viewBox="0 0 24 24"
              className={`h-5 w-5 transition-transform duration-200 ${collapsed ? "" : "rotate-180"}`}
              fill="currentColor"
            >
              <path d="m9.707 17.707-1.414-1.414L12.586 12 8.293 7.707l1.414-1.414L15.414 12z" />
            </svg>
          </button>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {filteredMenu.map((section) => (
          <SidebarSection
            key={section.id}
            section={section}
            // Admin/Super bypass privilege filtering; staff respects allowedSections
            allowed={!isStaff || allowedSections.has(section.id)}
            collapsed={collapsed}
          />
        ))}
      </nav>

      <div className="p-3 border-t border-border text-xs text-muted-foreground">
        v1.0 - Messaging Control Center
      </div>
    </aside>
  );
}

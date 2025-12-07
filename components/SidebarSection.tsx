"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import type { MenuSection, MenuItem } from "@/lib/menuConfig";

const SECTION_ICONS: Record<string, JSX.Element> = {
    overview: (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
            <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
        </svg>
    ),
    campaigns: (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
            <path d="M5 3h14a1 1 0 0 1 .97 1.24l-1.1 4.4a4 4 0 0 1-3.88 3.05H9.64L7 17.5V12H5a1 1 0 0 1 0-2h1.38l.72-2.88A2 2 0 0 1 9.05 5H17a1 1 0 0 0 0-2H5a1 1 0 0 1 0-2Z" />
        </svg>
    ),
    content: (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
            <path d="M6 4h9l5 5v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm8 1.5V10h4.5L14 5.5z" />
        </svg>
    ),
    conversations: (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
            <path d="M4 4h16a1 1 0 0 1 1 1v11.5a.5.5 0 0 1-.8.4l-3-2.25H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
        </svg>
    ),
    integration: (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
            <path d="M7 2a1 1 0 0 1 1 1v2h4V3a1 1 0 1 1 2 0v2h2a3 3 0 0 1 3 3v3h-2V8a1 1 0 0 0-1-1h-2v3a1 1 0 1 1-2 0V7H8v3a1 1 0 0 1-2 0V6a3 3 0 0 1 3-3h-2zM5 14h2v3a1 1 0 0 0 1 1h2v-3a1 1 0 1 1 2 0v3h2a1 1 0 0 0 1-1v-3h2v3a3 3 0 0 1-3 3h-2v1a1 1 0 1 1-2 0v-1H8a3 3 0 0 1-3-3v-3z" />
        </svg>
    ),
    feedback: (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
            <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
        </svg>
    ),
    reports: (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
            <path d="M5 3h14a1 1 0 0 1 1 1v16l-5-4-5 4-5-4V4a1 1 0 0 1 1-1z" />
        </svg>
    ),
    system: (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
            <path d="M12 2a1 1 0 0 1 1 1v1.06a7.002 7.002 0 0 1 4.244 4.244H18a1 1 0 1 1 0 2h-.756A7.002 7.002 0 0 1 13 14.94V16a1 1 0 1 1-2 0v-1.06A7.002 7.002 0 0 1 6.756 10.3H6a1 1 0 1 1 0-2h.756A7.002 7.002 0 0 1 11 4.06V3a1 1 0 0 1 1-1Z" />
        </svg>
    ),
};

function getSectionIcon(id: string) {
    return SECTION_ICONS[id] || (
        <span className="text-xs font-semibold">{id?.[0]?.toUpperCase() ?? "•"}</span>
    );
}
// Active rule: exact items must match exactly; others match prefix
function isItemActive(pathname: string, item: MenuItem) {
    const p = (pathname || "/").replace(/\/+$/, "");
    const h = (item.href || "/").replace(/\/+$/, "");
    if (item.exact) return p === h;
    return p === h || p.startsWith(h + "/");
}

export default function SidebarSection({
    section,
    allowed = true,
    collapsed = false,
}: {
    section: MenuSection;
    allowed?: boolean;
    collapsed?: boolean;
}) {
    const pathname = usePathname() || "/";
    const router = useRouter();

    const [open, setOpen] = useState<boolean>(() =>
        section.items.some((i) => isItemActive(pathname, i))
    );

    const disabled = !allowed;

    return (
        <div className="mb-2">
            <button
                onClick={() => {
                    if (collapsed) {
                        window.dispatchEvent(new Event("sidebar-toggle"));
                        return;
                    }
                    if (allowed) setOpen((o) => !o);
                }}
                className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold hover:bg-sidebar-accent transition-colors bg-sidebar-accent/50 border border-sidebar-border"
                aria-expanded={open}
            >
                <span className="truncate flex items-center gap-2">
                    {getSectionIcon(section.id)}
                    {!collapsed && section.label}
                </span>
                <svg
                    className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""} ${collapsed ? "hidden" : ""}`}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                >
                    <path d="M6 6l6 4-6 4V6z" />
                </svg>
            </button>

            {open && !collapsed && (
                <ul className="mt-1 space-y-1">
                    {section.items.map((item) => {
                        const active = isItemActive(pathname, item);
                        return (
                            <li key={item.href}>
                                <Link
                                    href={disabled ? "#" : item.href}
                                    aria-disabled={disabled}
                                    onClick={(e) => {
                                        if (disabled) e.preventDefault();
                                    }}
                                    className={`group relative block rounded-md px-4 py-2 text-sm transition-colors border ${
                                        active
                                            ? "bg-primary/10 border-primary/50 font-semibold text-foreground"
                                            : disabled
                                            ? "opacity-50 cursor-not-allowed border-transparent"
                                            : "hover:bg-sidebar-accent border-transparent"
                                    }`}
                                >
                                    {active && (
                                        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1.5 rounded-r-md bg-primary" />
                                    )}
                                    {item.label}
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import type { MenuSection, MenuItem } from "@/lib/menuConfig";

// Active rule: exact items must match exactly; others match prefix
function isItemActive(pathname: string, item: MenuItem) {
    const p = (pathname || "/").replace(/\/+$/, "");
    const h = (item.href || "/").replace(/\/+$/, "");
    if (item.exact) return p === h;
    return p === h || p.startsWith(h + "/");
}

export default function SidebarSection({ section }: { section: MenuSection }) {
    const pathname = usePathname() || "/";

    const [open, setOpen] = useState<boolean>(() =>
        section.items.some((i) => isItemActive(pathname, i))
    );

    return (
        <div className="mb-2">
            <button
                onClick={() => setOpen((o) => !o)}
                className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold hover:bg-sidebar-accent transition-colors"
                aria-expanded={open}
            >
                <span className="truncate">{section.label}</span>
                <svg
                    className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""}`}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                >
                    <path d="M6 6l6 4-6 4V6z" />
                </svg>
            </button>

            {open && (
                <ul className="mt-1 space-y-1">
                    {section.items.map((item) => {
                        const active = isItemActive(pathname, item);
                        return (
                            <li key={item.href}>
                                <Link
                                    href={item.href}
                                    className={`group relative block rounded-md px-4 py-2 text-sm transition-colors ${active ? "bg-sidebar-accent font-medium" : "hover:bg-sidebar-accent"
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

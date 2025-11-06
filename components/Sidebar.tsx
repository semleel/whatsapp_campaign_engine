"use client";

import SidebarSection from "./SidebarSection";
import { MENU } from "@/lib/menuConfig";
import Link from "next/link";

export default function Sidebar() {
  return (
    <aside className="hidden md:flex md:w-72 md:flex-col border-r border-border bg-sidebar text-sidebar-foreground">
      <div className="h-14 shrink-0 flex items-center px-4 border-b border-border">
        <Link href="/" className="text-lg font-semibold">Campaign Engine</Link>
      </div>
      <nav className="flex-1 overflow-y-auto p-3">
        {MENU.map((section) => (
          <SidebarSection key={section.id} section={section} />
        ))}
      </nav>
      <div className="p-3 border-t border-border text-xs text-muted-foreground">
        v1.0 • Team Dashboard
      </div>
    </aside>
  );
}

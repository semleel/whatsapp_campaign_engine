// menuConfig.ts

import type { ReactNode } from "react";

export type MenuItem = {
  label: string;
  href: string;
  exact?: boolean;
};

export type MenuSection = {
  id: string;
  label: string;
  icon?: ReactNode;
  items: MenuItem[];
};

export const MENU: MenuSection[] = [
  {
    id: "overview",
    label: "Overview",
    items: [{ label: "Dashboard", href: "/", exact: true }],
  },
  {
    id: "campaigns",
    label: "Campaigns",
    items: [
      { label: "Campaign List", href: "/campaign", exact: true },
      { label: "Sessions", href: "/campaign/sessions" },
      { label: "Keywords", href: "/campaign/keywords" },
      { label: "Targets", href: "/campaign/targets" },
    ],
  },
  {
    id: "content",
    label: "Content",
    items: [
      { label: "Content", href: "/content", exact: true },
      { label: "Template Library", href: "/content/templates" },
    ],
  },
  // NOTE: The old visual Flows builder has been removed.
  // If a new step-based editor is added in future, it can get a new section here.
  // {
  //   id: "flows",
  //   label: "Flows",
  //   items: [
  //     { label: "Flow Hub", href: "/flows", exact: true },
  //   ],
  // },
  {
    id: "conversations",
    label: "Conversations",
    items: [
      { label: "Conversations List", href: "/conversations" },
    ],
  },
  {
    id: "integration",
    label: "Integrations",
    items: [
      { label: "Endpoints", href: "/integration/endpoints", exact: true },
      { label: "Test Runner", href: "/integration/test-runner" },
      { label: "Logs", href: "/integration/logs" },
    ],
  },
  {
    id: "feedback",
    label: "Feedback",
    items: [
      { label: "Feedback", href: "/feedback", exact: true },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    items: [
      { label: "Summary", href: "/reports", exact: true },
      { label: "Delivery", href: "/reports/delivery" },
    ],
  },
  {
    id: "system",
    label: "System",
    items: [
      { label: "Staff", href: "/system/staff" },
      { label: "Tokens", href: "/system/tokens" },
      { label: "Security Logs", href: "/system/logs" },
      { label: "WhatsApp Config", href: "/system/whatsapp" },
      { label: "System Commands", href: "/system/commands" },
    ],
  },
] as const;

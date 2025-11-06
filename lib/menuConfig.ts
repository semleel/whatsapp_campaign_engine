export type MenuItem = {
  label: string;
  href: string;
  exact?: boolean;
};
export type MenuSection = {
  id: string;
  label: string;
  icon?: React.ReactNode;
  items: MenuItem[];
};

export const MENU: MenuSection[] = [
  {
    id: "whatsapp",
    label: "WhatsApp Gateway & API",
    items: [
      { label: "Webhook Listener", href: "/whatsapp/webhook" },
      { label: "Outbound Dispatcher", href: "/whatsapp/outbound" },
      { label: "Auth & Tokens", href: "/whatsapp/auth" },
      { label: "Delivery & Retries", href: "/whatsapp/delivery" },
    ],
  },
  {
    id: "content",
    label: "Content Engine",
    items: [
      { label: "Templates", href: "/content/templates" },
      { label: "Input Validator", href: "/content/validator" },
      { label: "Branching Logic", href: "/content/branching" },
      { label: "Multilingual & Fallback", href: "/content/i18n" },
    ],
  },
  {
    id: "campaign",
    label: "Campaign Engine",
    items: [
      { label: "Scheduler", href: "/campaign/scheduler" },
      { label: "Campaigns", href: "/campaign/manage" },
      { label: "Sessions", href: "/campaign/sessions" },
      { label: "Keywords", href: "/campaign/keywords" },
    ],
  },
  {
    id: "integration",
    label: "Backend Integration & Live API",
    items: [
      { label: "Overview", href: "/integration", exact: true },
      { label: "Endpoints", href: "/integration/endpoints" },
      { label: "Mappings", href: "/integration/mappings" },
      { label: "Templates", href: "/integration/templates" },
      { label: "Logs", href: "/integration/logs" },
    ],
  },
];

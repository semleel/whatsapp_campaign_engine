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
      { label: "Overview", href: "/content", exact: true },
      { label: "Template Library", href: "/content/templates" },
      { label: "Input Validator", href: "/content/validator" },
      { label: "Branching Logic", href: "/content/branching" },
      { label: "Multilingual Handler", href: "/content/i18n" },
    ],
  },
  {
    id: "campaign",
    label: "Campaign Engine",
    items: [
      { label: "Overview", href: "/campaign", exact: true },
      { label: "Campaigns", href: "/campaign/campaigns" },
      { label: "Scheduler", href: "/campaign/schedule" },
      { label: "Target / Flow ", href: "/campaign/targets" },
      { label: "Sessions", href: "/campaign/sessions" },
      { label: "Keyword Handler", href: "/campaign/keywords" },
    ],
  },
  {
    id: "integration",
    label: "Backend Integration & Live API",
    items: [
      { label: "Overview", href: "/integration", exact: true },
      { label: "Endpoints", href: "/integration/endpoints" },
      { label: "Mappings", href: "/integration/mappings" },
      { label: "Response Formatters", href: "/integration/formatters" },
      { label: "Live Test Runner", href: "/integration/test-runner" },
      { label: "Logs", href: "/integration/logs" },
    ],
  },
];

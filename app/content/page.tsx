import Link from "next/link";

type ModuleCard = {
  title: string;
  description: string;
  bullets: string[];
  example: string;
  href: string;
};

const modules: ModuleCard[] = [
  {
    title: "Message Template Manager",
    description:
      "Central library for Meta-approved WhatsApp templates, multimedia content, and journey metadata such as campaign tags, categories, and approval state.",
    bullets: [
      "Add or version templates with tracked metadata and review status.",
      "Schedule expiry dates so time-bound vouchers retire automatically.",
      "Attach tags like campaign code, language, and status for discovery.",
    ],
    example: 'Example: "[Hi {user_name}, welcome to {campaign_name}!]" tagged with campaign=RAYA2025, language=EN, status=approved.',
    href: "/content/templates",
  },
  {
    title: "Input Validator & Responder",
    description:
      "Validates customer replies against predefined options (Yes/No, lists, buttons) and returns calibrated responses without needing backend calls.",
    bullets: [
      "Map valid replies per prompt and auto-send the matching text.",
      "Provide helpful fallback copy when the reply is invalid.",
      "Keeps the flow aligned with UX copy and campaign logic.",
    ],
    example:
      'Example: Prompt "Claim voucher?" -> YES = "Great! SAVE10"; NO = "No worries! More deals ahead."; invalid reply re-prompts.',
    href: "/content/validator",
  },
  {
    title: "Branching Logic Processor",
    description:
      "Configures lightweight conditional routing (Yes/No or quick button) without writing code. Each path hands the correct content key back to the Campaign Engine.",
    bullets: [
      "Static branching table links replies to subsequent content keys.",
      "Perfect for differentiating daily opt-ins vs. opt-outs.",
      "Keeps campaign flow human-readable for ops teams.",
    ],
    example:
      'Example: "Receive daily tips?" YES -> key: daily_tips_yes, NO -> key: daily_tips_no (fed to Campaign Engine).',
    href: "/content/branching",
  },
  {
    title: "Multilingual & Fallback Handler",
    description:
      "Guarantees the user receives the correct language variant and ensures English fallback if a localized asset is missing or expired.",
    bullets: [
      "Link template variants to locale tags (EN, MY, CN, etc.).",
      "Serve preferred language when available; fallback gracefully otherwise.",
      "Prevents silent failures when translations lag behind.",
    ],
    example:
      "Example: user language = MY -> deliver voucher_reminder(MY); if missing, fallback to EN version automatically.",
    href: "/content/i18n",
  },
];

const stats = [
  { label: "Approved templates", value: "38" },
  { label: "Awaiting re-approval", value: "5" },
  { label: "Locales covered", value: "11" },
  { label: "Expiring soon", value: "3" },
];

export default function ContentOverviewPage() {
  return (
    <div className="space-y-6">
      <section className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border bg-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold">Content Engine Overview</h3>
              <p className="text-sm text-muted-foreground">
                Manage reusable and dynamic WhatsApp copy for every campaign. Start in the library to add assets or jump
                into validators and branching logic to control runtime behavior.
              </p>
            </div>
            <div className="flex gap-2">
              <Link href="/content/templates" className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted">
                Library
              </Link>
              <Link
                href="/content/templates/create"
                className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90"
              >
                Add Template
              </Link>
            </div>
          </div>
        </div>
        <div className="rounded-xl border p-6 space-y-3">
          {stats.map((stat) => (
            <div key={stat.label} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{stat.label}</span>
              <span className="text-lg font-semibold">{stat.value}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {modules.map((module) => (
          <article key={module.title} className="rounded-xl border p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h4 className="text-base font-semibold">{module.title}</h4>
                <p className="text-sm text-muted-foreground">{module.description}</p>
              </div>
              <Link href={module.href} className="text-sm font-medium text-primary hover:underline">
                Open
              </Link>
            </div>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {module.bullets.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">{module.example}</p>
          </article>
        ))}
      </section>
    </div>
  );
}


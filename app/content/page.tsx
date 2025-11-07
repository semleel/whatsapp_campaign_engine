const introduction =
  "Centralize WhatsApp-approved templates, multilingual assets, and input logic so content managers can iterate quickly while developers pull stable content keys.";

const objectives = [
  "Store templates, media, and responses in a single governed library.",
  "Let flows retrieve content dynamically via reusable content keys.",
  "Support Yes/No validators and branching without backend code.",
  "Personalize copy using placeholders such as {user_name} or {campaign_name}.",
  "Track approvals, expiries, and keep marketing self-serve.",
];

const stats = [
  { label: "Approved templates", value: "38" },
  { label: "Drafts awaiting approval", value: "5" },
  { label: "Locales supported", value: "11" },
];

const featureCards = [
  {
    title: "Message Template Manager",
    bullets: [
      "Add or update WhatsApp-approved copy with variables.",
      "Attach metadata (campaign, category, status) and track approvals.",
      "Schedule expiries so time-bound content hides automatically.",
    ],
    example: "Example: Upload \"Hi {user_name}, welcome to {campaign_name}!\" tagged with campaign=RAYA2025, EN, status=Approved.",
    href: "/content/templates",
  },
  {
    title: "Input Validator & Responder",
    bullets: [
      "Validate Yes/No responses and return mapped copy instantly.",
      "Handle invalid inputs with helpful fallback prompts.",
      "Keep branching logic editable by non-technical teams.",
    ],
    example: "Example: Prompt \"Claim voucher?\" → YES = \"Great! SAVE10\" · NO = \"No worries! Check other deals.\"",
    href: "/content/validator",
  },
  {
    title: "Branching Logic Processor",
    bullets: [
      "Link static Yes/No answers to downstream content keys.",
      "Direct users through promo vs. opt-out paths without code.",
      "Emit content references for the Campaign Engine to consume.",
    ],
    example: "Example: \"Receive daily tips?\" → YES = daily_tips_yes copy, NO = daily_tips_no copy.",
    href: "/content/branching",
  },
  {
    title: "Multilingual & Fallback Handler",
    bullets: [
      "Store per-locale variants (EN, MY, CN, etc.).",
      "Auto-fallback to English when a locale is missing.",
      "Ensure no blank response when translations lag behind.",
    ],
    example: "Example: User language=MY → serve voucher_reminder(MY); if missing, fallback to EN string.",
    href: "/content/i18n",
  },
];

const recentTemplates = [
  { title: "order_update_v6", status: "Approved", locale: "EN", updated: "2 hours ago" },
  { title: "voucher_reminder", status: "Awaiting Meta", locale: "MY", updated: "Yesterday" },
  { title: "loyalty_tip_daily", status: "Draft", locale: "EN", updated: "Oct 21, 2025" },
];

export default function ContentOverviewPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-card p-6 space-y-4">
        <div className="space-y-2">
          <h3 className="text-base font-semibold">What this module does</h3>
          <p className="text-sm text-muted-foreground">{introduction}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {objectives.map((objective) => (
            <div key={objective} className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
              {objective}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border p-5 space-y-3">
        <h4 className="text-base font-semibold">Module stats</h4>
        <div className="grid gap-3 sm:grid-cols-3">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-lg border border-dashed px-3 py-2">
              <div className="text-sm text-muted-foreground">{stat.label}</div>
              <div className="text-lg font-semibold">{stat.value}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {featureCards.map((card) => (
          <article key={card.title} className="rounded-xl border p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-base font-semibold">{card.title}</h4>
              <a href={card.href} className="text-sm font-medium text-primary hover:underline">
                Open
              </a>
            </div>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {card.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
            <div className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">{card.example}</div>
          </article>
        ))}
      </section>

      <section className="rounded-xl border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-base font-semibold">Recent templates</h4>
          <a href="/content/templates" className="text-sm font-medium text-primary hover:underline">
            Open library
          </a>
        </div>
        <div className="divide-y text-sm">
          {recentTemplates.map((tpl) => (
            <div key={tpl.title} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <div className="font-medium">{tpl.title}</div>
                <div className="text-xs text-muted-foreground">Locale · {tpl.locale}</div>
              </div>
              <div className="text-sm text-muted-foreground">{tpl.updated}</div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  tpl.status === "Approved"
                    ? "bg-emerald-100 text-emerald-700"
                    : tpl.status === "Draft"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-sky-100 text-sky-700"
                }`}
              >
                {tpl.status}
              </span>
            </div>
          ))}
          {!recentTemplates.length && <div className="text-muted-foreground text-sm">No templates yet.</div>}
        </div>
      </section>
    </div>
  );
}

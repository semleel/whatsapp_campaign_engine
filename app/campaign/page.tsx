const introduction =
  "Orchestrate structured WhatsApp campaigns with clear objectives (what), targeting (where), and precise timing (when) while remembering every user\'s progress across concurrent journeys.";

const objectives = [
  "Link every user session to the correct campaign ID for persistent context.",
  "Enforce scheduling rules so campaigns only run inside approved windows.",
  "Support multiple live campaigns per user without message mix-ups.",
  "Give operators live controls to pause, extend, or resume campaigns on demand.",
  "Improve user experience with structured, personalized messaging and analytics.",
];

const stats = [
  { label: "Live campaigns", value: "12" },
  { label: "Scheduled launches", value: "4" },
  { label: "Paused for review", value: "1" },
];

const featureCards = [
  {
    title: "Campaign Management",
    bullets: [
      "Create campaigns by defining objectives, targeting, and duration.",
      "Edit live campaigns or archive them without losing analytics.",
      "Pause/resume journeys to react to compliance or performance signals.",
    ],
    example: "Example: Set up \"RAYA 2025\" with objective=Retention, region=MY, flow=Promo and archive it post-Raya.",
    href: "/campaign/campaigns",
  },
  {
    title: "Scheduler Module",
    bullets: [
      "Set start/end times, extend windows, and queue reminder jobs.",
      "Ensure messages only send during approved delivery slots.",
      "Centralize time-based controls for every region and segment.",
    ],
    example: "Example: Start 1 Apr 08:00, end 30 Apr 23:59, queue reminder on 12 Apr at noon.",
    href: "/campaign/schedule",
  },
  {
    title: "Target / User Flow",
    bullets: [
      "Add and manage target regions used for campaign targeting.",
      "Define reusable user flows (Promo, Quiz, Survey) for campaigns.",
      "Centralize reference data used across the campaign engine.",
    ],
    example: "Example: Add region MY and a new flow 'Promo'.",
    href: "/campaign/targets",
  },
  {
    title: "Session Management",
    bullets: [
      "Bind every conversation to a campaign ID with checkpoints.",
      "Resume where users left off even days later.",
      "Handle multi-campaign participants with clean separation.",
    ],
    example: "Example: User joins Promo + Quiz → system stores two session IDs and resumes each independently.",
    href: "/campaign/sessions",
  },
  {
    title: "Keyword & Entry Point Handler",
    bullets: [
      "Recognize promo/quiz/menu keywords and route instantly.",
      "Present helpful fallback copy when input is unknown.",
      "Keep entry-point logic centralized for operations teams.",
    ],
    example: "Example: Keyword \"promo\" → promo campaign; unknown keyword → \"Type MENU to see options.\"",
    href: "/campaign/keywords",
  },
];

const recentCampaigns = [
  {
    name: "Retention Booster Q4",
    status: "In flight",
    owner: "CX Automation",
    updated: "2 hours ago",
  },
  {
    name: "Festive Loyalty Push",
    status: "Scheduled",
    owner: "Brand Squad",
    updated: "Yesterday, 4:20 PM",
  },
  {
    name: "Dormant Reactivation",
    status: "Archived",
    owner: "Revenue Ops",
    updated: "Oct 21, 2025",
  },
];

export default function CampaignOverviewPage() {
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
          <h4 className="text-base font-semibold">Recent campaigns</h4>
          <a href="/campaign/campaigns" className="text-sm font-medium text-primary hover:underline">
            View workspace
          </a>
        </div>
        <div className="divide-y text-sm">
          {recentCampaigns.map((campaign) => (
            <div key={campaign.name} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <div className="font-medium">{campaign.name}</div>
                <div className="text-xs text-muted-foreground">Owner · {campaign.owner}</div>
              </div>
              <div className="text-sm text-muted-foreground">{campaign.updated}</div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  campaign.status === "In flight"
                    ? "bg-emerald-100 text-emerald-700"
                    : campaign.status === "Scheduled"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                {campaign.status}
              </span>
            </div>
          ))}
          {!recentCampaigns.length && <div className="text-muted-foreground text-sm">No campaigns yet.</div>}
        </div>
      </section>
    </div>
  );
}

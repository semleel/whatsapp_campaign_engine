import Link from "next/link";

const quickActions = [
  {
    label: "Create Campaign",
    href: "/campaign/campaigns/create",
    description: "Spin up a new WhatsApp journey with targeting & creative.",
  },
  {
    label: "Campaign List",
    href: "/campaign/campaigns",
    description: "Review live & completed sends with their current status.",
  },
  {
    label: "Archived Campaigns",
    href: "/campaign/archive",
    description: "Restore or audit historical runs for compliance.",
  },
  {
    label: "Scheduling Board",
    href: "/campaign/schedule",
    description: "Queue future sends and preview delivery windows.",
  },
];

const liveMetrics = [
  { label: "Active Journeys", value: "12", trend: "+2 vs last week" },
  { label: "Queued Sends", value: "4", trend: "Next 48 hours" },
  { label: "Paused", value: "1", trend: "Needs creative approval" },
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

const runbook = [
  { step: "Validate template approvals", status: "complete" },
  { step: "Sync targeting audience", status: "complete" },
  { step: "QA journey flow", status: "pending" },
  { step: "Schedule blast window", status: "pending" },
];

export default function CampaignOverviewPage() {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-6">
        <section className="rounded-xl border bg-card p-5">
          <div className="mb-2 font-medium">What this module does</div>
          <p className="text-sm text-muted-foreground">
            Coordinate WhatsApp outreach across regions, manage review cycles, and keep delivery windows aligned with
            backend readiness. Jump into the views below to create new journeys, monitor delivery health, or audit past
            launches.
          </p>
        </section>

        <section className="rounded-xl border p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold">Quick actions</h3>
              <p className="text-sm text-muted-foreground">Most-used campaign flows pinned for the squad.</p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {quickActions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="rounded-xl border p-4 transition hover:border-primary hover:shadow-sm"
              >
                <div className="text-sm font-medium">{action.label}</div>
                <p className="text-sm text-muted-foreground mt-1">{action.description}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-xl border p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold">Recently touched campaigns</h3>
            <Link href="/campaign/campaigns" className="text-sm font-medium text-primary hover:underline">
              View all
            </Link>
          </div>
          <div className="divide-y">
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
          </div>
        </section>
      </div>

      <div className="space-y-4">
        <section className="rounded-xl border p-5 space-y-4">
          {liveMetrics.map((item) => (
            <div key={item.label} className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">{item.label}</div>
                <div className="text-xs text-muted-foreground">{item.trend}</div>
              </div>
              <div className="text-2xl font-semibold">{item.value}</div>
            </div>
          ))}
        </section>

        <section className="rounded-xl border p-5">
          <h3 className="mb-3 text-base font-semibold">Deployment runbook</h3>
          <ul className="space-y-2">
            {runbook.map((item) => (
              <li key={item.step} className="flex items-start gap-2 text-sm">
                <span
                  className={`mt-1 h-2.5 w-2.5 rounded-full ${
                    item.status === "complete" ? "bg-emerald-500" : "bg-zinc-300"
                  }`}
                />
                <span className={item.status === "complete" ? "text-muted-foreground line-through" : ""}>
                  {item.step}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

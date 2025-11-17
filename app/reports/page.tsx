const summaryMetrics = [
  { label: "Messages (24h)", value: "12,480" },
  { label: "Delivery rate", value: "98.4%" },
  { label: "Active campaigns", value: 9 },
];

const trendingCampaigns = [
  { name: "Promo Opt-in", sent: 4200, delivered: "97.8%", interactions: 1200 },
  { name: "Support Escalation", sent: 1800, delivered: "99.1%", interactions: 640 },
];

export default function ReportsLandingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Reporting</h3>
        <p className="text-sm text-muted-foreground">
          Pull insights directly from <code>message</code>, <code>deliverlog</code>, and <code>sessionlog</code>.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {summaryMetrics.map((metric) => (
          <div key={metric.label} className="rounded-xl border p-4">
            <div className="text-sm text-muted-foreground">{metric.label}</div>
            <div className="text-2xl font-semibold">{metric.value}</div>
          </div>
        ))}
      </div>

      <section className="rounded-xl border p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-base font-semibold">Trending campaigns</h4>
          <a className="text-sm text-primary hover:underline" href="/reports/delivery">
            Delivery report
          </a>
        </div>
        <div className="space-y-3">
          {trendingCampaigns.map((campaign) => (
            <div key={campaign.name} className="rounded-lg border px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-medium">{campaign.name}</div>
                  <div className="text-xs text-muted-foreground">Sent: {campaign.sent}</div>
                </div>
                <div className="text-xs text-muted-foreground">Delivered {campaign.delivered}</div>
                <div className="text-xs text-muted-foreground">Interactions {campaign.interactions}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

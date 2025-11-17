const recentTemplates = [
  { title: "order_update_v6", status: "Approved", locale: "EN", updated: "2 hours ago" },
  { title: "voucher_reminder", status: "Awaiting Meta", locale: "MY", updated: "Yesterday" },
  { title: "loyalty_tip_daily", status: "Draft", locale: "EN", updated: "Oct 21, 2025" },
];

export default function ContentOverviewPage() {
  return (
    <div className="space-y-6">
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

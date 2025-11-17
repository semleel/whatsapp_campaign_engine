const cards = [
  { title: "Admin users", description: "Manage entries in the admin table.", href: "/system/admins" },
  { title: "API tokens", description: "Monitor sessiontoken issuance.", href: "/system/tokens" },
  { title: "Security logs", description: "Review token_log events.", href: "/system/logs" },
  { title: "WhatsApp config", description: "Update whatsapp_config values.", href: "/system/whatsapp" },
];

export default function SystemOverviewPage() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">System settings</h3>
        <p className="text-sm text-muted-foreground">Configuration stored in admin, sessiontoken, token_log, whatsapp_config.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {cards.map((card) => (
          <a key={card.title} href={card.href} className="rounded-xl border p-4 space-y-1 hover:bg-muted/50">
            <div className="text-base font-semibold">{card.title}</div>
            <p className="text-sm text-muted-foreground">{card.description}</p>
          </a>
        ))}
      </div>
    </div>
  );
}

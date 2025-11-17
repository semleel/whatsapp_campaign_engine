const deliveries = [
  {
    messageid: 9912,
    campaign: "Promo Opt-in",
    contact: "+60123456789",
    status: "delivered",
    retrycount: 0,
    sentAt: "2025-11-12 10:10",
  },
  {
    messageid: 9913,
    campaign: "Promo Opt-in",
    contact: "+60123456789",
    status: "failed",
    retrycount: 3,
    sentAt: "2025-11-12 10:11",
  },
];

export default function DeliveryReportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Delivery report</h3>
        <p className="text-sm text-muted-foreground">
          Joined from <code>message</code> + <code>deliverlog</code>.
        </p>
      </div>

      <div className="rounded-xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Message</th>
              <th className="px-3 py-2 text-left font-medium">Campaign</th>
              <th className="px-3 py-2 text-left font-medium">Contact</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-left font-medium">Retries</th>
              <th className="px-3 py-2 text-left font-medium">Sent at</th>
            </tr>
          </thead>
          <tbody>
            {deliveries.map((row) => (
              <tr key={row.messageid} className="border-t">
                <td className="px-3 py-2 font-mono text-xs">#{row.messageid}</td>
                <td className="px-3 py-2">{row.campaign}</td>
                <td className="px-3 py-2">{row.contact}</td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      row.status === "delivered" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                    }`}
                  >
                    {row.status}
                  </span>
                </td>
                <td className="px-3 py-2">{row.retrycount}</td>
                <td className="px-3 py-2 text-muted-foreground">{row.sentAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

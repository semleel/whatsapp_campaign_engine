const flowStats = [
  { name: "Promo Opt-in", sessions: 1280, completionRate: "72%" },
  { name: "Support Escalation", sessions: 540, completionRate: "64%" },
];

export default function FlowReportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Flow report</h3>
        <p className="text-sm text-muted-foreground">
          Aggregate from <code>sessionlog</code> grouped by <code>userflowid</code> or <code>campaignid</code>.
        </p>
      </div>

      <div className="rounded-xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Flow</th>
              <th className="px-3 py-2 text-left font-medium">Sessions</th>
              <th className="px-3 py-2 text-left font-medium">Completion</th>
            </tr>
          </thead>
          <tbody>
            {flowStats.map((row) => (
              <tr key={row.name} className="border-t">
                <td className="px-3 py-2">{row.name}</td>
                <td className="px-3 py-2">{row.sessions}</td>
                <td className="px-3 py-2">{row.completionRate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

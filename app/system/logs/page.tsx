const securityLogs = [
  { logid: 1, action: "login", admin: "Super Admin", ip: "10.0.0.1", time: "2025-11-12 09:00" },
  { logid: 2, action: "token_revoked", admin: "Ops Lead", ip: "10.0.0.5", time: "2025-11-11 20:14" },
];

export default function SecurityLogsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Security logs</h3>
        <p className="text-sm text-muted-foreground">
          Mirror of the <code>token_log</code> table.
        </p>
      </div>

      <div className="rounded-xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Time</th>
              <th className="px-3 py-2 text-left font-medium">Action</th>
              <th className="px-3 py-2 text-left font-medium">Admin</th>
              <th className="px-3 py-2 text-left font-medium">IP</th>
            </tr>
          </thead>
          <tbody>
            {securityLogs.map((log) => (
              <tr key={log.logid} className="border-t">
                <td className="px-3 py-2">{log.time}</td>
                <td className="px-3 py-2">{log.action}</td>
                <td className="px-3 py-2">{log.admin}</td>
                <td className="px-3 py-2 font-mono text-xs">{log.ip}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

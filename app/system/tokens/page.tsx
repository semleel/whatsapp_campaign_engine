const tokens = [
  { tokenid: 991, admin: "Super Admin", roletype: "super", issuedat: "2025-11-10 08:10", expiry: "2025-12-10", is_revoked: false },
  { tokenid: 992, admin: "Ops Lead", roletype: "operator", issuedat: "2025-11-11 09:45", expiry: "2025-11-30", is_revoked: true },
];

export default function TokensPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Session tokens</h3>
          <p className="text-sm text-muted-foreground">Backed by the <code>sessiontoken</code> table.</p>
        </div>
        <button className="rounded-md border px-4 py-2 text-sm">Revoke expired</button>
      </div>

      <div className="rounded-xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Token</th>
              <th className="px-3 py-2 text-left font-medium">Admin</th>
              <th className="px-3 py-2 text-left font-medium">Role</th>
              <th className="px-3 py-2 text-left font-medium">Issued</th>
              <th className="px-3 py-2 text-left font-medium">Expiry</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {tokens.map((token) => (
              <tr key={token.tokenid} className="border-t">
                <td className="px-3 py-2 font-mono text-xs">#{token.tokenid}</td>
                <td className="px-3 py-2">{token.admin}</td>
                <td className="px-3 py-2">{token.roletype}</td>
                <td className="px-3 py-2">{token.issuedat}</td>
                <td className="px-3 py-2">{token.expiry}</td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      token.is_revoked ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {token.is_revoked ? "Revoked" : "Active"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

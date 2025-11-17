const admins = [
  { adminid: 1, name: "Super Admin", email: "admin@example.com", role: "super", createdat: "2025-10-12" },
  { adminid: 4, name: "Ops Lead", email: "ops@example.com", role: "operator", createdat: "2025-11-01" },
];

export default function AdminsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Admin users</h3>
          <p className="text-sm text-muted-foreground">Source of truth: <code>admin</code> table.</p>
        </div>
        <button className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Invite admin</button>
      </div>

      <div className="rounded-xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Name</th>
              <th className="px-3 py-2 text-left font-medium">Email</th>
              <th className="px-3 py-2 text-left font-medium">Role</th>
              <th className="px-3 py-2 text-left font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((admin) => (
              <tr key={admin.adminid} className="border-t">
                <td className="px-3 py-2">{admin.name}</td>
                <td className="px-3 py-2">{admin.email}</td>
                <td className="px-3 py-2">{admin.role}</td>
                <td className="px-3 py-2 text-muted-foreground">{admin.createdat}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import PrivilegeGate from "@/components/PrivilegeGate";

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  return (
    <PrivilegeGate resource="reports">
      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Reports</h2>
        </div>
        {children}
      </div>
    </PrivilegeGate>
  );
}

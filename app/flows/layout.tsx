import PrivilegeGate from "@/components/PrivilegeGate";

export default function FlowsLayout({ children }: { children: React.ReactNode }) {
  return (
    <PrivilegeGate resource="flows">
      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Flow Builder</h2>
        </div>
        {children}
      </div>
    </PrivilegeGate>
  );
}

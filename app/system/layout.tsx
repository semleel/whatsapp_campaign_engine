import PrivilegeGate from "@/components/PrivilegeGate";

export default function SystemLayout({ children }: { children: React.ReactNode }) {
  return (
    <PrivilegeGate resource="system">
      <div className="space-y-6">
        {children}
      </div>
    </PrivilegeGate>
  );
}

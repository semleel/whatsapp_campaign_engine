import PrivilegeGate from "@/components/PrivilegeGate";

export default function ContactsLayout({ children }: { children: React.ReactNode }) {
  return (
    <PrivilegeGate resource="contacts">
      <div className="space-y-6">
        {children}
      </div>
    </PrivilegeGate>
  );
}

"use client";

import { useMemo } from "react";
import { usePrivilege } from "@/lib/permissions";

const contacts = [
  {
    contactid: 101,
    name: "Aisyah Rahman",
    phonenum: "+60123456789",
    region: "MY",
    lastSession: "2025-11-12 10:12",
    campaign: "Promo Opt-in",
  },
  {
    contactid: 204,
    name: "Jason Lee",
    phonenum: "+6598765432",
    region: "SG",
    lastSession: "2025-11-11 18:40",
    campaign: "Support Escalation",
  },
];

export default function ContactsPage() {
  const { canView, canUpdate, loading } = usePrivilege("contacts");

  const rows = useMemo(() => contacts, []);

  if (!loading && !canView) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
        You do not have permission to view contacts.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Contacts</h3>
          <p className="text-sm text-muted-foreground">
            Mirrors the <code>contact</code> table with joins to regions and last campaign session.
          </p>
        </div>
      </div>

      <div className="rounded-xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Contact</th>
              <th className="px-3 py-2 text-left font-medium">Phone</th>
              <th className="px-3 py-2 text-left font-medium">Region</th>
              <th className="px-3 py-2 text-left font-medium">Campaign</th>
              <th className="px-3 py-2 text-left font-medium">Last session</th>
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((contact) => (
              <tr key={contact.contactid} className="border-t">
                <td className="px-3 py-2">
                  <div className="font-medium">{contact.name}</div>
                  <div className="text-xs text-muted-foreground">#{contact.contactid}</div>
                </td>
                <td className="px-3 py-2 font-mono text-xs">{contact.phonenum}</td>
                <td className="px-3 py-2">{contact.region}</td>
                <td className="px-3 py-2 text-muted-foreground">{contact.campaign}</td>
                <td className="px-3 py-2 text-muted-foreground">{contact.lastSession}</td>
                <td className="px-3 py-2 text-right">
                  {canUpdate ? (
                    <a href={`/contacts/${contact.contactid}`} className="rounded border px-3 py-1">
                      View / Edit
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">View only</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

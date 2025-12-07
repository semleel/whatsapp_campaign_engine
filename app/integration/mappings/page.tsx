// app/integration/mappings/page.tsx

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Api } from "@/lib/client";
import type { CampaignApiMapping } from "@/lib/types";
import { usePrivilege } from "@/lib/permissions";

export default function MappingsPage() {
  const [rows, setRows] = useState<CampaignApiMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { canView, loading: privLoading } = usePrivilege("integration");

  useEffect(() => {
    if (privLoading) return;
    if (!canView) {
      setError("You do not have permission to view mappings.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    Api.listMappings()
      .then(setRows)
      .catch((err: any) => setError(err?.message || "Unable to load mappings"))
      .finally(() => setLoading(false));
  }, [canView, privLoading]);

  if (!privLoading && !canView) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
        You do not have permission to view mappings.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Campaign API Mappings</h2>
          <p className="text-sm text-muted-foreground">
            Read-only view of <code>campaign_step</code> rows where{" "}
            <code>action_type = 'api'</code>.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading mappings...</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-muted-foreground">No API steps found yet.</div>
      ) : (
        <div className="rounded-xl border overflow-x-auto bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Campaign</th>
                <th className="px-3 py-2 text-left font-medium">Step</th>
                <th className="px-3 py-2 text-left font-medium">Endpoint</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.step_id} className="border-t">
                  <td className="px-3 py-2">
                    {m.campaignname || `Campaign ${m.campaignid}`}
                  </td>
                  <td className="px-3 py-2">
                    #{m.step_number}
                    {m.step_code ? (
                      <span className="text-xs text-muted-foreground ml-1">
                        ({m.step_code})
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    {m.api_name || (m.apiid != null ? `API ${m.apiid}` : "—")}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {m.is_active ? (
                      <span className="pill bg-emerald-100 text-emerald-700">
                        Active
                      </span>
                    ) : (
                      <span className="pill bg-slate-100 text-slate-700">
                        Disabled
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right space-x-2">
                    <Link
                      href={`/campaigns/${m.campaignid}/steps`}
                      className="text-xs text-primary hover:underline"
                    >
                      View campaign
                    </Link>
                    {m.apiid != null && (
                      <Link
                        href={`/integration/test-runner?endpointId=${m.apiid}`}
                        className="text-xs text-primary hover:underline"
                      >
                        Run test
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

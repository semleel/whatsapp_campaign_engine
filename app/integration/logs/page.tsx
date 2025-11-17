import { Api } from "@/lib/client";
import type { ApiLogEntry } from "@/lib/types";

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export default async function LogsPage() {
  let logs: ApiLogEntry[] = [];
  try {
    logs = await Api.listLogs(200);
  } catch {
    logs = [];
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Integration logs</h3>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Records pulled straight from <code>api_log</code> so operators can trace each outbound call.
          </p>
        </div>
      </div>

      <section className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Time</th>
              <th className="px-3 py-2 text-left font-medium">API</th>
              <th className="px-3 py-2 text-left font-medium">Campaign</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-left font-medium">HTTP</th>
              <th className="px-3 py-2 text-left font-medium">Message</th>
            </tr>
          </thead>
          <tbody>
            {logs.length ? (
              logs.map((log) => (
                <tr key={log.logid} className="border-t align-top">
                  <td className="px-3 py-2 whitespace-nowrap">{formatDate(log.called_at)}</td>
                  <td className="px-3 py-2">
                    <div>API #{log.apiid ?? "—"}</div>
                    {log.request_url && <div className="text-xs text-muted-foreground">{log.request_url}</div>}
                  </td>
                  <td className="px-3 py-2">
                    {log.campaignid ? `Campaign #${log.campaignid}` : "—"}
                    {log.campaignsessionid ? (
                      <div className="text-xs text-muted-foreground">Session #{log.campaignsessionid}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        log.status === "success"
                          ? "bg-emerald-100 text-emerald-700"
                          : log.status === "pending"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-rose-100 text-rose-700"
                      }`}
                    >
                      {log.status || "unknown"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {log.response_code ?? "—"}
                    {log.error_message && (
                      <div className="text-xs text-rose-600">{log.error_message.slice(0, 80)}</div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {log.response_body ? (
                      <details>
                        <summary className="cursor-pointer text-xs text-muted-foreground">View body</summary>
                        <pre className="mt-2 max-h-60 overflow-auto rounded bg-muted px-3 py-2 text-[11px]">
                          {log.response_body}
                        </pre>
                      </details>
                    ) : (
                      <span className="text-muted-foreground">No payload</span>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-muted-foreground">
                  No logs yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

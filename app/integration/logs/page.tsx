import { Api } from "@/lib/client";
import type { LogEntry } from "@/lib/types";

export default async function LogsPage() {
    let logs: LogEntry[] = [];
    try { logs = await Api.listLogs(200); } catch { }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h3 className="text-lg font-semibold">Integration Logs</h3>
                    <p className="text-sm text-muted-foreground max-w-2xl">
                        Inspect live API activity, error categories, and payload metadata for every backend call triggered by WhatsApp flows.
                    </p>
                </div>
            </div>
            <section className="rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-zinc-50 dark:bg-zinc-900">
                        <tr>
                            <th className="text-left px-3 py-2">Time</th>
                            <th className="text-left px-3 py-2">Level</th>
                            <th className="text-left px-3 py-2">Source</th>
                            <th className="text-left px-3 py-2">Message</th>
                        </tr>
                    </thead>
                    <tbody>
                        {logs.length ? (logs as any[]).map(l => (
                            <tr key={l.id} className="border-t align-top">
                                <td className="px-3 py-2 whitespace-nowrap">{new Date(l.ts).toLocaleString()}</td>
                                <td className="px-3 py-2">
                                    <span className={`px-2 py-0.5 rounded ${l.level === "error" ? "bg-red-100 text-red-700" :
                                        l.level === "warn" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                                        }`}>{l.level}</span>
                                </td>
                                <td className="px-3 py-2">{l.source}</td>
                                <td className="px-3 py-2">
                                    <div>{l.message}</div>
                                    {l.meta ? (
                                        <pre className="mt-2 bg-zinc-50 dark:bg-zinc-900 rounded p-2 text-xs overflow-auto">
                                            {JSON.stringify(l.meta, null, 2)}
                                        </pre>
                                    ) : null}
                                </td>
                            </tr>
                        )) : (
                            <tr><td className="px-3 py-3 text-zinc-500" colSpan={4}>No logs yet.</td></tr>
                        )}
                    </tbody>
                </table>
            </section>
        </div>
    );
}

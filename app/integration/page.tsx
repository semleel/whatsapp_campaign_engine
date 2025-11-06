import { Api } from "@/lib/client";
import type { EndpointConfig, LogEntry } from "@/lib/types";
import TestRunner from "@/components/TestRunner";

export default async function IntegrationHome() {
    // Preload data for the dashboard (safe to let these fail silently on first run)
    let endpoints: EndpointConfig[] = [];
    let logs: LogEntry[] = [];
    try { endpoints = await Api.listEndpoints(); } catch { }
    try { logs = await Api.listLogs(20); } catch { }

    return (
        <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
                <div className="rounded-xl border p-4">
                    <div className="mb-2 font-medium">What this module does</div>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Connects WhatsApp flows to backend APIs using configurable endpoints, mappings and templates.
                        Use the tabs to manage configuration, or run a quick test below.
                    </p>
                </div>
                <TestRunner endpoints={endpoints as any} />
            </div>

            <div className="space-y-4">
                <div className="rounded-xl border p-4">
                    <div className="font-medium mb-2">Quick Links</div>
                    <ul className="text-sm list-disc pl-5 space-y-1">
                        <li><a className="underline" href="/integration/endpoints">Manage Endpoints</a></li>
                        <li><a className="underline" href="/integration/mappings">Keyword/Button Mappings</a></li>
                        <li><a className="underline" href="/integration/templates">Reply Templates</a></li>
                        <li><a className="underline" href="/integration/logs">Integration Logs</a></li>
                    </ul>
                </div>

                <div className="rounded-xl border p-4">
                    <div className="font-medium mb-2">Recent Logs</div>
                    <div className="space-y-2 text-sm">
                        {(logs as any[]).slice(0, 6).map((l) => (
                            <div key={l.id} className="flex items-start gap-2">
                                <span className={`mt-1 h-2.5 w-2.5 rounded-full ${l.level === "error" ? "bg-red-500" : l.level === "warn" ? "bg-amber-500" : "bg-emerald-500"
                                    }`} />
                                <div>
                                    <div className="font-medium">{l.source} • {l.level}</div>
                                    <div className="text-zinc-600 dark:text-zinc-400">{l.message}</div>
                                    <div className="text-xs text-zinc-500">{new Date(l.ts).toLocaleString()}</div>
                                </div>
                            </div>
                        ))}
                        {!logs?.length && (
                            <div className="text-zinc-500 text-sm">No logs yet.</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

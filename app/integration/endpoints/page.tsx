"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Api } from "@/lib/client";
import type { EndpointConfig } from "@/lib/types";

export default function EndpointsPage() {
    const [list, setList] = useState<EndpointConfig[]>([]);
    const [loading, setLoading] = useState(true);

    async function refresh() {
        setLoading(true);
        try {
            const data = await Api.listEndpoints();
            setList(data);
        } catch {
            setList([]);
        } finally {
            setLoading(false);
        }
    }
    useEffect(() => { refresh(); }, []);

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h3 className="text-lg font-semibold">API Connector & Dispatcher</h3>
                    <p className="text-sm text-muted-foreground max-w-2xl">
                        Define secure endpoints, inject campaign/user parameters, and reuse them across WhatsApp flows without redeploying code.
                    </p>
                </div>
                <Link
                    href="/integration/endpoints/create"
                    className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90">
                    New Endpoint
                </Link>
            </div>

            <div className="rounded-xl border overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-zinc-50 dark:bg-zinc-900">
                        <tr>
                            <th className="text-left px-3 py-2">Name</th>
                            <th className="text-left px-3 py-2">Method</th>
                            <th className="text-left px-3 py-2">URL</th>
                            <th className="text-left px-3 py-2">Auth</th>
                            <th className="text-right px-3 py-2">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td className="px-3 py-3" colSpan={5}>Loading…</td></tr>
                        ) : list.length ? list.map(e => (
                            <tr key={String(e.id)} className="border-t">
                                <td className="px-3 py-2">{e.name}</td>
                                <td className="px-3 py-2">{e.method}</td>
                                <td className="px-3 py-2 truncate max-w-[40ch]">{e.url}</td>
                                <td className="px-3 py-2">{e.auth?.type ?? "none"}</td>
                                <td className="px-3 py-2 text-right space-x-2">
                                    <Link className="px-2 py-1 rounded border" href={`/integration/endpoints/${e.id}`}>
                                        Edit
                                    </Link>
                                    <button
                                        className="px-2 py-1 rounded border"
                                        onClick={async () => { await Api.deleteEndpoint(e.id!); await refresh(); }}
                                    >
                                        Delete
                                    </button>
                                </td>
                            </tr>
                        )) : (
                            <tr><td className="px-3 py-3 text-zinc-500" colSpan={5}>No endpoints yet.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}


"use client";
import { useEffect, useState } from "react";
import { Api } from "@/lib/client";
import type { TemplateDef } from "@/lib/types";

export default function TemplatesPage() {
    const [list, setList] = useState<TemplateDef[]>([]);
    const [loading, setLoading] = useState(true);
    const [draft, setDraft] = useState<TemplateDef>({ name: "", locale: "en", body: "Hi {{name}}, your points are {{points}}." });

    async function refresh() {
        setLoading(true);
        try { setList(await Api.listTemplates()); } catch { setList([]); }
        setLoading(false);
    }
    useEffect(() => { refresh(); }, []);

    return (
        <div className="space-y-6">
            <h3 className="text-lg font-semibold">Reply Templates</h3>

            <div className="rounded-xl border p-4 space-y-3">
                <div className="grid md:grid-cols-3 gap-3">
                    <input className="rounded-md border px-3 py-2" placeholder="Name"
                        value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
                    <select className="rounded-md border px-3 py-2"
                        value={draft.locale} onChange={e => setDraft({ ...draft, locale: e.target.value })}>
                        <option value="en">English</option>
                        <option value="ms">Bahasa Melayu</option>
                        <option value="zh">中文</option>
                    </select>
                    <div />
                </div>
                <textarea className="w-full rounded-md border px-3 py-2 h-28"
                    value={draft.body} onChange={e => setDraft({ ...draft, body: e.target.value })} />
                <div className="flex gap-2">
                    <button className="px-3 py-2 rounded-md bg-primary text-primary-foreground"
                        onClick={async () => { await Api.createTemplate(draft); setDraft({ name: "", locale: "en", body: "" }); await refresh(); }}>
                        Add Template
                    </button>
                </div>
            </div>

            <div className="rounded-xl border">
                <table className="w-full text-sm">
                    <thead className="bg-zinc-50 dark:bg-zinc-900">
                        <tr>
                            <th className="text-left px-3 py-2">Name</th>
                            <th className="text-left px-3 py-2">Locale</th>
                            <th className="text-left px-3 py-2">Body</th>
                            <th className="text-right px-3 py-2">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td className="px-3 py-3" colSpan={4}>Loading…</td></tr>
                        ) : list.length ? list.map(t => (
                            <tr key={String(t.id)} className="border-t">
                                <td className="px-3 py-2">{t.name}</td>
                                <td className="px-3 py-2">{t.locale}</td>
                                <td className="px-3 py-2">{t.body}</td>
                                <td className="px-3 py-2 text-right">
                                    <button className="px-2 py-1 rounded border"
                                        onClick={async () => { await Api.deleteTemplate(t.id!); await refresh(); }}>
                                        Delete
                                    </button>
                                </td>
                            </tr>
                        )) : (
                            <tr><td className="px-3 py-3 text-zinc-500" colSpan={4}>No templates yet.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

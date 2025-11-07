"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

type Content = {
  contentid: number;
  title: string;
  type: string;
  status: string;
  defaultlang: string;
  currentversion: number | null;
  expiresat?: string | null;
};

type Version = { templateversionid: number; contentid: number; versionno: number; changenote?: string; createdby?: string; createdat?: string };
type Variant = { variantid: number; contentid: number; versionno: number; lang: string; body: string; placeholders: any };
type Tag = { tagid: number; name: string };

export default function TemplateDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = useMemo(() => (params?.id ? Number(params.id) : NaN), [params]);

  const [content, setContent] = useState<Content | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Forms
  const [note, setNote] = useState("");
  const [newVariant, setNewVariant] = useState({ lang: "en", body: "", placeholders: "[]" });
  const [previewLang, setPreviewLang] = useState<string>("en");
  const [preview, setPreview] = useState<{ body?: string; placeholders?: any } | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [tagInput, setTagInput] = useState<string>("");
  const [expiresAt, setExpiresAt] = useState<string>("");

  useEffect(() => {
    if (!id || Number.isNaN(id)) return;
    const load = async () => {
      try {
        setLoading(true);
        const [cRes, vRes] = await Promise.all([
          fetch(`http://localhost:3000/api/template/${id}`),
          fetch(`http://localhost:3000/api/template/${id}/versions`),
        ]);
        const ensureJson = async (res: Response) => {
          const ct = res.headers.get("content-type") || "";
          if (!res.ok) throw new Error(await res.text());
          return ct.includes("application/json") ? res.json() : JSON.parse(await res.text());
        };
        const c = await ensureJson(cRes);
        const v = await ensureJson(vRes);
        setContent(c);
        setVersions(v);
        const initialVersion = c?.currentversion || v?.[0]?.versionno || null;
        setSelectedVersion(initialVersion);
      } catch (e: any) {
        setErr(e?.message || "Failed to load");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  useEffect(() => {
    if (!id || !selectedVersion) { setVariants([]); return; }
    (async () => {
      try {
        const res = await fetch(`http://localhost:3000/api/template/${id}/variants?versionNo=${selectedVersion}`);
        const ct = res.headers.get("content-type") || "";
        if (!res.ok) throw new Error(await res.text());
        const data: Variant[] = ct.includes("application/json") ? await res.json() : JSON.parse(await res.text());
        setVariants(data);
      } catch {
        setVariants([]);
      }
    })();
  }, [id, selectedVersion]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const res = await fetch(`http://localhost:3000/api/template/${id}/tags`);
        const ct = res.headers.get("content-type") || "";
        if (!res.ok) throw new Error(await res.text());
        const data: Tag[] = ct.includes("application/json") ? await res.json() : JSON.parse(await res.text());
        setTags(data);
      } catch {
        setTags([]);
      }
    })();
  }, [id]);

  const saveTags = async () => {
    if (!id) return;
    const list = tagInput
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    const res = await fetch(`http://localhost:3000/api/template/${id}/tags`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tags: list })
    });
    if (res.ok) {
      setTagInput("");
      const re = await fetch(`http://localhost:3000/api/template/${id}/tags`);
      setTags(await re.json());
    }
  };

  const scheduleExpiry = async () => {
    if (!id || !expiresAt) return;
    const iso = new Date(expiresAt).toISOString();
    const res = await fetch(`http://localhost:3000/api/template/${id}/expire`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresAt: iso })
    });
    if (res.ok) {
      alert('Expiry saved');
    }
  };

  const softDelete = async () => {
    if (!id) return;
    if (!confirm('This will hide the template. Continue?')) return;
    const res = await fetch(`http://localhost:3000/api/template/${id}/delete`, { method: 'POST' });
    if (res.ok) router.push('/content/templates');
  };

  const createVersion = async () => {
    if (!id) return;
    const res = await fetch(`http://localhost:3000/api/template/${id}/version`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ changeNote: note, setCurrent: true })
    });
    if (res.ok) {
      const v = await res.json();
      setNote("");
      // reload versions
      const vRes = await fetch(`http://localhost:3000/api/template/${id}/versions`);
      const vv = await vRes.json();
      setVersions(vv);
      setSelectedVersion(v?.version?.versionno ?? vv?.[0]?.versionno ?? null);
    }
  };

  const addVariant = async () => {
    if (!id || !selectedVersion) return;
    let placeholders: any;
    try { placeholders = JSON.parse(newVariant.placeholders || "[]"); }
    catch { alert('Placeholders must be valid JSON'); return; }
    const res = await fetch(`http://localhost:3000/api/template/${id}/variant`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ versionNo: selectedVersion, lang: newVariant.lang, body: newVariant.body, placeholders })
    });
    if (res.ok) {
      setNewVariant({ lang: content?.defaultlang || 'en', body: '', placeholders: '[]' });
      const list = await fetch(`http://localhost:3000/api/template/${id}/variants?versionNo=${selectedVersion}`);
      setVariants(await list.json());
    }
  };

  const runPreview = async () => {
    if (!id) return;
    const res = await fetch(`http://localhost:3000/api/template/${id}/render?lang=${previewLang}${selectedVersion ? `&versionNo=${selectedVersion}` : ''}`);
    const data = await res.json();
    if (res.ok) setPreview({ body: data?.variant?.body, placeholders: data?.variant?.placeholders });
    else setPreview({ body: `Error: ${data?.error}` });
  };

  if (loading) return <div className="max-w-5xl mx-auto mt-10 p-6 bg-white rounded-2xl shadow-lg">Loading…</div>;
  if (err) return <div className="max-w-5xl mx-auto mt-10 p-6 bg-white rounded-2xl shadow-lg text-red-600">{err}</div>;
  if (!content) return <div className="max-w-5xl mx-auto mt-10 p-6 bg-white rounded-2xl shadow-lg">Not found</div>;

  return (
    <div className="max-w-5xl mx-auto mt-10 p-6 bg-white rounded-2xl shadow-lg space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Template: {content.title}</h1>
          <p className="text-gray-600">Type: {content.type} • Status: {content.status} • Default Lang: {content.defaultlang}</p>
        </div>
                <Link className="px-3 py-2 bg-gray-100 rounded border" href="/content/templates">Back</Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-4 border rounded">
          <h2 className="font-semibold mb-2">Versions</h2>
          <div className="flex items-center gap-2 mb-3">
            <select className="p-2 border rounded" value={selectedVersion ?? ''} onChange={(e) => setSelectedVersion(Number(e.target.value))}>
              {versions.map(v => (
                <option key={v.templateversionid} value={v.versionno}>v{v.versionno}{content.currentversion === v.versionno ? ' (current)' : ''}</option>
              ))}
            </select>
            <input className="p-2 border rounded flex-1" placeholder="Change note" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="px-3 py-2 bg-blue-600 text-white rounded" onClick={createVersion}>New Version</button>
          </div>
          <ul className="max-h-48 overflow-auto text-sm text-gray-700 list-disc pl-5">
            {versions.map(v => (
              <li key={v.templateversionid}>v{v.versionno} • {v.changenote || '—'} • {v.createdby || '—'} • {v.createdat ? new Date(v.createdat).toLocaleString() : '—'}</li>
            ))}
          </ul>
        </div>

        <div className="p-4 border rounded">
          <h2 className="font-semibold mb-2">Add Variant</h2>
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <input className="p-2 border rounded" placeholder="Lang (e.g. en)" maxLength={2} value={newVariant.lang} onChange={(e) => setNewVariant(v => ({ ...v, lang: e.target.value.toLowerCase() }))} />
              <div className="col-span-2">
                <input className="p-2 border rounded w-full" placeholder="Body" value={newVariant.body} onChange={(e) => setNewVariant(v => ({ ...v, body: e.target.value }))} />
              </div>
            </div>
            <textarea className="p-2 border rounded w-full min-h-28" placeholder='Placeholders JSON (e.g. [{"name":"first_name"}] )' value={newVariant.placeholders} onChange={(e) => setNewVariant(v => ({ ...v, placeholders: e.target.value }))} />
            <button className="px-3 py-2 bg-green-600 text-white rounded" onClick={addVariant}>Save Variant</button>
          </div>
        </div>
      </div>

      <div className="p-4 border rounded">
        <h2 className="font-semibold mb-2">Variants for v{selectedVersion ?? '—'}</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full border text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="text-left p-2 border">VariantID</th>
                <th className="text-left p-2 border">Lang</th>
                <th className="text-left p-2 border">Body</th>
                <th className="text-left p-2 border">Placeholders</th>
              </tr>
            </thead>
            <tbody>
              {variants.map(v => (
                <tr key={v.variantid} className="hover:bg-gray-50">
                  <td className="p-2 border">{v.variantid}</td>
                  <td className="p-2 border">{v.lang}</td>
                  <td className="p-2 border">{v.body}</td>
                  <td className="p-2 border"><pre className="whitespace-pre-wrap break-words">{JSON.stringify(v.placeholders)}</pre></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="p-4 border rounded">
        <h2 className="font-semibold mb-2">Preview</h2>
        <div className="flex items-center gap-2 mb-2">
          <input className="p-2 border rounded w-32" placeholder="Lang" maxLength={2} value={previewLang} onChange={(e) => setPreviewLang(e.target.value.toLowerCase())} />
          <button className="px-3 py-2 bg-indigo-600 text-white rounded" onClick={runPreview}>Resolve Variant</button>
        </div>
        {preview && (
          <div className="bg-gray-50 p-3 rounded border">
            <div className="font-mono text-sm">{preview.body}</div>
            {preview.placeholders && (
              <div className="mt-2 text-xs text-gray-600">Placeholders: <pre className="whitespace-pre-wrap break-words inline">{JSON.stringify(preview.placeholders)}</pre></div>
            )}
          </div>
        )}
      </div>

      <div className="p-4 border rounded">
        <h2 className="font-semibold mb-2">Tags</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          {tags.map(t => (
            <span key={t.tagid} className="px-2 py-1 text-xs rounded-full bg-gray-100 border">{t.name}</span>
          ))}
          {!tags.length && <span className="text-sm text-gray-500">No tags yet.</span>}
        </div>
        <div className="flex gap-2">
          <input className="p-2 border rounded flex-1" placeholder="Add tags e.g. RAYA2025 EN approved" value={tagInput} onChange={e => setTagInput(e.target.value)} />
          <button className="px-3 py-2 bg-gray-800 text-white rounded" onClick={saveTags}>Save Tags</button>
        </div>
        <p className="text-xs text-gray-500 mt-1">Separate with comma or space. Replaces the tag set.</p>
      </div>

      <div className="p-4 border rounded">
        <h2 className="font-semibold mb-2">Lifecycle</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Expiry</label>
            <input className="p-2 border rounded w-full" type="datetime-local" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} />
            <div className="mt-2 flex items-center gap-2">
              <button className="px-3 py-2 bg-amber-600 text-white rounded" onClick={scheduleExpiry}>Schedule Expiry</button>
              <span className="text-xs text-gray-500">Current: {content.expiresat ? new Date(content.expiresat).toLocaleString() : 'none'}</span>
            </div>
          </div>
          <div className="flex items-end justify-end">
            <button className="px-3 py-2 bg-red-600 text-white rounded" onClick={softDelete}>Soft Delete</button>
          </div>
        </div>
      </div>
    </div>
  );
}

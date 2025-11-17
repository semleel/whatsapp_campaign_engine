"use client";

import { useEffect, useState, FormEvent } from "react";
import { Api } from "@/lib/client";

type CampaignOption = {
  campaignid: number;
  campaignname: string;
  status?: string;
};

type KeywordRow = {
  keywordid: number;
  value: string;
  campaignid: number;
  campaignname: string;
};

// Fallback from environment (Option C)
const FALLBACK_MESSAGE =
  process.env.NEXT_PUBLIC_KEYWORD_FALLBACK_MESSAGE ??
  "Sorry, I didn't understand that. Type MENU to see available campaigns.";

export default function KeywordEntryModule() {
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [keywords, setKeywords] = useState<KeywordRow[]>([]);

  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [loadingKeywords, setLoadingKeywords] = useState(true);
  const [campaignError, setCampaignError] = useState<string | null>(null);
  const [keywordError, setKeywordError] = useState<string | null>(null);

  const [draft, setDraft] = useState({
    keyword: "",
    campaignId: 0,
  });

  const [submitting, setSubmitting] = useState(false);
  const [keywordMessage, setKeywordMessage] = useState("");
  const [fallback] = useState(FALLBACK_MESSAGE); // read-only

  // Load campaigns and keywords on mount
  useEffect(() => {
    const loadCampaigns = async () => {
      setLoadingCampaigns(true);
      setCampaignError(null);
      try {
        const data = await Api.listCampaigns();
        const options: CampaignOption[] = data.map((c) => ({
          campaignid: c.campaignid,
          campaignname: c.campaignname,
          status: c.currentstatus,
        }));
        setCampaigns(options);
      } catch (err) {
        console.error("Error loading campaigns:", err);
        setCampaignError("Unable to load campaigns.");
      } finally {
        setLoadingCampaigns(false);
      }
    };

    const loadKeywords = async () => {
      setLoadingKeywords(true);
      setKeywordError(null);
      try {
        const data = await Api.listAllKeywords();
        setKeywords(data);
      } catch (err) {
        console.error("Error loading keywords:", err);
        setKeywordError("Unable to load keywords.");
      } finally {
        setLoadingKeywords(false);
      }
    };

    loadCampaigns();
    loadKeywords();
  }, []);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    setKeywordMessage("");

    const rawKeyword = draft.keyword.trim();
    if (!rawKeyword || draft.campaignId === 0) return;

    const normalized = rawKeyword.toLowerCase();
    const campaign = campaigns.find((c) => c.campaignid === draft.campaignId);
    if (!campaign) return;

    setSubmitting(true);
    try {
      const data = await Api.createKeyword(normalized, draft.campaignId);
      const created = data.keyword;

      const newRow: KeywordRow = {
        keywordid: created.keywordid,
        value: created.value,
        campaignid: created.campaignid,
        campaignname: campaign.campaignname,
      };

      setKeywords((prev) => [newRow, ...prev]);
      setDraft({ keyword: "", campaignId: 0 });
      setKeywordMessage("Keyword mapping created.");
    } catch (err) {
      console.error("Create keyword error:", err);
      setKeywordMessage("Failed to create keyword.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (keywordid: number) => {
    if (!confirm("Remove this keyword mapping?")) return;
    setKeywordMessage("");
    try {
      await Api.deleteKeyword(keywordid);

      setKeywords((prev) => prev.filter((k) => k.keywordid !== keywordid));
      setKeywordMessage("Keyword removed.");
    } catch (err) {
      console.error("Delete keyword error:", err);
      setKeywordMessage("Failed to remove keyword.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Keyword & Entry Point Handler</h3>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Manage global keyword routing rules. Each keyword is mapped to a single campaign so inbound messages can be
            routed correctly.
          </p>
        </div>
      </div>

      {/* New mapping */}
      <section className="rounded-xl border p-5 space-y-4">
        <div>
          <h4 className="text-base font-semibold">Add keyword mapping</h4>
          <p className="text-sm text-muted-foreground">
            Define which campaign should be triggered when a user types a specific keyword in WhatsApp.
          </p>
        </div>

        <form onSubmit={handleAdd} className="grid gap-4 md:grid-cols-3">
          <input
            className="rounded-md border px-3 py-2 text-sm"
            placeholder="Keyword (e.g. promo)"
            value={draft.keyword}
            onChange={(e) => setDraft({ ...draft, keyword: e.target.value })}
          />

          <select
            className="rounded-md border px-3 py-2 text-sm bg-white"
            value={draft.campaignId}
            onChange={(e) =>
              setDraft({ ...draft, campaignId: Number(e.target.value) })
            }
            disabled={loadingCampaigns || !!campaignError}
          >
            <option value={0}>
              {loadingCampaigns
                ? "Loading campaigns..."
                : campaignError
                  ? "Error loading campaigns"
                  : "Select campaign"}
            </option>
            {campaigns.map((c) => (
              <option key={c.campaignid} value={c.campaignid}>
                {c.campaignname}
                {c.status ? ` (${c.status})` : ""}
              </option>
            ))}
          </select>

          <div className="md:col-span-3 flex justify-end">
            <button
              type="submit"
              disabled={
                submitting ||
                !draft.keyword.trim() ||
                draft.campaignId === 0 ||
                loadingCampaigns ||
                !!campaignError
              }
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm disabled:opacity-60"
            >
              {submitting ? "Saving..." : "Save mapping"}
            </button>
          </div>
        </form>

        {campaignError && (
          <p className="text-xs text-red-600 mt-1">{campaignError}</p>
        )}
      </section>

      {/* Keyword table */}
      <section className="rounded-xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Keyword</th>
              <th className="px-3 py-2 text-left font-medium">Campaign</th>
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loadingKeywords ? (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-xs text-muted-foreground">
                  Loading keywords...
                </td>
              </tr>
            ) : keywordError ? (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-xs text-red-600">
                  {keywordError}
                </td>
              </tr>
            ) : keywords.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-xs text-muted-foreground">
                  No keyword mappings yet. Add one above to get started.
                </td>
              </tr>
            ) : (
              keywords.map((k) => (
                <tr key={k.keywordid} className="border-t">
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    {k.value}
                  </td>
                  <td className="px-3 py-2">{k.campaignname}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => handleDelete(k.keywordid)}
                      className="rounded border px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {keywordMessage && (
          <div className="px-3 py-2 text-[11px] text-muted-foreground">
            {keywordMessage}
          </div>
        )}
      </section>

      {/* Fallback message */}
      <section className="rounded-xl border p-5 space-y-3">
        <div>
          <h4 className="text-base font-semibold">Global fallback message</h4>
          <p className="text-sm text-muted-foreground">
            Sent when an inbound message doesn&apos;t match any configured keyword. Controlled via environment/config.
          </p>
        </div>
        <textarea
          className="w-full rounded-md border px-3 py-2 text-sm bg-muted/40"
          value={fallback}
          readOnly
        />
        <p className="text-xs text-muted-foreground">
          This message comes from{" "}
          <span className="font-mono">
            NEXT_PUBLIC_KEYWORD_FALLBACK_MESSAGE
          </span>{" "}
          in your environment variables.
        </p>
      </section>
    </div>
  );
}




"use client";

import { useEffect, useState, FormEvent } from "react";
import AnnouncementModal from "@/components/AnnouncementModal";
import { Api } from "@/lib/client";
import { showCenteredConfirm } from "@/lib/showAlert";

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
  campaignstatus?: string | null;
};

// Fallback from environment (Option C)
const FALLBACK_MESSAGE =
  process.env.NEXT_PUBLIC_KEYWORD_FALLBACK_MESSAGE ??
  "Sorry, I didn't understand that. Type MENU to see available campaigns.";
const KEYWORD_PATTERN = /^[a-z0-9]+$/;

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
  const [campaignFilter, setCampaignFilter] = useState("");
  const [campaignPage, setCampaignPage] = useState(1);
  const ITEMS_PER_PAGE = 10;
  const normalizedFilter = campaignFilter.trim().toLowerCase();
  const filteredCampaigns = campaigns.filter((campaign) => {
    if (!normalizedFilter) return true;
    const nameMatch = campaign.campaignname
      .toLowerCase()
      .includes(normalizedFilter);
    const statusMatch = (campaign.status || "")
      .toLowerCase()
      .includes(normalizedFilter);
    return nameMatch || statusMatch;
  });
  const totalCampaignPages = Math.max(
    1,
    Math.ceil(filteredCampaigns.length / ITEMS_PER_PAGE)
  );
  const paginatedCampaigns = filteredCampaigns.slice(
    (campaignPage - 1) * ITEMS_PER_PAGE,
    campaignPage * ITEMS_PER_PAGE
  );

  useEffect(() => {
    if (campaignPage > totalCampaignPages) {
      setCampaignPage(totalCampaignPages);
    }
  }, [campaignPage, totalCampaignPages]);

  const [submitting, setSubmitting] = useState(false);
  const [keywordFormError, setKeywordFormError] = useState("");
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [fallback] = useState(FALLBACK_MESSAGE); // read-only
  const [showAddForm, setShowAddForm] = useState(false);

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
    setKeywordFormError("");
    setAnnouncement(null);

    const rawKeyword = draft.keyword.trim();
    if (!rawKeyword || draft.campaignId === 0) return;

    const normalized = rawKeyword.toLowerCase();
    const campaign = campaigns.find((c) => c.campaignid === draft.campaignId);
    if (!campaign) return;

    if (!KEYWORD_PATTERN.test(normalized)) {
      setKeywordFormError("Keyword must only contain letters and numbers.");
      return;
    }

    setSubmitting(true);
    try {
      const availability = await Api.checkKeywordAvailability(normalized);
      const data = availability.data;
      if (
        !availability.ok ||
        (data && data.available === false) ||
        (data && "error" in data && data.error)
      ) {
        const campaignHint =
          data && data.campaignname
            ? ` Keyword already belongs to "${data.campaignname}".`
            : "";
        setKeywordFormError(
          (data && data.error) ||
            (data && data.available === false
              ? `Keyword already taken.${campaignHint}`
              : "Unable to validate keyword. Please try again.")
        );
        return;
      }

      const result = await Api.createKeyword(normalized, draft.campaignId);
      const created = result.keyword;

      const newRow: KeywordRow = {
        keywordid: created.keywordid,
        value: created.value,
        campaignid: created.campaignid,
        campaignname: campaign.campaignname,
        campaignstatus: created.campaignstatus ?? campaign.status ?? null,
      };

      setKeywords((prev) => [newRow, ...prev]);
      setDraft({ keyword: "", campaignId: 0 });
      setKeywordFormError("");
      setAnnouncement("Keyword mapping created.");
    } catch (err) {
      console.error("Create keyword error:", err);
      setKeywordFormError("Failed to create keyword.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (keywordid: number) => {
    const confirmed = await showCenteredConfirm("Remove this keyword mapping?");
    if (!confirmed) return;
    setKeywordFormError("");
    setAnnouncement(null);
    try {
      await Api.deleteKeyword(keywordid);

      setKeywords((prev) => prev.filter((k) => k.keywordid !== keywordid));
      setAnnouncement("Keyword removed.");
    } catch (err) {
      console.error("Delete keyword error:", err);
      setKeywordFormError("Failed to remove keyword.");
    }
  };

  return (
    <div className="space-y-6">
      {announcement && (
        <AnnouncementModal message={announcement} onClose={() => setAnnouncement(null)} />
      )}
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Keyword & Entry Point Handler</h3>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Manage global keyword routing rules. Each keyword is mapped to a single campaign so inbound messages can be
            routed correctly.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddForm((prev) => !prev)}
          className="rounded-md border border-blue-500 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50"
        >
          {showAddForm ? "Hide add keyword form" : "Show add keyword form"}
        </button>
      </div>

      {/* New mapping */}
      {showAddForm && (
        <section className="rounded-xl border p-5 space-y-4">
        <div>
          <h4 className="text-base font-semibold">Add keyword mapping</h4>
          <p className="text-sm text-muted-foreground">
            Define which campaign should be triggered when a user types a specific keyword in WhatsApp.
          </p>
        </div>

        <form onSubmit={handleAdd} className="space-y-4">
          <input
            className="rounded-md border px-3 py-2 text-sm"
            placeholder="Keyword (e.g. promo)"
            value={draft.keyword}
            onChange={(e) => setDraft({ ...draft, keyword: e.target.value })}
          />

          <div className="space-y-2">
            <input
              type="text"
              value={campaignFilter}
              onChange={(e) => {
                setCampaignFilter(e.target.value);
                setCampaignPage(1);
              }}
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Filter campaigns (name or status)"
            />
            <div className="h-48 overflow-y-auto rounded-md border bg-card">
              {!loadingCampaigns &&
                filteredCampaigns.length === 0 &&
                !campaignError && (
                  <div className="p-3 text-xs text-muted-foreground">
                    No campaigns match this filter.
                  </div>
                )}
              {loadingCampaigns ? (
                <div className="p-3 text-xs text-muted-foreground">
                  Loading campaigns...
                </div>
              ) : campaignError ? (
                <div className="p-3 text-xs text-rose-600">{campaignError}</div>
              ) : (
                paginatedCampaigns.map((c) => (
                  <button
                    key={c.campaignid}
                    type="button"
                    onClick={() =>
                      setDraft((prev) => ({ ...prev, campaignId: c.campaignid }))
                    }
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${
                      draft.campaignId === c.campaignid
                        ? "bg-primary/20 font-semibold"
                        : "hover:bg-muted"
                    }`}
                  >
                    <span>{c.campaignname}</span>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {c.status || "Unknown"}
                    </span>
                  </button>
                ))
              )}
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <button
                type="button"
                onClick={() =>
                  setCampaignPage((prev) => Math.max(1, prev - 1))
                }
                disabled={campaignPage === 1}
                className="underline disabled:text-muted-foreground"
              >
                Prev
              </button>
              <span>
                Page {campaignPage} / {totalCampaignPages}
              </span>
              <button
                type="button"
                onClick={() =>
                  setCampaignPage((prev) =>
                    Math.min(totalCampaignPages, prev + 1)
                  )
                }
                disabled={campaignPage === totalCampaignPages}
                className="underline disabled:text-muted-foreground"
              >
                Next
              </button>
            </div>
          </div>

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

        {keywordFormError && (
          <p className="text-xs text-rose-600 mt-2">{keywordFormError}</p>
        )}

        {campaignError && (
          <p className="text-xs text-red-600 mt-1">{campaignError}</p>
        )}
      </section>
      )}

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
                  <td className="px-3 py-2">
                    <div className="font-medium">{k.campaignname}</div>
                    {(k.campaignstatus || "").toLowerCase() === "archived" && (
                      <div className="text-[11px] uppercase text-rose-600">
                        Archived
                      </div>
                    )}
                  </td>
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

        {keywordFormError && (
          <div className="px-3 py-2 text-[11px] text-rose-600">
            {keywordFormError}
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

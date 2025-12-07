// app/campaign/create/page.tsx

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Api } from "@/lib/client";
import type { CampaignCreatePayload } from "@/lib/types";
import { showCenteredAlert, showPrivilegeDenied } from "@/lib/showAlert";
import { usePrivilege } from "@/lib/permissions";

type SelectOption = { id: string; name: string; code?: string };

export default function CampaignCreatePage() {
  const router = useRouter();
  const { canCreate, loading: privLoading } = usePrivilege("campaigns");
  const navLinkClass =
    "inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1.5 text-sm font-semibold text-primary shadow-sm hover:bg-secondary/80";
  const backIcon = (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M11.5 5.5 7 10l4.5 4.5 1.4-1.4L9.8 10l3.1-3.1z" />
    </svg>
  );
  const [formData, setFormData] = useState({
    campaignName: "",
    objective: "",
    targetRegionID: "",
    startAt: "",
    endAt: "",
  });

  const [regions, setRegions] = useState<SelectOption[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // keyword UI state
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordDraft, setKeywordDraft] = useState("");
  const [keywordMessage, setKeywordMessage] = useState("");

  useEffect(() => {
    (async () => {
      if (privLoading || !canCreate) return;
      try {
        const regionData = await Api.listRegions();
        setRegions(
          (regionData || []).map((r) => ({
            id: String(r.regionid),
            name: r.regionname,
            code: r.regioncode || undefined,
          }))
        );
      } catch (err) {
        console.error("Error fetching regions:", err);
      }
    })();
  }, [privLoading, canCreate]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  // Add keyword: check DB first, then add chip
  const handleAddKeyword = async () => {
    const raw = keywordDraft.trim().toLowerCase();
    if (!raw) return;

    if (keywords.includes(raw)) {
      setKeywordMessage("Keyword already added for this campaign.");
      return;
    }

    try {
      const availability = await Api.checkKeywordAvailability(raw);
      if (!availability.ok) {
        const data = availability.data;
        setKeywordMessage(
          (data && "error" in data && data.error) ||
            "Unable to validate keyword. Please try again."
        );
        return;
      }

      setKeywords((prev) => [raw, ...prev]);
      setKeywordDraft("");
      setKeywordMessage("");
    } catch (err) {
      console.error("Keyword check failed:", err);
      setKeywordMessage("Unable to validate keyword right now.");
    }
  };

  const handleRemoveKeyword = (value: string) => {
    setKeywords((prev) => prev.filter((k) => k !== value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreate) {
      await showPrivilegeDenied({ action: "create campaigns", resource: "Campaigns" });
      setKeywordMessage("You do not have permission to create campaigns.");
      return;
    }
    setSubmitting(true);
    setKeywordMessage("");

    const payload: CampaignCreatePayload = {
      campaignName: formData.campaignName,
      objective: formData.objective || null,
      targetRegionID: formData.targetRegionID || null,
      startAt: formData.startAt || null,
      endAt: formData.endAt || null,
    };

    try {
      const response = await Api.createCampaign(payload);
      const createdCampaign = response.data;

      let noticeMessage = "Campaign created successfully.";

      setFormData({
        campaignName: "",
        objective: "",
        targetRegionID: "",
        startAt: "",
        endAt: "",
      });

      const campaignId = createdCampaign?.campaignid;
      if (campaignId && keywords.length > 0) {
        const duplicates: string[] = [];
        const otherFailures: string[] = [];

        for (const value of keywords) {
          try {
            const availability = await Api.checkKeywordAvailability(value);
            if (!availability.ok) {
              // Already used in another campaign -> treat as duplicate
              duplicates.push(value);
              continue;
            }

            await Api.createKeyword(value, campaignId);
          } catch (err) {
            console.error("Keyword create error:", err);
            const msg = err instanceof Error ? err.message.toLowerCase() : "";
            if (msg.includes("keyword")) {
              duplicates.push(value);
            } else {
              otherFailures.push(value);
            }
          }
        }

        let keywordSummary = "";

        if (duplicates.length) {
          keywordSummary += `Duplicates skipped: ${duplicates.join(", ")}. `;
        }

        if (otherFailures.length) {
          keywordSummary += `Failed to save: ${otherFailures.join(", ")}.`;
        }

        if (keywordSummary.trim()) {
          noticeMessage += ` ${keywordSummary.trim()}`;
        } else {
          noticeMessage += " Keywords created for this campaign.";
        }
      }

      setKeywords([]);
      router.push(`/campaign?notice=${encodeURIComponent(noticeMessage)}`);
    } catch (err) {
      console.error(err);
      await showCenteredAlert(err instanceof Error ? err.message : "Network error.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!privLoading && !canCreate) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
        You do not have permission to create campaigns.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">New Campaign</h3>
          <p className="text-sm text-muted-foreground">
            Define campaign intent, targeting, timing, and entry keywords for WhatsApp.
          </p>
        </div>
        <Link
          href="/campaign"
          className={navLinkClass}
        >
          {backIcon}
          Back to campaigns
        </Link>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-xl border bg-card p-6 space-y-5"
      >
        {/* Basic info */}
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm font-medium">
            <span>
              Campaign name{" "}
              <span className="text-rose-600" aria-hidden="true">
                *
              </span>
            </span>
            <input
              type="text"
              name="campaignName"
              value={formData.campaignName}
              onChange={handleChange}
              className="w-full rounded-md border px-3 py-2"
              placeholder="e.g. Festive Loyalty Boost"
              required
            />
          </label>
          <label className="space-y-1 text-sm font-medium">
            <span>Objective</span>
            <textarea
              name="objective"
              value={formData.objective}
              onChange={handleChange}
              className="w-full rounded-md border px-3 py-2 min-h-[80px]"
              placeholder="Describe what this campaign is trying to achieve."
            />
          </label>
        </div>

        {/* Target & schedule */}
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm font-medium">
            <span>Target region</span>
            <select
              name="targetRegionID"
              value={formData.targetRegionID}
              onChange={handleChange}
              className="w-full rounded-md border px-3 py-2"
            >
              <option value="">Select region</option>
              {regions.map((region) => (
                <option key={region.id} value={region.id}>
                  {region.name}
                  {region.code ? ` (${region.code})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium">
            <span>Start</span>
            <input
              type="datetime-local"
              name="startAt"
              value={formData.startAt}
              onChange={handleChange}
              className="w-full rounded-md border px-3 py-2"
            />
          </label>
          <label className="space-y-1 text-sm font-medium">
            <span>End</span>
            <input
              type="datetime-local"
              name="endAt"
              value={formData.endAt}
              onChange={handleChange}
              className="w-full rounded-md border px-3 py-2"
            />
          </label>
        </div>

        {/* Entry keywords section */}
        <section className="border-t pt-5 mt-2 space-y-4">
          <div>
            <h4 className="text-sm font-semibold">Entry keywords</h4>
            <p className="text-xs text-muted-foreground">
              Keywords that route inbound users into this campaign (e.g.{" "}
              <span className="font-mono">promo</span>,{" "}
              <span className="font-mono">raya</span>). You can also edit them
              later on the campaign detail page.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <input
              type="text"
              value={keywordDraft}
              onChange={(e) => setKeywordDraft(e.target.value)}
              className="rounded-md border px-3 py-2 text-sm flex-1 min-w-[180px]"
              placeholder="Add keyword (e.g. promo)"
            />
            <button
              type="button"
              onClick={handleAddKeyword}
              className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground shadow-sm disabled:opacity-60"
              disabled={!keywordDraft.trim()}
            >
              Add keyword
            </button>
          </div>

          <div className="rounded-lg border bg-muted/40 p-3">
            {keywords.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No keywords defined yet. Add at least one so users can enter
                this campaign via WhatsApp.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {keywords.map((k) => (
                  <span
                    key={k}
                    className="inline-flex items-center gap-1 rounded-full bg-white border px-3 py-1 text-xs"
                  >
                    <span className="font-mono text-[11px]">{k}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveKeyword(k)}
                      className="text-[11px] text-rose-600 hover:text-rose-700"
                    >
                      x
                    </button>
                  </span>
                ))}
              </div>
            )}
            {keywordMessage && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                {keywordMessage}
              </p>
            )}
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-end gap-3 pt-4">
          <Link
            href="/campaign"
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? "Saving..." : "Create campaign"}
          </button>
        </div>
      </form>

    </div>
  );
}

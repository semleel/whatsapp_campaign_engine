// app/campaign/[id]/page.tsx

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Api } from "@/lib/client";
import type {
  RegionRef,
  CampaignStatusRef,
  KeywordEntry,
} from "@/lib/types";
import { showCenteredConfirm } from "@/lib/showAlert";

const formatDateForInput = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
};

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [form, setForm] = useState({
    campaignName: "",
    objective: "",
    targetRegionID: "",
    camStatusID: "",
    startAt: "",
    endAt: "",
  });
  const [regions, setRegions] = useState<RegionRef[]>([]);
  const [statuses, setStatuses] = useState<CampaignStatusRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  // keyword state
  const [keywords, setKeywords] = useState<KeywordEntry[]>([]);
  const [keywordDraft, setKeywordDraft] = useState("");
  const [keywordLoading, setKeywordLoading] = useState(false);
  const [keywordMessage, setKeywordMessage] = useState("");

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const [regionRes, statusRes, campaignRes, keywordRes] = await Promise.all([
          Api.listRegions(),
          Api.listCampaignStatuses(),
          Api.getCampaign(id),
          Api.listKeywordsByCampaign(id),
        ]);

        setRegions(regionRes);
        setStatuses(statusRes);

        setForm({
          campaignName: campaignRes.campaignname || "",
          objective: campaignRes.objective || "",
          targetRegionID: campaignRes.targetregionid?.toString() || "",
          camStatusID: campaignRes.camstatusid?.toString() || "",
          startAt: formatDateForInput(campaignRes.start_at),
          endAt: formatDateForInput(campaignRes.end_at),
        });

        setKeywords(keywordRes);
      } catch (err) {
        console.error(err);
        setMessage("Unable to load campaign data.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("Saving...");
    try {
      await Api.updateCampaign(id, {
        ...form,
      });
      setMessage("Campaign updated successfully.");
      setTimeout(() => router.push("/campaign"), 1000);
    } catch (err) {
      console.error(err);
      setMessage(
        err instanceof Error ? err.message : "Failed to update campaign."
      );
    }
  };

  // Add keyword for this campaign - with pre-check like create page
  const handleAddKeyword = async () => {
    const raw = keywordDraft.trim().toLowerCase();
    if (!raw || !id) return;

    if (keywords.some((k) => k.value.toLowerCase() === raw)) {
      setKeywordMessage("This keyword is already added for this campaign.");
      return;
    }

    setKeywordLoading(true);
    setKeywordMessage("");

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

      const result = await Api.createKeyword(raw, Number(id));
      setKeywords((prev) => [result.keyword, ...prev]);
      setKeywordDraft("");
      setKeywordMessage("Keyword added.");
    } catch (err) {
      console.error(err);
      setKeywordMessage("Failed to add keyword.");
    } finally {
      setKeywordLoading(false);
    }
  };

  // Delete keyword
  const handleDeleteKeyword = async (keywordid: number) => {
    const confirmed = await showCenteredConfirm("Remove this keyword from this campaign?");
    if (!confirmed) return;
    setKeywordLoading(true);
    setKeywordMessage("");
    try {
      await Api.deleteKeyword(keywordid);
      setKeywords((prev) => prev.filter((k) => k.keywordid !== keywordid));
      setKeywordMessage("Keyword removed.");
    } catch (err) {
      console.error(err);
      setKeywordMessage("Failed to remove keyword.");
    } finally {
      setKeywordLoading(false);
    }
  };

  if (loading)
    return (
      <p className="text-sm text-muted-foreground">Loading campaign...</p>
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Edit Campaign</h3>
          <p className="text-sm text-muted-foreground">
            Update targeting, schedule window, status, and entry keywords for
            this campaign.
          </p>
        </div>
        <Link
          href="/campaign"
          className="text-sm font-medium text-primary hover:underline"
        >
          Back to list
        </Link>
        <Link
          href={`/campaign/${id}/steps`}
          className="text-sm font-medium text-primary hover:underline"
        >
          Manage steps
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
              value={form.campaignName}
              onChange={handleChange}
              className="w-full rounded-md border px-3 py-2"
              required
            />
          </label>
          <label className="space-y-1 text-sm font-medium">
            <span>Objective</span>
            <textarea
              name="objective"
              value={form.objective}
              onChange={handleChange}
              className="w-full rounded-md border px-3 py-2 min-h-[80px]"
              placeholder="Describe what this campaign is trying to achieve."
            />
          </label>
        </div>

        {/* Region & status */}
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm font-medium">
            <span>Target region</span>
            <select
              name="targetRegionID"
              value={form.targetRegionID}
              onChange={handleChange}
              className="w-full rounded-md border px-3 py-2"
            >
              <option value="">Select region</option>
              {regions.map((region) => (
                <option
                  key={region.regionid}
                  value={String(region.regionid)}
                >
                  {region.regionname}
                  {region.regioncode ? ` (${region.regioncode})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium">
            <span>Status</span>
            <select
              name="camStatusID"
              value={form.camStatusID}
              onChange={handleChange}
              className="w-full rounded-md border px-3 py-2"
            >
              <option value="">Select status</option>
              {statuses.map((status) => (
                <option
                  key={status.camstatusid}
                  value={status.camstatusid}
                >
                  {status.currentstatus}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Schedule */}
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm font-medium">
            <span>Start window</span>
            <input
              type="datetime-local"
              name="startAt"
              value={form.startAt}
              onChange={handleChange}
              className="w-full rounded-md border px-3 py-2"
            />
          </label>
          <label className="space-y-1 text-sm font-medium">
            <span>End window</span>
            <input
              type="datetime-local"
              name="endAt"
              value={form.endAt}
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
              <span className="font-mono">raya</span>). Multiple campaigns
              should not share the same active keyword.
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
              disabled={keywordLoading || !keywordDraft.trim()}
              className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground shadow-sm disabled:opacity-60"
            >
              {keywordLoading ? "Saving..." : "Add keyword"}
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
                    key={k.keywordid}
                    className="inline-flex items-center gap-1 rounded-full bg-white border px-3 py-1 text-xs"
                  >
                    <span className="font-mono text-[11px]">
                      {k.value}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteKeyword(k.keywordid)}
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
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90"
          >
            Save changes
          </button>
        </div>
      </form>

      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}

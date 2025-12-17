// app/feedback/page.tsx

"use client";

import { useEffect, useMemo, useState } from "react";
import { Api } from "@/lib/client";
import { usePrivilege } from "@/lib/permissions";
import type { FeedbackEntry } from "@/lib/types";

const RATING_OPTIONS: Array<{ value: "good" | "neutral" | "bad"; label: string }> = [
  { value: "good", label: "😊 Good" },
  { value: "neutral", label: "😐 Neutral" },
  { value: "bad", label: "😞 Bad" },
];

export default function FeedbackPage() {
  const { canView, loading: privLoading } = usePrivilege("feedback");
  const [items, setItems] = useState<FeedbackEntry[]>([]);
  const [ratingFilter, setRatingFilter] = useState<"good" | "neutral" | "bad" | null>(null);
  const [onlyWithComment, setOnlyWithComment] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (privLoading) return;
      if (!canView) {
        setError("You do not have permission to view feedback.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await Api.listFeedback({
          rating: ratingFilter ?? undefined,
          hasComment: onlyWithComment,
        });
        setItems(res.items || []);
      } catch (err: any) {
        setError(err?.message || "Failed to load feedback");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [canView, privLoading, ratingFilter, onlyWithComment]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((i) => {
      return (
        (i.comment || "").toLowerCase().includes(term) ||
        (i.contact_phone || "").toLowerCase().includes(term) ||
        (i.contact_name || "").toLowerCase().includes(term)
      );
    });
  }, [items, search]);

  if (!privLoading && !canView) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
        You do not have permission to view feedback.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Feedback</h2>
          <p className="text-sm text-muted-foreground">
            Ratings and comments collected from users (Good / Neutral / Bad).
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setRatingFilter(null)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                ratingFilter === null
                  ? "bg-primary text-primary-foreground shadow-sm border-primary/60"
                  : "bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              All
            </button>
            {RATING_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRatingFilter(opt.value === ratingFilter ? null : opt.value)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  ratingFilter === opt.value
                    ? "bg-primary text-primary-foreground shadow-sm border-primary/60"
                    : "bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={onlyWithComment}
              onChange={(e) => setOnlyWithComment(e.target.checked)}
            />
            With comment
          </label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search comment or contact"
            className="rounded-md border px-3 py-1.5 text-sm"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading feedback...</div>
      ) : (
        <div className="rounded-xl border overflow-hidden bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Rating</th>
                  <th className="px-3 py-2 text-left font-semibold">Comment</th>
                  <th className="px-3 py-2 text-left font-semibold">Contact</th>
                  <th className="px-3 py-2 text-left font-semibold">Date</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-3 text-muted-foreground text-center">
                      No feedback found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((f) => (
                    <tr key={f.feedback_id} className="border-t">
                      <td className="px-3 py-2 font-medium">
                        {f.rating
                          ? RATING_OPTIONS.find((opt) => opt.value === f.rating)?.label || f.rating
                          : "-"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {f.comment || <span className="text-xs text-muted-foreground">No comment</span>}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {f.contact_name || f.contact_phone || "Unknown"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {f.created_at ? new Date(f.created_at).toLocaleString() : "-"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

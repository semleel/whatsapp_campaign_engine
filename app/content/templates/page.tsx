"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import QueryAnnouncement from "@/components/QueryAnnouncement";
import { Api } from "@/lib/client";
import { usePrivilege } from "@/lib/permissions";

type TemplateSummary = {
  contentid: number;
  title: string;
  type: string | null;
  status: string | null;
  lang?: string | null;
  category: string | null;
  updatedat?: string | null;
  createdat?: string | null;
  expiresat?: string | null;
  mediaurl?: string | null;
  isdeleted?: boolean | null;
};

type ButtonItem = {
  id?: string | number;
  type?: "visit_website" | "call_phone" | "quick_reply" | string;
  label?: string;
};

type TemplateWithPreview = TemplateSummary & {
  body?: string | null;
  description?: string | null;
  placeholders?: Record<string, unknown> | null;
  footerText?: string | null;
  headerType?: "none" | "text" | "media" | null;
  headerText?: string | null;
  headerMediaType?: "image" | "video" | "document" | string | null;
  buttons?: ButtonItem[];
};

const STATUS_OPTIONS = ["All", "Draft", "Active", "Archived", "approved"];
const PAGE_SIZE_OPTIONS = [8, 12, 20];

export default function TemplateLibraryPage() {
  const [items, setItems] = useState<TemplateWithPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");

  // pagination
  const [pageSize, setPageSize] = useState<number>(12);
  const [page, setPage] = useState<number>(1);

  // view mode toggle
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const { canView, canCreate, canUpdate, loading: privLoading } = usePrivilege("content");

  useEffect(() => {
    const load = async () => {
      try {
        if (privLoading) return;
        if (!canView) {
          setError("You do not have permission to view templates.");
          setLoading(false);
          return;
        }
        setLoading(true);
        setError(null);

        // includeDeleted=true so we can show Archived
        const rawSummaries: TemplateSummary[] = await Api.listTemplates({
          includeDeleted: true,
        });

        const summaries = rawSummaries.map((item) => ({
          contentid: item.contentid,
          title: item.title || `Template ${item.contentid}`,
          type: item.type || "message",
          status: item.status || "Draft",
          category: item.category ?? null,
          lang: (item as any).lang ?? (item as any).defaultlang ?? "",
          updatedat: item.updatedat ?? (item as any).lastupdated ?? null,
          createdat: item.createdat ?? null,
          expiresat: item.expiresat ?? null,
          mediaurl: item.mediaurl ?? null,
          isdeleted: item.isdeleted ?? null,
        }));

        // fetch extra fields for preview
        const detailed: TemplateWithPreview[] = await Promise.all(
          summaries.map(async (t) => {
            try {
              const data = await Api.getTemplate(t.contentid);

              const placeholders =
                (data.placeholders as Record<string, unknown> | null) || null;
              const headerType =
                data.headerType ??
                (placeholders?.headerType as TemplateWithPreview["headerType"]) ??
                (data.mediaurl ? ("media" as const) : ("none" as const));
              const headerText =
                data.headerText ??
                (placeholders?.headerText as string | null) ??
                null;
              const headerMediaType =
                data.headerMediaType ??
                (placeholders?.headerMediaType as string | null) ??
                "image";
              const buttons =
                data.buttons ??
                ((placeholders?.buttons as ButtonItem[] | undefined) ?? []);
              const footerText =
                data.footertext ??
                (placeholders?.footerText as string | null) ??
                null;

              const isdeleted: boolean | null =
                data.isdeleted ?? t.isdeleted ?? null;

              return {
                ...t,
                title: data.title ?? t.title,
                type: data.type ?? t.type,
                // show "Archived" in UI if soft-deleted
                status: isdeleted ? "Archived" : data.status ?? t.status,
                category: data.category ?? t.category ?? null,
                lang: data.lang ?? data.defaultlang ?? t.lang ?? "",
                description: data.description ?? null,
                body: data.body ?? data.description ?? null,
                mediaurl: data.mediaurl ?? t.mediaurl ?? null,
                updatedat: data.updatedat ?? data.lastupdated ?? t.updatedat,
                createdat: data.createdat ?? t.createdat,
                expiresat: data.expiresat ?? t.expiresat,
                placeholders,
                footerText,
                headerType,
                headerText,
                headerMediaType,
                buttons,
                isdeleted,
              };
            } catch (err) {
              console.error("Template detail fetch failed:", err);
              return { ...t };
            }
          })
        );

        setItems(detailed);
      } catch (e: any) {
        setError(e?.message || "Failed to load templates");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [canView, privLoading]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => {
      if (i.category && i.category.trim()) set.add(i.category);
    });
    return Array.from(set);
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((t) => {
      const matchesSearch =
        !search.trim() ||
        t.title.toLowerCase().includes(search.toLowerCase()) ||
        (t.category || "").toLowerCase().includes(search.toLowerCase());

      // status logic respects soft delete
      let matchesStatus = true;
      const statusNorm = (t.status || "").toLowerCase();
      const filterNorm = statusFilter.toLowerCase();

      if (statusFilter === "All") {
        matchesStatus = !t.isdeleted; // hide archived from "All"
      } else if (statusFilter === "Archived") {
        matchesStatus = !!t.isdeleted; // only archived
      } else {
        matchesStatus = !t.isdeleted && statusNorm === filterNorm;
      }

      const matchesCategory =
        categoryFilter === "All" ||
        (t.category || "").toLowerCase() === categoryFilter.toLowerCase();

      return matchesSearch && matchesStatus && matchesCategory;
    });
  }, [items, search, statusFilter, categoryFilter]);

  // reset page when filter/search/pageSize change
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, categoryFilter, pageSize]);

  const totalItems = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(page, totalPages);

  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const pageItems = filteredItems.slice(startIndex, endIndex);

  const renderStatusPill = (t: TemplateWithPreview) => {
    const normalized = t.isdeleted
      ? "archived"
      : (t.status || "").toLowerCase();

    let styles =
      "bg-slate-100 text-slate-700 border border-slate-200 text-xs rounded-full px-2 py-0.5";
    if (normalized === "active") {
      styles =
        "bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs rounded-full px-2 py-0.5";
    } else if (normalized === "draft") {
      styles =
        "bg-amber-100 text-amber-700 border border-amber-200 text-xs rounded-full px-2 py-0.5";
    } else if (normalized === "archived") {
      styles =
        "bg-slate-200 text-slate-700 border border-slate-300 text-xs rounded-full px-2 py-0.5";
    } else if (normalized === "approved") {
      styles =
        "bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs rounded-full px-2 py-0.5";
    }

    const label = t.isdeleted ? "Archived" : t.status || "Unknown";
    return <span className={styles}>{label}</span>;
  };

  const formatUpdated = (item: TemplateWithPreview) => {
    const ts = item.updatedat || item.createdat;
    if (!ts) return "-";
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return ts;
    }
  };

  if (!privLoading && !canView) {
    return (
      <div className="p-6 text-sm text-amber-700 border border-amber-200 bg-amber-50 rounded-lg">
        You do not have permission to view templates.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Loading templates...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-sm text-destructive">
        Error loading templates: {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <QueryAnnouncement />
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Template Library</h3>
          <p className="text-sm text-muted-foreground">
            Track approval status, ownership, and multilingual coverage for
            every WhatsApp asset.
          </p>
        </div>
        {canCreate && (
          <Link
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90"
            href="/content/templates/create"
          >
            New Template
          </Link>
        )}
      </div>

      {/* Filters + view toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* left: filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <input
            type="text"
            placeholder="Search title or category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-xs rounded-md border px-3 py-2 text-sm"
          />

          <select
            className="rounded-md border px-3 py-2 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                Status: {s}
              </option>
            ))}
          </select>

          <select
            className="rounded-md border px-3 py-2 text-sm"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="All">Category: All</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                Category: {c}
              </option>
            ))}
          </select>

          <select
            className="rounded-md border px-3 py-2 text-sm"
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size} per page
              </option>
            ))}
          </select>
        </div>

        {/* right: view toggle */}
        <div className="flex items-center gap-1 rounded-md border bg-card p-1 text-xs">
          <button
            type="button"
            onClick={() => setViewMode("grid")}
            className={`px-3 py-1 rounded-md ${
              viewMode === "grid"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            Grid
          </button>
          <button
            type="button"
            onClick={() => setViewMode("table")}
            className={`px-3 py-1 rounded-md ${
              viewMode === "table"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            Table
          </button>
        </div>
      </div>

      {totalItems === 0 ? (
        <p className="text-sm text-muted-foreground pt-4">
          No templates found. Try changing your filters or create a new
          template.
        </p>
      ) : (
        <>
          {/* Main content: grid OR table */}
          {viewMode === "grid" ? (
            /* GRID VIEW */
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 pt-2">
              {pageItems.map((t) => {
                const bodyText =
                  (t.body || t.description || "").trim() ||
                  "Body text here. Message body and personalization notes.";

                const bodyLines = bodyText.split("\n");
                const shortBody =
                  bodyLines.length > 3
                    ? bodyLines.slice(0, 3).join("\n") + "..."
                    : bodyText;

                return (
                  <Link
                    key={t.contentid}
                    href={`/content/templates/${t.contentid}`}
                    className="group block"
                  >
                    <article className="h-full rounded-2xl border bg-card p-3 shadow-sm hover:shadow-md transition-shadow flex flex-col">
                      {/* top info */}
                      <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <div className="flex flex-col">
                          <span className="font-medium text-xs text-foreground">
                            {t.title}
                          </span>
                          <span className="text-[11px]">
                            {t.category || "Uncategorized"}
                          </span>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {renderStatusPill(t)}
                          <span className="text-[10px]">
                            {(t.lang || "-").toString().toUpperCase()} •{" "}
                            {t.type || ""}
                          </span>
                        </div>
                      </div>

                      {/* WhatsApp-style preview */}
                      <div className="flex-1 rounded-xl border bg-muted/40 p-3">
                        {t.headerType === "media" && t.mediaurl && (
                          <div className="mb-2 overflow-hidden rounded-md bg-background">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={t.mediaurl}
                              alt="Header"
                              className="block w-full max-h-32 object-cover"
                            />
                          </div>
                        )}

                        {t.headerType === "text" && t.headerText && (
                          <p className="mb-1 text-[11px] font-semibold">
                            {t.headerText}
                          </p>
                        )}

                        <div className="rounded-lg bg-background px-3 py-2 text-[11px] leading-relaxed shadow-sm">
                          {shortBody.split("\n").map((line, idx) => (
                            <p key={idx}>{line}</p>
                          ))}
                        </div>

                        {t.footerText && (
                          <p className="mt-2 text-[10px] text-muted-foreground">
                            {t.footerText}
                          </p>
                        )}

                        {t.buttons && t.buttons.length > 0 && (
                          <div className="mt-2 border-t pt-2 space-y-1">
                            {t.buttons.map((btn, i) => (
                              <button
                                key={btn.id ?? i}
                                type="button"
                                className="w-full rounded-full border bg-background px-3 py-1.5 text-[11px] font-medium text-primary"
                              >
                                {btn.label || "Button"}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* bottom meta */}
                      <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>ID {t.contentid}</span>
                        <span>{formatUpdated(t)}</span>
                      </div>
                    </article>
                  </Link>
                );
              })}
            </div>
          ) : (
            /* TABLE VIEW */
            <div className="rounded-xl border overflow-x-auto bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">ID</th>
                    <th className="px-3 py-2 text-left font-medium">Title</th>
                    <th className="px-3 py-2 text-left font-medium">Type</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2 text-left font-medium">
                      Language
                    </th>
                    <th className="px-3 py-2 text-left font-medium">
                      Category
                    </th>
                    <th className="px-3 py-2 text-left font-medium">
                      Updated
                    </th>
                    <th className="px-3 py-2 text-left font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((t) => (
                    <tr key={t.contentid} className="border-t">
                      <td className="px-3 py-2 text-muted-foreground">
                        {t.contentid}
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/content/templates/${t.contentid}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {t.title}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground capitalize">
                        {t.type}
                      </td>
                      <td className="px-3 py-2">
                        {renderStatusPill(t)}
                      </td>
                      <td className="px-3 py-2 uppercase">
                        {t.lang || "-"}
                      </td>
                      <td className="px-3 py-2">{t.category || "-"}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {formatUpdated(t)}
                      </td>
                      <td className="px-3 py-2 text-sm">
                        {canUpdate ? (
                          <Link
                            href={`/content/templates/${t.contentid}`}
                            className="text-primary hover:underline"
                          >
                            Edit
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">View only</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* pagination footer */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>
              Showing{" "}
              <span className="font-medium">
                {startIndex + 1}-{endIndex}
              </span>{" "}
              of <span className="font-medium">{totalItems}</span> templates
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-md border px-2 py-1 disabled:opacity-40"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>

              <span>
                Page{" "}
                <span className="font-medium">
                  {currentPage}/{totalPages}
                </span>
              </span>

              <button
                type="button"
                className="rounded-md border px-2 py-1 disabled:opacity-40"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

"use client";

import type React from "react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import QueryAnnouncement from "@/components/QueryAnnouncement";
import { Api } from "@/lib/client";
import { usePrivilege } from "@/lib/permissions";
import type { TemplateDetail, TemplateListItem } from "@/lib/types";

type TemplateSummary = TemplateListItem & {
  lang?: string | null;
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
  tags?: string[];
  interactiveType?: "buttons" | "menu";
  menu?: TemplateMenu | null;
};

type TemplateInteractiveType = "buttons" | "menu";

type TemplateMenuOption = {
  id: string;
  title: string;
  description?: string;
};

type TemplateMenuSection = {
  id: string;
  title?: string;
  options: TemplateMenuOption[];
};

type TemplateMenu = {
  buttonLabel: string;
  sections: TemplateMenuSection[];
};

const STATUS_OPTIONS = ["All", "Active", "Archived"];
const PAGE_SIZE_OPTIONS = [8, 12, 20];

const INLINE_FORMATTERS = [
  {
    regex: /\*\*(.+?)\*\*/g,
    wrap: (content: string, key: string) => <strong key={key}>{content}</strong>,
  },
  {
    regex: /\*(.+?)\*/g,
    wrap: (content: string, key: string) => <em key={key}>{content}</em>,
  },
  {
    regex: /~~(.+?)~~/g,
    wrap: (content: string, key: string) => <s key={key}>{content}</s>,
  },
  {
    regex: /`([^`]+)`/g,
    wrap: (content: string, key: string) => (
      <code key={key} className="bg-muted px-1 rounded text-[11px]">
        {content}
      </code>
    ),
  },
];

const normalizeStatus = (status?: string | null) => {
  const value = (status || "").trim();
  if (!value) return "Active";
  const lower = value.toLowerCase();
  if (lower === "archived") return "Archived";
  if (lower === "draft" || lower === "approved") return "Active";
  return value;
};

function ensureMenu(existing: any): TemplateMenu | null {
  if (!existing) return null;

  const normalizeOption = (opt: any): TemplateMenuOption => ({
    id: opt?.id || Math.random().toString(36).slice(2, 10),
    title: (opt?.title || "").toString(),
    description: (opt?.description || "").toString(),
  });

  const normalizeSections = (sections?: any[]): TemplateMenuSection[] =>
    (sections || []).map((sec) => ({
      id: sec?.id || Math.random().toString(36).slice(2, 10),
      title: sec?.title || "",
      options: Array.isArray(sec?.options)
        ? sec.options.map((opt: any) => normalizeOption(opt))
        : [],
    }));

  const legacyOptions = Array.isArray((existing as any)?.options)
    ? (existing.options as any[]).map((opt) => normalizeOption(opt))
    : [];

  let sections = normalizeSections(existing.sections);

  if (!sections.length && legacyOptions.length) {
    sections = [
      {
        id: Math.random().toString(36).slice(2, 10),
        title: "",
        options: legacyOptions,
      },
    ];
  }

  if (!sections.length) return null;

  return {
    buttonLabel: (existing.buttonLabel || "Main Menu").toString(),
    sections,
  };
}

function formatWhatsAppLine(line: string, keyPrefix: string) {
  let segments: React.ReactNode[] = [line];

  INLINE_FORMATTERS.forEach((fmt, fmtIdx) => {
    const next: React.ReactNode[] = [];

    segments.forEach((seg, segIdx) => {
      if (typeof seg !== "string") {
        next.push(seg);
        return;
      }

      const regex = new RegExp(fmt.regex.source, fmt.regex.flags);
      let lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = regex.exec(seg)) !== null) {
        if (match.index > lastIndex) {
          next.push(seg.slice(lastIndex, match.index));
        }

        next.push(fmt.wrap(match[1], `${keyPrefix}-${fmtIdx}-${segIdx}-${next.length}`));
        lastIndex = match.index + match[0].length;
      }

      if (lastIndex < seg.length) {
        next.push(seg.slice(lastIndex));
      }
    });

    segments = next;
  });

  return segments;
}

function renderFormattedLines(text: string, placeholder: string) {
  const lines = text ? text.split("\n") : [placeholder];

  return lines.map((line, idx) => {
    const content = line ? formatWhatsAppLine(line, `line-${idx}`) : [placeholder];
    return <p key={`line-${idx}`}>{content}</p>;
  });
}

export default function TemplateLibraryPage() {
  const [items, setItems] = useState<TemplateWithPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const [tagFilter, setTagFilter] = useState<string>("All");

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

        const rawSummaries: TemplateSummary[] = await Api.listTemplates(true);

        const summaries = rawSummaries.map((item) => ({
          contentid: item.contentid,
          title: item.title || `Template ${item.contentid}`,
          type: item.type || "message",
          status: normalizeStatus(item.status),
          category: item.category ?? null,
          lang: item.lang ?? item.defaultlang ?? "",
          defaultlang: item.defaultlang ?? "",
          currentversion: item.currentversion ?? null,
          updatedat: item.updatedat ?? item.lastupdated ?? null,
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
              const headerTypeRaw =
                (data.headerType as TemplateWithPreview["headerType"]) ??
                (placeholders?.headerType as TemplateWithPreview["headerType"]) ??
                null;
              const headerType: TemplateWithPreview["headerType"] =
                headerTypeRaw === "text" || headerTypeRaw === "media"
                  ? headerTypeRaw
                  : data.mediaurl
                  ? "media"
                  : "none";
              const headerText =
                data.headerText ??
                (placeholders?.headerText as string | null) ??
                null;
              const headerMediaType =
                data.headerMediaType ??
                (placeholders?.headerMediaType as string | null) ??
                "image";
              const interactiveType: TemplateInteractiveType =
                data.interactiveType === "menu" || placeholders?.menu
                  ? "menu"
                  : "buttons";
              const menu =
                interactiveType === "menu"
                  ? ensureMenu((data as any).menu ?? placeholders?.menu)
                  : null;
              const buttons: ButtonItem[] =
                interactiveType === "buttons"
                  ? (data.buttons as ButtonItem[] | undefined) ??
                    ((placeholders?.buttons as ButtonItem[] | undefined) ?? [])
                  : [];
              const footerText =
                data.footertext ??
                (placeholders?.footerText as string | null) ??
                null;
              const tags = (data as TemplateDetail).tags ?? [];

              const isdeleted: boolean | null =
                data.isdeleted ?? t.isdeleted ?? null;

              return {
                ...t,
                title: data.title ?? t.title,
                type: data.type ?? t.type,
                // show "Archived" in UI if soft-deleted
                status: isdeleted
                  ? "Archived"
                  : normalizeStatus(data.status ?? t.status),
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
                interactiveType,
                menu,
                isdeleted,
                tags,
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

  const tagOptions = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => {
      (i.tags || []).forEach((tag) => {
        if (tag && tag.trim()) set.add(tag);
      });
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((t) => {
      const matchesSearch =
        !search.trim() ||
        t.title.toLowerCase().includes(search.toLowerCase()) ||
        (t.category || "").toLowerCase().includes(search.toLowerCase());

      // status logic respects soft delete
      let matchesStatus = true;
      const statusNorm = (t.status || "").trim().toLowerCase();
      const filterNorm = statusFilter.trim().toLowerCase();
      const isArchived = !!t.isdeleted || statusNorm === "archived";

      if (statusFilter === "All") {
        matchesStatus = !isArchived; // hide archived from "All"
      } else if (statusFilter === "Archived") {
        matchesStatus = isArchived; // include soft-deleted or status=Archived
      } else {
        matchesStatus = !isArchived && statusNorm === filterNorm;
      }

      const matchesCategory =
        categoryFilter === "All" ||
        (t.category || "").toLowerCase() === categoryFilter.toLowerCase();

      const hasTag = (t.tags || []).some(
        (tg) => tg.toLowerCase() === tagFilter.toLowerCase()
      );
      const matchesTag = tagFilter === "All" || hasTag;

      return matchesSearch && matchesStatus && matchesCategory && matchesTag;
    });
  }, [items, search, statusFilter, categoryFilter, tagFilter]);

  // reset page when filter/search/pageSize change
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, categoryFilter, tagFilter, pageSize]);

  const totalItems = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(page, totalPages);

  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const pageItems = filteredItems.slice(startIndex, endIndex);

  const renderStatusPill = (t: TemplateWithPreview) => {
    const statusNorm = (t.status || "").trim().toLowerCase();
    const isArchived = !!t.isdeleted || statusNorm === "archived";
    const normalized = isArchived ? "archived" : statusNorm;

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
    }
    const label = isArchived ? "Archived" : t.status || "Unknown";
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
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
          >
            <option value="All">Tag: All</option>
            {tagOptions.map((tag) => (
              <option key={tag} value={tag}>
                Tag: {tag}
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
                          {renderFormattedLines(
                            shortBody,
                            "Body text here. Message body and personalization notes."
                          )}
                        </div>

                        {t.footerText && (
                          <p className="mt-2 text-[10px] text-muted-foreground">
                            {t.footerText}
                          </p>
                        )}

                        {t.interactiveType === "buttons" && t.buttons && t.buttons.length > 0 && (
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

                        {t.interactiveType === "menu" && t.menu && (
                          <div className="mt-2 border-t pt-2 space-y-1">
                            <button
                              type="button"
                              className="w-full rounded-full border bg-background px-3 py-1.5 text-[11px] font-medium text-primary text-center"
                            >
                              {t.menu.buttonLabel || "Main Menu"}
                            </button>
                          </div>
                        )}
                      </div>

                      {t.interactiveType === "menu" && t.menu && t.menu.sections.length > 0 && (
                        <div className="mt-2 rounded-md border bg-muted/30 p-2 text-[11px] space-y-2">
                          {t.menu.sections.map((section, sIdx) => (
                            <div
                              key={section.id}
                              className="space-y-1 border-b last:border-b-0 border-slate-200/70 pb-1 last:pb-0"
                            >
                              <div className="font-semibold text-[10px] uppercase tracking-wide text-slate-700">
                                {(section.title || "").trim() || `Section ${sIdx + 1}`}
                              </div>
                              {section.options.length === 0 ? (
                                <div className="text-[10px] text-muted-foreground">
                                  No options in this section.
                                </div>
                              ) : (
                                section.options.map((opt, oIdx) => (
                                  <div key={opt.id} className="flex items-start gap-2">
                                    <span>-</span>
                                    <span>
                                      {(opt.title || `Option ${oIdx + 1}`).toString()}
                                      {opt.description ? ` - ${opt.description}` : ""}
                                    </span>
                                  </div>
                                ))
                              )}
                            </div>
                          ))}
                        </div>
                      )}

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

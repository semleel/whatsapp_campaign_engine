import React from "react";
import { formatBodyLines } from "@/lib/whatsappFormatter";

export type PreviewButton =
  | { type: "quick_reply"; label: string }
  | { type: "visit_website"; label: string; url: string | undefined }
  | { type: "call_phone"; label: string; phone: string | undefined };

export type PreviewData = {
  title?: string;
  body?: string;
  footerText?: string;
  templateName?: string;
  mediaUrl?: string | null;
  mediaType?: "image" | "video" | "document" | "none";
  buttons?: PreviewButton[];
  interactiveType?: "buttons" | "list" | null;
  menuSections?: {
    id: string;
    title?: string;
    options: string[];
  }[];
  timestamp?: string;
};

const BACKGROUND_PATTERN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23f2efe9'/%3E%3Cg fill='none' stroke='%23e0d2c0' stroke-width='2'%3E%3Cpath d='M50 0v100M0 50h100'/%3E%3Cpath d='M10 90c5-6 20-16 40-6s40 5 50 0'%3E%3C/path%3E%3Cpath d='M10 10c5 6 20 16 40 6s40-5 50 0'%3E%3C/path%3E%3C/g%3E%3C/svg%3E\")";

const mediaTypeFromUrl = (
  url?: string | null,
  explicit?: PreviewData["mediaType"]
): PreviewData["mediaType"] => {
  if (explicit && explicit !== "none") return explicit;
  if (!url) return "none";
  const normalized = url.toLowerCase();

  if (/\.(mp4|mov|webm)(\?.*)?$/i.test(normalized)) return "video";

  if (
    /\.(pdf|docx?|xlsx?|pptx?)(\?.*)?$/i.test(normalized) ||
    /(?:^|[/?&])[a-z0-9\-_]+(?:\.|%2[eE])(?:pdf|docx?|xlsx?|pptx?)(?:$|[?&])/i.test(
      normalized
    )
  ) {
    return "document";
  }

  if (
    /\.(jpe?g|png|gif|webp)(\?.*)?$/i.test(normalized) ||
    /gstatic\.com|googleusercontent\.com/i.test(normalized) ||
    /imgix\.net|images\.amazon\.com|cdn\.instagram\.com|pbs\.twimg\.com/i.test(
      normalized
    )
  ) {
    return "image";
  }

  return "image";
};

const TemplatePreviewPanel: React.FC<{ preview: PreviewData }> = ({ preview }) => {
  const hasButtons = (preview.buttons || []).length > 0;
  const resolvedMediaType = mediaTypeFromUrl(preview.mediaUrl, preview.mediaType);
  const timestamp =
    preview.timestamp ||
    new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  const templateName =
    preview.templateName || preview.footerText || "template_preview";

  return (
    <div
      className="mx-auto max-w-[320px] rounded-[28px] border border-slate-200/80 bg-[#efe8dc] p-6 shadow-[0_15px_35px_rgba(15,23,42,0.25)]"
      style={{
        backgroundImage: BACKGROUND_PATTERN,
        backgroundSize: "140px 140px",
      }}
    >
      <div className="relative rounded-2xl bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.25)]">
        <span className="pointer-events-none absolute -left-3 top-8 h-5 w-5 rotate-45 rounded-br-full bg-white" />
        {preview.mediaUrl && resolvedMediaType !== "none" && (
          <div className="mb-4 overflow-hidden rounded-xl border border-slate-100 bg-slate-50/70 text-slate-600">
            {resolvedMediaType === "image" && (
              <img
                src={preview.mediaUrl}
                alt="Media preview"
                className="block h-auto max-h-[260px] w-full object-contain"
                onError={(event) => {
                  (event.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            )}
            {resolvedMediaType === "video" && (
              <video
                className="block h-auto max-h-[260px] w-full object-contain"
                controls
                muted
                playsInline
                preload="metadata"
                src={preview.mediaUrl || undefined}
              />
            )}
            {resolvedMediaType === "document" && (
              <div className="flex flex-col gap-1 px-3 py-2">
                <p className="text-[13px] font-semibold text-slate-700">
                  Document
                </p>
                <p className="text-[11px] text-sky-600 underline">
                  {preview.mediaUrl}
                </p>
              </div>
            )}
          </div>
        )}
        {preview.title && (
          <div className="text-base font-semibold text-slate-900">
            {preview.title}
          </div>
        )}
        <div className="mt-3 space-y-2">{formatBodyLines(preview.body)}</div>
        <div className="mt-4 flex justify-end text-[11px] text-slate-500">
          {timestamp}
        </div>
        {hasButtons && (
          <div className="mt-3 space-y-2">
            {(preview.buttons || []).map((btn, idx) => (
              <div
                key={`preview-btn-${idx}`}
                className="rounded-[12px] border border-slate-200 bg-white py-2 text-sm font-semibold text-sky-500 shadow-sm"
              >
                <span className="block text-center">{btn.label}</span>
              </div>
            ))}
          </div>
        )}
        {preview.interactiveType === "list" &&
          preview.menuSections &&
          preview.menuSections.length > 0 && (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white py-3 shadow-inner">
              {preview.menuSections.map((section) => (
                <div
                  key={section.id}
                  className="flex flex-col gap-2 px-4 py-2 text-sm leading-relaxed text-slate-700"
                >
                  {section.title && (
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                      {section.title}
                    </div>
                  )}
                  <div className="space-y-2">
                    {section.options.map((label, idx) => (
                      <div
                        key={`${section.id}-opt-${idx}`}
                        className="flex items-center justify-between rounded-[12px] border border-transparent px-2 py-1"
                      >
                        <span>{label}</span>
                        <span className="h-4 w-4 rounded-full border border-slate-300" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white/80 px-4 py-2 text-[11px] font-medium text-slate-500">
        {templateName}
      </div>
    </div>
  );
};

export default TemplatePreviewPanel;

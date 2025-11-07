import Link from "next/link";

export default function ContentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Content Engine</h2>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Manage reusable WhatsApp templates, guardrail validator logic, and multilingual fallbacks so every campaign
            response stays on-brand and personalized.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/content/templates/create"
            className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90"
          >
            New Template
          </Link>
          <Link
            href="/content/templates"
            className="inline-flex items-center rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Library
          </Link>
        </div>
      </div>
      {children}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";

type LocaleVariant = {
  template: string;
  languages: Record<string, string | null>;
};

const seedTemplates: LocaleVariant[] = [
  {
    template: "voucher_reminder",
    languages: { en: "Hi {{name}}! Your voucher expires soon.", my: "Hai {{name}}! Baucar anda hampir tamat.", cn: null },
  },
  {
    template: "order_update",
    languages: { en: "Your order {{orderId}} is on the way.", my: "Pesanan {{orderId}} sedang dihantar.", cn: "您的订单{{orderId}}正在配送中。" },
  },
];

const supportedLocales = ["en", "my", "cn"];

export default function MultilingualPage() {
  const [templates, setTemplates] = useState(seedTemplates);
  const [fallbackLocale, setFallbackLocale] = useState("en");
  const [newLocale, setNewLocale] = useState({ template: "voucher_reminder", locale: "id", copy: "" });

  const missingCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    supportedLocales.forEach((locale) => {
      counts[locale] = templates.filter((tpl) => !tpl.languages[locale]).length;
    });
    return counts;
  }, [templates]);

  const addLocale = () => {
    if (!newLocale.copy.trim()) return;
    setTemplates((prev) =>
      prev.map((tpl) =>
        tpl.template === newLocale.template
          ? { ...tpl, languages: { ...tpl.languages, [newLocale.locale]: newLocale.copy } }
          : tpl
      )
    );
    setNewLocale({ ...newLocale, copy: "" });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Multilingual & Fallback Handler</h3>
          <p className="text-sm text-muted-foreground">
            Ensure every user receives the right language copy, with graceful fallback when a translation is missing.
          </p>
        </div>
        <div className="text-sm text-muted-foreground">
          Fallback language:
          <select
            className="ml-2 rounded-md border px-2 py-1 text-sm"
            value={fallbackLocale}
            onChange={(e) => setFallbackLocale(e.target.value)}
          >
            {supportedLocales.map((locale) => (
              <option key={locale} value={locale}>
                {locale.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
      </div>

      <section className="rounded-xl border p-5 space-y-4">
        <div>
          <h4 className="text-base font-semibold">Add / update locale variant</h4>
          <p className="text-sm text-muted-foreground">Stored variants are used automatically by the template renderer.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1 text-sm font-medium">
            <span>Template</span>
            <select
              className="w-full rounded-md border px-3 py-2 text-sm"
              value={newLocale.template}
              onChange={(e) => setNewLocale({ ...newLocale, template: e.target.value })}
            >
              {templates.map((tpl) => (
                <option key={tpl.template} value={tpl.template}>
                  {tpl.template}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium">
            <span>Locale</span>
            <select
              className="w-full rounded-md border px-3 py-2 text-sm uppercase"
              value={newLocale.locale}
              onChange={(e) => setNewLocale({ ...newLocale, locale: e.target.value })}
            >
              {supportedLocales.map((locale) => (
                <option key={locale} value={locale}>
                  {locale.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium md:col-span-1">
            <span>&nbsp;</span>
            <button
              onClick={addLocale}
              className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90"
            >
              Save variant
            </button>
          </label>
        </div>
        <textarea
          className="w-full rounded-md border px-3 py-2 text-sm"
          placeholder="Enter localized copy"
          value={newLocale.copy}
          onChange={(e) => setNewLocale({ ...newLocale, copy: e.target.value })}
        />
      </section>

      <section className="rounded-xl border p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h4 className="text-base font-semibold">Coverage matrix</h4>
            <p className="text-sm text-muted-foreground">Track which templates still need translations.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            {supportedLocales.map((locale) => (
              <span key={locale}>
                {locale.toUpperCase()}: {missingCounts[locale] ?? 0} missing
              </span>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Template</th>
                {supportedLocales.map((locale) => (
                  <th key={locale} className="px-3 py-2 text-left font-medium uppercase">
                    {locale}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {templates.map((tpl) => (
                <tr key={tpl.template} className="border-t">
                  <td className="px-3 py-2 font-medium">{tpl.template}</td>
                  {supportedLocales.map((locale) => {
                    const copy = tpl.languages[locale];
                    return (
                      <td key={locale} className="px-3 py-2">
                        {copy ? (
                          <span className="text-muted-foreground">{copy.slice(0, 50)}...</span>
                        ) : (
                          <span className="text-xs text-rose-500">Missing (fallback → {fallbackLocale.toUpperCase()})</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

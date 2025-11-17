"use client";

import { useEffect, useState } from "react";
import { Api } from "@/lib/client";
import type { WhatsAppConfig } from "@/lib/types";

const emptyConfig: WhatsAppConfig = {
  display_name: "",
  phone_number: "",
  phone_number_id: "",
  waba_id: "",
  verify_token: "",
  api_version: "v18.0",
  is_active: true,
};

export default function WhatsAppConfigPage() {
  const [config, setConfig] = useState<WhatsAppConfig>(emptyConfig);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await Api.getWhatsAppConfig();
        if (mounted && data) setConfig({ ...emptyConfig, ...data });
      } catch (err: any) {
        setMessage(err?.message || "Failed to load config");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("Saving...");
    try {
      const updated = await Api.updateWhatsAppConfig(config);
      setConfig(updated);
      setMessage("Configuration saved.");
    } catch (err: any) {
      setMessage(err?.message || "Failed to save config");
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading WhatsApp config...</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">WhatsApp configuration</h3>
        <p className="text-sm text-muted-foreground">Backed by the <code>whatsapp_config</code> table.</p>
      </div>

      <form onSubmit={handleSubmit} className="rounded-xl border p-5 space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm font-medium">
            <span>Display name</span>
            <input
              className="w-full rounded-md border px-3 py-2"
              value={config.display_name || ""}
              onChange={(e) => setConfig((prev) => ({ ...prev, display_name: e.target.value }))}
            />
          </label>
          <label className="space-y-1 text-sm font-medium">
            <span>Phone number</span>
            <input
              className="w-full rounded-md border px-3 py-2"
              value={config.phone_number}
              onChange={(e) => setConfig((prev) => ({ ...prev, phone_number: e.target.value }))}
              required
            />
          </label>
          <label className="space-y-1 text-sm font-medium">
            <span>Phone number ID</span>
            <input
              className="w-full rounded-md border px-3 py-2"
              value={config.phone_number_id}
              onChange={(e) => setConfig((prev) => ({ ...prev, phone_number_id: e.target.value }))}
              required
            />
          </label>
          <label className="space-y-1 text-sm font-medium">
            <span>WABA ID</span>
            <input
              className="w-full rounded-md border px-3 py-2"
              value={config.waba_id || ""}
              onChange={(e) => setConfig((prev) => ({ ...prev, waba_id: e.target.value }))}
            />
          </label>
          <label className="space-y-1 text-sm font-medium">
            <span>Verify token</span>
            <input
              className="w-full rounded-md border px-3 py-2 font-mono text-xs"
              value={config.verify_token}
              onChange={(e) => setConfig((prev) => ({ ...prev, verify_token: e.target.value }))}
              required
            />
          </label>
          <label className="space-y-1 text-sm font-medium">
            <span>API version</span>
            <input
              className="w-full rounded-md border px-3 py-2"
              value={config.api_version}
              onChange={(e) => setConfig((prev) => ({ ...prev, api_version: e.target.value }))}
            />
          </label>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={Boolean(config.is_active)}
              onChange={(e) => setConfig((prev) => ({ ...prev, is_active: e.target.checked }))}
            />
            Integration active
          </label>
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Save config
          </button>
        </div>
      </form>

      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}

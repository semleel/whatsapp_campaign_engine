"use client";

import { useEffect, useState } from "react";
import { Api } from "@/lib/client";
import type { WhatsAppConfig } from "@/lib/types";
import { usePrivilege } from "@/lib/permissions";
import { showPrivilegeDenied } from "@/lib/showAlert";

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
  const { canView, canUpdate, loading: privLoading } = usePrivilege("system");
  const [config, setConfig] = useState<WhatsAppConfig>(emptyConfig);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (privLoading) return;
        if (!canView) {
          setMessage("You do not have permission to view WhatsApp config.");
          setLoading(false);
          return;
        }
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
  }, [canView, privLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canUpdate) {
      await showPrivilegeDenied({ action: "update WhatsApp config", resource: "System" });
      setMessage("You do not have permission to update WhatsApp config.");
      return;
    }
    setMessage("Saving...");
    try {
      const updated = await Api.updateWhatsAppConfig(config);
      setConfig(updated);
      setMessage("Configuration saved.");
    } catch (err: any) {
      setMessage(err?.message || "Failed to save config");
    }
  };

  if (!privLoading && !canView) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
        You do not have permission to view WhatsApp config.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">WhatsApp Config</h3>
        <p className="text-sm text-muted-foreground">Backed by whatsapp_config table.</p>
      </div>

      {message && (
        <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-700">
          {message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="rounded-xl border p-5 space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Display name</span>
            <input
              className="w-full rounded-md border px-3 py-2"
              value={config.display_name ?? ""}
              onChange={(e) => setConfig((c) => ({ ...c, display_name: e.target.value }))}
              disabled={loading || !canUpdate}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Phone number</span>
            <input
              className="w-full rounded-md border px-3 py-2"
              value={config.phone_number ?? ""}
              onChange={(e) => setConfig((c) => ({ ...c, phone_number: e.target.value }))}
              disabled={loading || !canUpdate}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Phone number ID</span>
            <input
              className="w-full rounded-md border px-3 py-2"
              value={config.phone_number_id ?? ""}
              onChange={(e) => setConfig((c) => ({ ...c, phone_number_id: e.target.value }))}
              disabled={loading || !canUpdate}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">WABA ID</span>
            <input
              className="w-full rounded-md border px-3 py-2"
              value={config.waba_id ?? ""}
              onChange={(e) => setConfig((c) => ({ ...c, waba_id: e.target.value }))}
              disabled={loading || !canUpdate}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Verify token</span>
            <input
              className="w-full rounded-md border px-3 py-2"
              value={config.verify_token ?? ""}
              onChange={(e) => setConfig((c) => ({ ...c, verify_token: e.target.value }))}
              disabled={loading || !canUpdate}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">API version</span>
            <input
              className="w-full rounded-md border px-3 py-2"
              value={config.api_version ?? ""}
              onChange={(e) => setConfig((c) => ({ ...c, api_version: e.target.value }))}
              disabled={loading || !canUpdate}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!config.is_active}
              onChange={(e) => setConfig((c) => ({ ...c, is_active: e.target.checked }))}
              disabled={loading || !canUpdate}
            />
            <span>Active</span>
          </label>
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          disabled={loading || !canUpdate}
        >
          Save config
        </button>
      </form>
    </div>
  );
}

 "use client";

import { useEffect, useState } from "react";
import { getStoredAdmin } from "@/lib/auth";
import { getPrivilegeFlags } from "@/lib/permissions";

export default function Home() {
  const [canCreateCampaign, setCanCreateCampaign] = useState(false);
  const [canUpdateCampaign, setCanUpdateCampaign] = useState(false);
  const [canCreateContent, setCanCreateContent] = useState(false);
  const [canUpdateContent, setCanUpdateContent] = useState(false);
  const [canCreateIntegration, setCanCreateIntegration] = useState(false);

  useEffect(() => {
    const admin = getStoredAdmin();
    const campaign = getPrivilegeFlags(admin?.id ?? null, "campaigns");
    const content = getPrivilegeFlags(admin?.id ?? null, "content");
    const integration = getPrivilegeFlags(admin?.id ?? null, "integration");

    setCanCreateCampaign(campaign.create);
    setCanUpdateCampaign(campaign.update || campaign.archive);
    setCanCreateContent(content.create);
    setCanUpdateContent(content.update || content.archive);
    setCanCreateIntegration(integration.create);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold tracking-tight">Overview</h2>
        <div className="flex gap-2">
          <button className="btn btn-ghost">Export</button>
          {canCreateCampaign && (
            <button className="btn btn-primary">Create Campaign</button>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="card card-hover p-4">
          <div className="pill mb-2">Active</div>
          <div className="text-3xl font-semibold">8</div>
          <div className="mt-1 text-sm text-muted-foreground">Campaigns running</div>
        </div>
        <div className="card card-hover p-4">
          <div className="pill mb-2">Engagement</div>
          <div className="text-3xl font-semibold">2.4k</div>
          <div className="mt-1 text-sm text-muted-foreground">Msgs last 24h</div>
        </div>
        <div className="card card-hover p-4">
          <div className="pill mb-2">Delivery</div>
          <div className="text-3xl font-semibold">98.2%</div>
          <div className="mt-1 text-sm text-muted-foreground">Success rate</div>
        </div>
        <div className="card card-hover p-4">
          <div className="pill mb-2">Opt-in</div>
          <div className="text-3xl font-semibold">63%</div>
          <div className="mt-1 text-sm text-muted-foreground">Join keyword</div>
        </div>
      </div>

      {/* Two-up layout */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card card-hover p-4">
          <h3 className="text-sm font-medium mb-3">Recent Messages</h3>
          <ul className="space-y-2">
            {["JOIN", "help", "CNY", "promo"].map((m, i) => (
              <li key={i} className="flex items-center justify-between rounded-md bg-secondary px-3 py-2">
                <span className="text-sm">{m}</span>
                <span className="pill">now</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="card card-hover p-4">
          <h3 className="text-sm font-medium mb-3">Campaign Progress</h3>
          <div className="space-y-3">
            {[
              { name: "CNY Lucky Draw", pct: 72 },
              { name: "Onboarding Flow", pct: 54 },
              { name: "Feedback NPS", pct: 31 },
            ].map((row) => (
              <div key={row.name}>
                <div className="flex items-center justify-between">
                  <div className="text-sm">{row.name}</div>
                  <div className="text-xs text-muted-foreground">{row.pct}%</div>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${row.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Palette / actions */}
        <div className="card card-hover p-4 md:col-span-2">
          <div className="mb-3 font-semibold">Quick Actions</div>
          <div className="flex flex-wrap gap-2">
            {canCreateContent && <button className="btn btn-primary">New Template</button>}
            {canUpdateContent && <button className="btn btn-ghost">Validate Content</button>}
            {canCreateCampaign && (
              <button className="btn btn-ghost">Schedule Campaign</button>
            )}
            {canCreateIntegration && <button className="btn btn-ghost">Live API Test</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

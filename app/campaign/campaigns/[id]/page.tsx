"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

interface Region {
  regionid: string;
  regionname: string;
}

interface UserFlow {
  userflowid: string;
  userflowname: string;
}

interface CampaignStatus {
  camstatusid: string | number;
  currentstatus: string;
}

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [form, setForm] = useState({
    campaignName: "",
    objective: "",
    targetRegionID: "",
    userFlowID: "",
    camStatusID: "",
  });
  const [regions, setRegions] = useState<Region[]>([]);
  const [flows, setFlows] = useState<UserFlow[]>([]);
  const [statuses, setStatuses] = useState<CampaignStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const [regionRes, flowRes, statusRes, campaignRes] = await Promise.all([
          fetch("http://localhost:3000/api/reference/regions"),
          fetch("http://localhost:3000/api/reference/userflows"),
          fetch("http://localhost:3000/api/reference/campaignstatus"),
          fetch(`http://localhost:3000/api/campaign/${id}`),
        ]);
        const [regionData, flowData, statusData, campaignData] = await Promise.all([
          regionRes.json(),
          flowRes.json(),
          statusRes.json(),
          campaignRes.json(),
        ]);

        setRegions(regionData);
        setFlows(flowData);
        setStatuses(statusData);

        setForm({
          campaignName: campaignData.campaignname || "",
          objective: campaignData.objective || "",
          targetRegionID: campaignData.targetregionid?.toString() || "",
          userFlowID: campaignData.userflowid?.toString() || "",
          camStatusID: campaignData.camstatusid?.toString() || "",
        });
      } catch (err) {
        console.error(err);
        setMessage("Unable to load campaign data.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("Saving...");
    try {
      const res = await fetch(`http://localhost:3000/api/campaign/update/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Update failed");
      setMessage("Campaign updated successfully.");
      setTimeout(() => router.push("/campaign/campaigns"), 1200);
    } catch (err) {
      console.error(err);
      setMessage("Failed to update campaign.");
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading campaign...</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Edit Campaign</h3>
          <p className="text-sm text-muted-foreground">
            Update targeting, flow mapping, or status before sending it back to the scheduling queue.
          </p>
        </div>
        <Link href="/campaign/campaigns" className="text-sm font-medium text-primary hover:underline">
          Back to list
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="rounded-xl border bg-card p-6 space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm font-medium">
            <span>Campaign name</span>
            <input
              type="text"
              name="campaignName"
              value={form.campaignName}
              onChange={handleChange}
              className="w-full rounded-md border px-3 py-2"
            />
          </label>
          <label className="space-y-1 text-sm font-medium">
            <span>Objective</span>
            <input
              type="text"
              name="objective"
              value={form.objective}
              onChange={handleChange}
              className="w-full rounded-md border px-3 py-2"
            />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
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
                <option key={region.regionid} value={region.regionid}>
                  {region.regionname}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium">
            <span>User flow</span>
            <select
              name="userFlowID"
              value={form.userFlowID}
              onChange={handleChange}
              className="w-full rounded-md border px-3 py-2"
            >
              <option value="">Select flow</option>
              {flows.map((flow) => (
                <option key={flow.userflowid} value={flow.userflowid}>
                  {flow.userflowname}
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
                <option key={status.camstatusid} value={status.camstatusid}>
                  {status.currentstatus}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <Link href="/campaign/campaigns" className="text-sm font-medium text-muted-foreground hover:text-foreground">
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

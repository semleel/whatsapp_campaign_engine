"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, RefreshCcw, Pencil } from "lucide-react";
import { Api } from "@/lib/client";
import type {
  FlowListItem,
  FlowStatus,
  SystemFlowActivationRef,
} from "@/lib/types";
import { useRouter } from "next/navigation";

type FlowBucket = {
  start: FlowListItem[];
  campaign: FlowListItem[];
  end: FlowListItem[];
};

const categorizeFlows = (flows: FlowListItem[]): FlowBucket => {
  const bucket: FlowBucket = { start: [], campaign: [], end: [] };
  flows.forEach((flow) => {
    const type = (flow.flowType || "CAMPAIGN").toUpperCase();
    if (type === "START") bucket.start.push(flow);
    else if (type === "END") bucket.end.push(flow);
    else bucket.campaign.push(flow);
  });
  return bucket;
};

const FLOW_STATUS_OPTIONS: FlowStatus[] = ["Active", "Draft"];

const FlowStatusBadge = ({ status }: { status: FlowStatus }) => (
  <span
    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
      status === "Active" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700"
    }`}
  >
    {status}
  </span>
);

const FlowRadioRow = ({
  flow,
  checked,
  onChange,
}: {
  flow: FlowListItem;
  checked: boolean;
  onChange: () => void;
}) => (
  <label
    className={`flex items-center gap-3 rounded-2xl border px-3 py-3 cursor-pointer transition ${checked
      ? "border-[#43b899] bg-[#f3fbf7]"
      : "border-[#e0e0e7] hover:border-[#cacad7]"
      }`}
  >
    <span
      className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${checked ? "border-[#43b899]" : "border-[#c5c5cf]"
        }`}
    >
      <span
        className={`h-2 w-2 rounded-full ${checked ? "bg-[#43b899]" : "bg-transparent"
          }`}
      />
    </span>
    <div className="flex-1">
      <p className="text-sm font-semibold text-[#3e3e55]">
        {flow.userflowname}
      </p>
      <p className="text-xs text-[#8e8e9e]">
        {flow.status} -&gt; {flow.nodeCount} nodes
      </p>
    </div>
    <FlowStatusBadge status={flow.status} />
    <input
      type="radio"
      className="sr-only"
      checked={checked}
      onChange={onChange}
    />
  </label>
);

export default function SystemFlowHubPage() {
  const router = useRouter();
  const [flows, setFlows] = useState<FlowListItem[]>([]);
  const [activeStart, setActiveStart] =
    useState<SystemFlowActivationRef | null>(null);
  const [activeEnd, setActiveEnd] =
    useState<SystemFlowActivationRef | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingStart, setSavingStart] = useState(false);
  const [savingEnd, setSavingEnd] = useState(false);
  const [editingStart, setEditingStart] = useState(false);
  const [editingEnd, setEditingEnd] = useState(false);
  const [startCandidate, setStartCandidate] = useState("");
  const [endCandidate, setEndCandidate] = useState("");
  const [updatingStatusId, setUpdatingStatusId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleAuthError = (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err || "");
    if (msg.toLowerCase().includes("invalid or expired token")) {
      setError("Session expired. Please sign in again.");
      router.push("/auth/login");
      return true;
    }
    return false;
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const [flowData, startData, endData] = await Promise.all([
        Api.listFlows(),
        Api.getActiveSystemStartFlow(),
        Api.getActiveSystemEndFlow(),
      ]);
      setFlows(flowData || []);
      setActiveStart(startData || null);
      setActiveEnd(endData || null);
    } catch (err) {
      if (!handleAuthError(err)) {
        setError(
          err instanceof Error ? err.message : "Failed to load flow data."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    setStartCandidate(
      activeStart?.userflowid ? String(activeStart.userflowid) : ""
    );
  }, [activeStart]);

  useEffect(() => {
    setEndCandidate(activeEnd?.userflowid ? String(activeEnd.userflowid) : "");
  }, [activeEnd]);

  const buckets = useMemo(() => categorizeFlows(flows), [flows]);

  const activeStartName =
    flows.find((f) => f.userflowid === activeStart?.userflowid)
      ?.userflowname || "None";
  const activeEndName =
    flows.find((f) => f.userflowid === activeEnd?.userflowid)?.userflowname ||
    "None";

  const handleSetStart = async () => {
    if (!startCandidate || startCandidate === String(activeStart?.userflowid)) {
      return;
    }
    setSavingStart(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await Api.setActiveSystemStartFlow(Number(startCandidate));
      setActiveStart(updated);
      setEditingStart(false);
      setMessage("START flow updated successfully.");
    } catch (err) {
      if (!handleAuthError(err)) {
        setError(
          err instanceof Error ? err.message : "Failed to update START flow."
        );
      }
    } finally {
      setSavingStart(false);
    }
  };

  const handleSetEnd = async () => {
    if (!endCandidate || endCandidate === String(activeEnd?.userflowid)) {
      return;
    }
    setSavingEnd(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await Api.setActiveSystemEndFlow(Number(endCandidate));
      setActiveEnd(updated);
      setEditingEnd(false);
      setMessage("END flow updated successfully.");
    } catch (err) {
      if (!handleAuthError(err)) {
        setError(
          err instanceof Error ? err.message : "Failed to update END flow."
        );
      }
    } finally {
      setSavingEnd(false);
    }
  };

  const handleCampaignStatusChange = async (
    flowId: number,
    nextStatus: FlowStatus
  ) => {
    setUpdatingStatusId(flowId);
    setError(null);
    setMessage(null);
    const targetName =
      flows.find((flow) => flow.userflowid === flowId)?.userflowname ||
      `#${flowId}`;
    try {
      await Api.updateFlowStatus(flowId, nextStatus);
      setFlows((prev) =>
        prev.map((flow) =>
          flow.userflowid === flowId ? { ...flow, status: nextStatus } : flow
        )
      );
      setMessage(`Flow "${targetName}" marked as ${nextStatus}.`);
    } catch (err) {
      if (!handleAuthError(err)) {
        setError(
          err instanceof Error ? err.message : "Failed to update flow status."
        );
      }
    } finally {
      setUpdatingStatusId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-full flex items-center justify-center bg-[#f8f8f8]">
        <Loader2 className="animate-spin text-[#43b899]" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#f8f8f8] text-[#3e3e55] font-sans">
      <div className="max-w-6xl mx-auto p-8 space-y-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold">System Flow Board</h1>
            <p className="text-sm text-[#8e8e9e] mt-1">
              Visualize how sessions transition from START -&gt; CAMPAIGN -&gt; END.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={loadData}
              className="px-3 py-2 rounded bg-white border border-[#e0e0e7] text-sm flex items-center gap-2 hover:bg-[#f0f0f0]"
            >
              <RefreshCcw size={16} /> Refresh
            </button>
            <Link
              href="/flows"
              className="px-3 py-2 rounded bg-white border border-[#e0e0e7] text-sm hover:bg-[#f0f0f0]"
            >
              Back to Flow Hub
            </Link>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-[#ffe6e6] border border-[#d95e5e] text-[#cc3d3d] text-sm rounded">
            {error}
          </div>
        )}
        {message && (
          <div className="p-3 bg-[#e7f6ef] border border-[#a6e1c4] text-[#1d7b55] text-sm rounded">
            {message}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* START Column */}
          <section className="rounded-[28px] border border-[#cfe5da] bg-white p-6 shadow-sm flex flex-col gap-5">
              <header className="flex flex-col gap-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#63c59e]">
                  STEP 01 -&gt; START
                </p>
                <h2 className="text-xl font-bold">Initial greeting flow</h2>
                <p className="text-xs text-[#8e8e9e]">
                  Only one START flow can be on duty. It handles every new conversation.
                </p>
              </header>
              <div className="rounded-2xl border border-[#e0e0e7] bg-[#f7fdf9] px-4 py-3 flex items-center justify-between gap-4 text-sm">
                <div>
                  <p className="text-xs uppercase text-[#8e8e9e]">Active Start</p>
                  <p className="font-semibold">{activeStartName}</p>
                </div>
                <button
                  onClick={() => {
                    setEditingStart((prev) => !prev);
                    setStartCandidate(
                      activeStart?.userflowid
                        ? String(activeStart.userflowid)
                        : ""
                    );
                  }}
                  className="inline-flex items-center gap-1 rounded-full border border-[#43b899] px-3 py-1 text-xs font-semibold text-[#43b899] hover:bg-[#43b899] hover:text-white transition"
                >
                  <Pencil size={14} />
                  {editingStart ? "Close" : "Edit"}
                </button>
              </div>

              {editingStart && (
                <div className="space-y-3">
                  {buckets.start.length ? (
                    buckets.start.map((flow) => (
                      <FlowRadioRow
                        key={flow.userflowid}
                        flow={flow}
                        checked={startCandidate === String(flow.userflowid)}
                        onChange={() => setStartCandidate(String(flow.userflowid))}
                      />
                    ))
                  ) : (
                    <p className="text-xs text-[#8e8e9e] border border-dashed border-[#e0e0e7] rounded-2xl px-3 py-2">
                      No START-category flows yet. Create one from the User Flows page.
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => {
                        setEditingStart(false);
                        setStartCandidate(
                          activeStart?.userflowid
                            ? String(activeStart.userflowid)
                            : ""
                        );
                      }}
                      className="flex-1 rounded-full border border-[#e0e0e7] px-4 py-2 text-xs font-semibold text-[#6d6d82] hover:bg-[#f8f8f8]"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSetStart}
                      disabled={
                        savingStart ||
                        !startCandidate ||
                        startCandidate === String(activeStart?.userflowid)
                      }
                      className="flex-1 rounded-full bg-[#43b899] px-4 py-2 text-xs font-bold text-white hover:bg-[#309270] disabled:opacity-60"
                    >
                      {savingStart ? (
                        <span className="inline-flex items-center gap-1">
                          <Loader2 size={14} className="animate-spin" /> Saving...
                        </span>
                      ) : (
                        "Set Active START Flow"
                      )}
                    </button>
                  </div>
                </div>
              )}
            </section>
          {/* CAMPAIGN Column */}
          <section className="rounded-[28px] border border-[#d9def3] bg-white p-6 shadow-sm flex flex-col gap-5">
              <header className="flex flex-col gap-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#6a7edc]">
                  STEP 02 -&gt; CAMPAIGN
                </p>
                <h2 className="text-xl font-bold">Journeys in progress</h2>
                <p className="text-xs text-[#8e8e9e]">
                  Toggle availability by switching a flow between Active/Draft.
                </p>
              </header>

              {buckets.campaign.length ? (
                <div className="space-y-3">
                  {buckets.campaign.map((flow) => (
                    <div
                      key={flow.userflowid}
                      className="rounded-2xl border border-[#e0e0e7] px-4 py-3 flex flex-col gap-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-sm text-[#1f1f2c]">
                            {flow.userflowname}
                          </p>
                          {flow.description && (
                            <p className="text-xs text-[#8e8e9e]">
                              {flow.description}
                            </p>
                          )}
                          <p className="text-[11px] text-[#8e8e9e] mt-1">
                            {flow.nodeCount} nodes -&gt; Updated{" "}
                            {flow.updatedAt
                              ? new Date(flow.updatedAt).toLocaleDateString()
                              : "recently"}
                          </p>
                        </div>
                        <FlowStatusBadge status={flow.status} />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold uppercase text-[#8e8e9e]">
                          Flow availability
                        </label>
                        <select
                          className="mt-1 w-full rounded-xl border border-[#e0e0e7] bg-white p-2 text-sm"
                          value={flow.status}
                          disabled={updatingStatusId === flow.userflowid}
                          onChange={(e) =>
                            handleCampaignStatusChange(
                              flow.userflowid,
                              e.target.value as FlowStatus
                            )
                          }
                        >
                          {FLOW_STATUS_OPTIONS.map((status) => (
                            <option key={status} value={status}>
                              {status === "Active"
                                ? "Active (usable in automations)"
                                : "Draft (hidden from menus)"}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[#8e8e9e] border border-dashed border-[#e0e0e7] rounded-2xl px-3 py-2">
                  No CAMPAIGN-category flows yet. Convert existing flows or create
                  new ones from the User Flows page.
                </p>
              )}
            </section>
          {/* END Column */}
          <section className="rounded-[28px] border border-[#f3d9e9] bg-white p-6 shadow-sm flex flex-col gap-5">
              <header className="flex flex-col gap-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#c65c9c]">
                  STEP 03 -&gt; END
                </p>
                <h2 className="text-xl font-bold">Wrap-up experience</h2>
                <p className="text-xs text-[#8e8e9e]">
                  Pick which END flow closes every conversation gracefully.
                </p>
              </header>
              <div className="rounded-2xl border border-[#e0e0e7] bg-[#fff6fb] px-4 py-3 flex items-center justify-between gap-4 text-sm">
                <div>
                  <p className="text-xs uppercase text-[#8e8e9e]">Active End</p>
                  <p className="font-semibold">{activeEndName}</p>
                </div>
                <button
                  onClick={() => {
                    setEditingEnd((prev) => !prev);
                    setEndCandidate(
                      activeEnd?.userflowid ? String(activeEnd.userflowid) : ""
                    );
                  }}
                  className="inline-flex items-center gap-1 rounded-full border border-[#c65c9c] px-3 py-1 text-xs font-semibold text-[#c65c9c] hover:bg-[#c65c9c] hover:text-white transition"
                >
                  <Pencil size={14} />
                  {editingEnd ? "Close" : "Edit"}
                </button>
              </div>

              {editingEnd && (
                <div className="space-y-3">
                  {buckets.end.length ? (
                    buckets.end.map((flow) => (
                      <FlowRadioRow
                        key={flow.userflowid}
                        flow={flow}
                        checked={endCandidate === String(flow.userflowid)}
                        onChange={() => setEndCandidate(String(flow.userflowid))}
                      />
                    ))
                  ) : (
                    <p className="text-xs text-[#8e8e9e] border border-dashed border-[#e0e0e7] rounded-2xl px-3 py-2">
                      No END-category flows yet. Create one from the User Flows page.
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => {
                        setEditingEnd(false);
                        setEndCandidate(
                          activeEnd?.userflowid ? String(activeEnd.userflowid) : ""
                        );
                      }}
                      className="flex-1 rounded-full border border-[#e0e0e7] px-4 py-2 text-xs font-semibold text-[#6d6d82] hover:bg-[#f8f8f8]"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSetEnd}
                      disabled={
                        savingEnd ||
                        !endCandidate ||
                        endCandidate === String(activeEnd?.userflowid)
                      }
                      className="flex-1 rounded-full bg-[#c65c9c] px-4 py-2 text-xs font-bold text-white hover:bg-[#a83f7f] disabled:opacity-60"
                    >
                      {savingEnd ? (
                        <span className="inline-flex items-center gap-1">
                          <Loader2 size={14} className="animate-spin" /> Saving...
                        </span>
                      ) : (
                        "Set Active END Flow"
                      )}
                    </button>
                  </div>
                </div>
              )}
            </section>
        </div>
      </div>
    </div>
  );
}


// app/flows/user/page.tsx

"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Api } from "@/lib/client";
import { FlowListItem } from "@/lib/types";
import { Plus, Loader2, GitFork, Clock, ArrowLeft } from "lucide-react";
import { showCenteredAlert } from "@/lib/showAlert";

export default function UserFlowListPage() {
  const [flows, setFlows] = useState<FlowListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Api.listFlows()
      .then(setFlows)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const message = sessionStorage.getItem("flow-hub-message");
    if (message) {
      sessionStorage.removeItem("flow-hub-message");
      showCenteredAlert(message);
    }
  }, []);

  if (loading)
    return (
      <div className="p-10 flex justify-center">
        <Loader2 className="animate-spin text-[#43b899]" />
      </div>
    );

  return (
    <div className="min-h-full bg-[#f8f8f8] text-[#3e3e55] font-sans">
      <div className="max-w-6xl mx-auto p-8">
        <div className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-2xl font-bold">Automation Flows</h1>
            <p className="text-[#8e8e9e] text-sm mt-1">
              Manage your WhatsApp conversational logic.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/flows"
              className="px-4 py-2 rounded-md border border-[#e0e0e7] bg-white text-sm flex items-center gap-2 font-semibold hover:bg-[#f0f0f0] transition"
            >
              <ArrowLeft size={16} />
              Back to Flow Hub
            </Link>
            <Link
              href="/flows/user/create"
              className="bg-[#43b899] hover:bg-[#058563] text-white px-5 py-2.5 rounded-md flex items-center gap-2 font-bold text-sm shadow-sm transition"
            >
              <Plus size={18} />
              Create New Flow
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {flows.map((flow) => (
            <Link
              key={flow.userflowid}
              href={`/flows/user/${flow.userflowid}`}
              className="block bg-white border border-[#e0e0e7] rounded-lg p-6 hover:shadow-md hover:border-[#c5c5cf] transition group"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-[#e3f3ef] text-[#16a37d] rounded-lg group-hover:bg-[#43b899] group-hover:text-white transition">
                  <GitFork size={24} />
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span
                    className={`px-2 py-1 text-[10px] uppercase font-bold rounded ${
                      flow.status === "Active"
                        ? "bg-green-100 text-green-800"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {flow.status || "DRAFT"}
                  </span>
                  <span className="px-2 py-0.5 text-[10px] uppercase font-semibold rounded bg-[#f1f1f4] text-[#5b5b6d]">
                    {flow.flowType || "CAMPAIGN"}
                  </span>
                </div>
              </div>

              <h3 className="text-lg font-bold mb-2">{flow.userflowname}</h3>
              <p className="text-sm text-[#8e8e9e] h-10 line-clamp-2">
                {flow.description || "No description provided."}
              </p>

              <div className="mt-6 pt-4 border-t border-[#f8f8f8] flex items-center text-xs text-[#aaaab6]">
                <Clock size={14} className="mr-1" />
                <span>
                  {flow.updatedAt
                    ? new Date(flow.updatedAt).toLocaleDateString()
                    : "Recently"}
                </span>
                <span className="mx-2">-</span>
                <span>{flow.nodeCount} actions</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

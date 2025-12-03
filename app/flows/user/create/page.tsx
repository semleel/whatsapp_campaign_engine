// app/flows/user/create/page.tsx
"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Api } from "@/lib/client";
import type { FlowType } from "@/lib/types";
import type { Node } from "reactflow";
import { Loader2, ArrowLeft } from "lucide-react";

type AttachmentType = "none" | "image" | "video" | "audio" | "document";
type InteractiveType = "none" | "buttons" | "list";

type FlowNodeData = {
  id?: string;
  label: string | null;
  body: string;
  nodeType: "message" | "template" | "decision" | "jump" | "api" | "fallback";

  allowedInputs?: string[];
  fallback?: string | null;
  ui_metadata?: any;

  attachmentType?: AttachmentType;
  attachmentUrl?: string;

  interactiveType?: InteractiveType;
  buttons?: string[];
  listOptions?: string[];

  decisionRules?: any[];
  elseKey?: string | null;

  endpointId?: number | null;
  apiSuccessKey?: string | null;
  apiErrorKey?: string | null;

  waitTimeoutMin?: number | null;
  templateId?: number | null;
  jumpNextKey?: string | null;
};

export default function CreateFlowPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [flowType, setFlowType] = useState<FlowType>("CAMPAIGN");

  const seedGlobalFallbackNode = (): Node<FlowNodeData> => ({
    id: "GLOBAL_FALLBACK",
    type: "custom",
    data: {
      id: "GLOBAL_FALLBACK",
      label: null,
      nodeType: "fallback",
      body: "Sorry, I didn't understand that. Please try again.",
      allowedInputs: [],
      fallback: null,
      ui_metadata: { title: "Global fallback" },
      attachmentType: "none",
      attachmentUrl: "",
      interactiveType: "none",
      buttons: [],
      listOptions: [],
      decisionRules: [],
      elseKey: null,
      endpointId: null,
      apiSuccessKey: null,
      apiErrorKey: null,
      waitTimeoutMin: null,
      templateId: null,
      jumpNextKey: null,
    },
    // fixed top position
    position: { x: 200, y: 40 },
    // cannot be dragged
    draggable: false,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name) return;

    setLoading(true);
    setError("");

    try {
      const initialKey = "START";

      const startNode: Node<FlowNodeData> = {
        id: initialKey,
        type: "custom",
        data: {
          label: null,
          nodeType: "message",
          body: "Welcome! How can we help you today?",
          allowedInputs: [],
          fallback: null,
          attachmentType: "none",
          attachmentUrl: "",
          interactiveType: "none",
          buttons: [],
          listOptions: [],
          decisionRules: [],
          elseKey: null,
          endpointId: null,
          apiSuccessKey: null,
          apiErrorKey: null,
          waitTimeoutMin: null,
          templateId: null,
          jumpNextKey: null,
        },
        position: { x: 200, y: 200 },
      };

      const fallbackNode = seedGlobalFallbackNode();

      const toPayloadNode = (node: Node<FlowNodeData>) => ({
        key: node.id,
        type: node.data.nodeType === "fallback" ? "message" : node.data.nodeType,
        body: node.data.body || "",
        allowedInputs: node.data.allowedInputs || [],
        fallbackKey: node.data.fallback || null,
        ui_metadata: node.data.ui_metadata || {},
        attachmentType: node.data.attachmentType || "none",
        attachmentUrl: node.data.attachmentUrl || "",
        interactiveType: node.data.interactiveType || "none",
        buttons: node.data.buttons || [],
        listOptions: node.data.listOptions || [],
        decisionRules: node.data.decisionRules || [],
        elseKey: node.data.elseKey || null,
        endpointId: node.data.endpointId || null,
        apiSuccessKey: node.data.apiSuccessKey || null,
        apiErrorKey: node.data.apiErrorKey || null,
        waitTimeoutMin: node.data.waitTimeoutMin ?? null,
        templateId: node.data.templateId ?? null,
        jumpNextKey: node.data.jumpNextKey ?? null,
        ui: { x: node.position.x, y: node.position.y },
      });

      const nodesPayload = [startNode, fallbackNode].map(toPayloadNode);

      const res = await Api.createFlowDefinition({
        userflowname: name,
        description,
        entryKey: initialKey,
        fallbackKey: "GLOBAL_FALLBACK",
        flowType,
        nodes: nodesPayload,
        edges: [],
        fallbackEdges: [],
      });

      router.push(`/flows/user/${res.userflow.userflowid}`);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to create flow");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-full bg-[#f8f8f8] flex flex-col justify-center items-center p-6 font-sans text-[#3e3e55]">
      <div className="w-full max-w-md bg-white rounded-lg shadow-md border border-[#e0e0e7] p-8">
        <Link
          href="/flows/user"
          className="inline-flex items-center gap-1 text-sm text-[#8e8e9e] hover:text-[#3e3e55] mb-6 transition-colors"
        >
          <ArrowLeft size={16} /> Back to flows
        </Link>

        <h2 className="text-2xl font-bold mb-6 text-[#3e3e55]">
          Create New Flow
        </h2>

        {error && (
          <div className="mb-4 p-3 bg-[#ffe6e6] border border-[#d95e5e] text-[#cc3d3d] text-sm rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-5">
            <label className="block text-sm font-bold text-[#8e8e9e] uppercase mb-2">
              Flow Name <span className="text-[#d95e5e]">*</span>
            </label>
            <input
              type="text"
              required
              className="w-full p-3 border border-[#e0e0e7] rounded bg-[#f8f8f8] text-sm text-[#3e3e55] focus:outline-none focus:ring-2 focus:ring-[#43b899] transition-all"
              placeholder="e.g. Welcome Series"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="mb-5">
            <label className="block text-sm font-bold text-[#8e8e9e] uppercase mb-2">
              Flow Category
            </label>
            <select
              className="w-full p-3 border border-[#e0e0e7] rounded bg-[#f8f8f8] text-sm text-[#3e3e55] focus:outline-none focus:ring-2 focus:ring-[#43b899]"
              value={flowType}
              onChange={(e) => setFlowType(e.target.value as FlowType)}
            >
              <option value="START">START (default entry flow)</option>
              <option value="CAMPAIGN">CAMPAIGN (mid-journey)</option>
              <option value="END">END (wrap-up)</option>
            </select>
            <p className="text-xs text-[#8e8e9e] mt-1">
              Only one START and one END flow can be active system-wide. Choose CAMPAIGN for additional journeys.
            </p>
          </div>

          <div className="mb-8">
            <label className="block text-sm font-bold text-[#8e8e9e] uppercase mb-2">
              Description
            </label>
            <textarea
              className="w-full p-3 border border-[#e0e0e7] rounded bg-[#f8f8f8] text-sm text-[#3e3e55] focus:outline-none focus:ring-2 focus:ring-[#43b899] transition-all min-h-[100px] resize-none"
              placeholder="What is the goal of this automation?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !name}
            className="w-full flex justify-center items-center gap-2 bg-[#43b899] hover:bg-[#058563] text-white font-bold py-3 px-4 rounded-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading && <Loader2 className="animate-spin" size={18} />}
            Create & Open Builder
          </button>
        </form>
      </div>
    </div>
  );
}

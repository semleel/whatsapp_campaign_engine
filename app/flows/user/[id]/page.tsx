// app/flows/user/[id]/page.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import ReactFlow, {
    addEdge,
    Controls,
    Connection,
    Edge,
    Node,
    useNodesState,
    useEdgesState,
    MarkerType,
    ReactFlowProvider,
} from "reactflow";
import "reactflow/dist/style.css";
import { Api } from "@/lib/client";
import { FlowDefinition, EndpointConfig, TemplateListItem } from "@/lib/types";
import { Loader2, Save, Plus, ArrowLeft, X, Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import CallbellNode from "@/components/flow/CallbellNode";
import { getLayoutedElements } from "@/lib/flow-layout";

const nodeTypes = { custom: CallbellNode };
const DEFAULT_GLOBAL_FALLBACK = "Sorry, I didn't understand that. Please try again.";

const isPlaceholderNode = (node: Node<FlowNodeData>) =>
    Boolean(node?.data?.isPlaceholder) || String(node?.id || "").startsWith("placeholder-");

const isPlaceholderNodeId = (id?: string | number | null) =>
    id ? String(id).startsWith("placeholder-") : false;

type FlowEdgeData = {
    edgeKind?: "fallback" | "branch";
};

type AttachmentType = "none" | "image" | "video" | "audio" | "document";
type InteractiveType = "none" | "buttons" | "list";

// decision rules
type DecisionOp = "eq" | "neq" | "contains" | "gt" | "gte" | "lt" | "lte";
type DecisionRule = {
    id: string;
    left: string;
    op: DecisionOp;
    right: string;
    nextKey: string;
};

type FlowNodeData = {
    id?: string;
    label: string | null;
    body: string;
    nodeType: "message" | "template" | "decision" | "jump" | "api" | "placeholder" | "fallback";

    ui_metadata?: any;
    isPlaceholder?: boolean;
    isStart?: boolean;
    parentId?: string;

    allowedInputs?: string[];
    fallback?: string | null;

    attachmentType?: AttachmentType;
    attachmentUrl?: string;

    interactiveType?: InteractiveType;
    buttons?: string[];
    listOptions?: string[];

    decisionRules?: DecisionRule[];
    elseKey?: string | null;

    endpointId?: number | null;
    apiSuccessKey?: string | null;
    apiErrorKey?: string | null;

    waitTimeoutMin?: number | null;
    templateId?: number | null;
    jumpNextKey?: string | null;
};

const seedGlobalFallbackNode = (): Node<FlowNodeData> => ({
    id: "GLOBAL_FALLBACK",
    type: "custom",
    data: {
        id: "GLOBAL_FALLBACK",
        label: null,
        nodeType: "fallback",
        body: DEFAULT_GLOBAL_FALLBACK,
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

export default function FlowBuilderPage() {
    return (
        <ReactFlowProvider>
            <FlowBuilderCanvas />
        </ReactFlowProvider>
    );
}

function FlowBuilderCanvas() {
    const { id } = useParams();
    const router = useRouter();
    const flowId = Number(id);

    const [nodes, setNodes, onNodesChange] = useNodesState<FlowNodeData>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge<FlowEdgeData>[]);

    const [flowData, setFlowData] = useState<FlowDefinition | null>(null);
    const [flowName, setFlowName] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [actionPickerOpen, setActionPickerOpen] = useState(false);
    const [pendingParentId, setPendingParentId] = useState<string | null>(null);

    const [selectedNode, setSelectedNode] = useState<Node<FlowNodeData> | null>(null);

    // endpoints for API step
    const [endpoints, setEndpoints] = useState<EndpointConfig[]>([]);
    const [templates, setTemplates] = useState<TemplateListItem[]>([]);

    // Flow settings modal
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [draftEntryKey, setDraftEntryKey] = useState<string | null>(null);
    const [globalFallbackText, setGlobalFallbackText] = useState(DEFAULT_GLOBAL_FALLBACK);

    // load endpoints once
    useEffect(() => {
        (async () => {
            try {
                const eps = await Api.listEndpoints();
                setEndpoints(eps || []);
            } catch (e) {
                console.warn("Failed to load endpoints", e);
            }
        })();
    }, []);

    useEffect(() => {
        (async () => {
            try {
                const tpl = await Api.listTemplates();
                setTemplates(tpl || []);
            } catch (e) {
                console.warn("Failed to load templates", e);
            }
        })();
    }, []);

    // -------- Helpers --------
    const allNodeIds = useMemo(
        () => nodes.filter((n) => !isPlaceholderNode(n)).map((n) => String(n.id)),
        [nodes]
    );

    const fallbackOptionsForSelected = useMemo(() => {
        if (!selectedNode) return allNodeIds;
        return allNodeIds.filter((id) => id !== selectedNode.id);
    }, [allNodeIds, selectedNode]);

    const currentEntryKey = useMemo(
        () => flowData?.entryKey || draftEntryKey || null,
        [flowData?.entryKey, draftEntryKey]
    );

    const defaultEdgeOptions = useMemo(
        () => ({
            type: "step" as const,
            style: { stroke: "#94a3b8", strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8" },
        }),
        []
    );

    // 1) Load Flow
    useEffect(() => {
        if (!flowId) return;

        async function fetchFlow() {
            try {
                const apiData = await Api.getFlowDefinition(flowId);
                const data = { ...apiData, fallbackKey: "GLOBAL_FALLBACK" };
                setFlowData(data);
                setFlowName(data.name || "");

                // hydrate modal drafts
                setDraftEntryKey(data.entryKey || null);

                const gfNode = data.nodes.find((n: any) => n.key === "GLOBAL_FALLBACK");
                const initialFallbackText =
                    gfNode?.body || DEFAULT_GLOBAL_FALLBACK;
                setGlobalFallbackText(initialFallbackText);

                const initialNodes: Node<FlowNodeData>[] = data.nodes.map((n: any) => {
                    const uiTitle = n.ui_metadata?.title || null;
                    const rawType =
                        n.type === "wait_input"
                            ? "message"
                            : n.type === "question"
                                ? "message"
                                : n.type || "message";
                    const resolvedNodeType =
                        n.key === "GLOBAL_FALLBACK" || n.ui_metadata?.kind === "fallback"
                            ? "fallback"
                            : rawType;
                    const isStart = data.entryKey
                        ? String(data.entryKey) === String(n.key)
                        : false;

                    return {
                        id: String(n.key),
                        type: "custom",
                        data: {
                            id: String(n.key),
                            label: uiTitle || null,
                            body:
                                n.key === "GLOBAL_FALLBACK"
                                    ? initialFallbackText
                                    : n.body ?? n.description ?? "",
                            nodeType: resolvedNodeType as FlowNodeData["nodeType"],
                            allowedInputs: n.allowedInputs || [],
                            fallback: n.fallback || null,
                            ui_metadata: n.ui_metadata ?? null,
                            isPlaceholder: false,
                            isStart,

                            attachmentType: (n.attachmentType ?? "none") as AttachmentType,
                            attachmentUrl: n.attachmentUrl ?? "",
                            interactiveType: (n.interactiveType ?? "none") as InteractiveType,
                            buttons: n.buttons ?? [],
                            listOptions: n.listOptions ?? [],

                            decisionRules: n.decisionRules ?? [],
                            elseKey: n.elseKey ?? null,
                            endpointId: n.endpointId ?? null,
                            apiSuccessKey: n.apiSuccessKey ?? null,
                            apiErrorKey: n.apiErrorKey ?? null,

                            waitTimeoutMin: n.waitTimeoutMin ?? null,
                            templateId: n.templateId ?? null,
                            jumpNextKey: n.jumpNextKey ?? null,
                        },
                        position: { x: 0, y: 0 },
                        draggable: false,
                    };
                });

                // ensure GLOBAL_FALLBACK exists and is pinned
                const hasGlobalFallback = initialNodes.some((n) => n.id === "GLOBAL_FALLBACK");
                if (!hasGlobalFallback) {
                    const seeded = seedGlobalFallbackNode();
                    seeded.data.body = initialFallbackText;
                    initialNodes.push(seeded);
                } else {
                    // normalize existing GLOBAL_FALLBACK: top & non-draggable
                    initialNodes.forEach((n) => {
                        if (n.id === "GLOBAL_FALLBACK") {
                            n.data = {
                                ...n.data,
                                body: initialFallbackText,
                                ui_metadata: { ...(n.data.ui_metadata || {}), title: n.data.ui_metadata?.title || "Global fallback" },
                            };
                            n.position = { x: 200, y: 40 };
                            n.draggable = false;
                        }
                    });
                }

                const initialEdges: Edge<FlowEdgeData>[] = [];
                data.nodes.forEach((n: any) => {
                    if (n.branches?.length) {
                        n.branches.forEach((b: any) => {
                            if (!b.next) return;
                            initialEdges.push({
                                id: `${n.key}-${b.next}-${b.input}`,
                                source: String(n.key),
                                target: String(b.next),
                                label: b.input === "ANY" || b.input === "*" ? "" : b.input,
                                type: "step",
                                data: { edgeKind: "branch" },
                                markerEnd: { type: MarkerType.ArrowClosed, color: "#aaaab6" },
                                style: { stroke: "#aaaab6", strokeWidth: 2 },
                            });
                        });
                    }

                    if (n.fallback) {
                        initialEdges.push({
                            id: `${n.key}-${n.fallback}-FALLBACK`,
                            source: String(n.key),
                            sourceHandle: "fallback",
                            target: String(n.fallback),
                            label: "FALLBACK",
                            type: "step",
                            data: { edgeKind: "fallback" },
                            style: { stroke: "#f59e0b", strokeWidth: 2, strokeDasharray: "6 4" },
                            markerEnd: { type: MarkerType.ArrowClosed, color: "#f59e0b" },
                        });
                    }
                });

                if (!hasGlobalFallback) {
                    setFlowData((fd) =>
                        fd ? { ...fd, fallbackKey: "GLOBAL_FALLBACK" } : fd
                    );
                }

                const layouted = getLayoutedElements<FlowNodeData, FlowEdgeData>(
                    initialNodes,
                    initialEdges,
                    data.entryKey || null
                );

                setNodes(layouted.initialNodes);
                setEdges(layouted.initialEdges);
            } catch (err) {
                console.error("Error loading flow:", err);
            } finally {
                setLoading(false);
            }
        }

        fetchFlow();
    }, [flowId, setNodes, setEdges]);

    // 2) Canvas handlers
    const onConnect = useCallback(
        (params: Connection) => {
            if (isPlaceholderNodeId(params.source) || isPlaceholderNodeId(params.target)) {
                return;
            }

            const isFallback = params.sourceHandle === "fallback";

            const filteredEdges = edges.filter(
                (e) =>
                    !(e.data as any)?.isPlaceholderEdge &&
                    !isPlaceholderNodeId(e.source) &&
                    !isPlaceholderNodeId(e.target)
            );

            const nextEdges = addEdge(
                {
                    ...params,
                    type: "step",
                    label: isFallback ? "FALLBACK" : "",
                    data: { edgeKind: isFallback ? "fallback" : "branch" },
                    style: isFallback
                        ? { stroke: "#f59e0b", strokeWidth: 2, strokeDasharray: "6 4" }
                        : { stroke: "#aaaab6", strokeWidth: 2 },
                    markerEnd: {
                        type: MarkerType.ArrowClosed,
                        color: isFallback ? "#f59e0b" : "#aaaab6",
                    },
                },
                isFallback
                    ? filteredEdges.filter(
                        (e) => !(e.source === params.source && e.data?.edgeKind === "fallback")
                    )
                    : filteredEdges
            );

            const updatedNodes = nodes.map((n) => {
                if (isFallback && params.source && n.id === params.source && !isPlaceholderNode(n)) {
                    return { ...n, data: { ...n.data, fallback: params.target ? String(params.target) : null } };
                }
                return n;
            });

            const layouted = getLayoutedElements<FlowNodeData, FlowEdgeData>(
                updatedNodes,
                nextEdges,
                currentEntryKey
            );
            setNodes(layouted.initialNodes);
            setEdges(layouted.initialEdges);

            if (isFallback && params.source && params.target && selectedNode?.id === params.source) {
                setSelectedNode((sn) =>
                    sn ? { ...sn, data: { ...sn.data, fallback: String(params.target) } } : sn
                );
            }
        },
        [edges, nodes, selectedNode, setNodes, setEdges, setSelectedNode]
    );

    const handleAddBranch = useCallback(
        (parentId?: string | number | null) => {
            const parentKey = parentId ? String(parentId) : null;
            if (!parentKey) return;
            const parentNode = nodes.find((n) => String(n.id) === parentKey);
            if (!parentNode) return;

            const newNodeId = `message_${Math.floor(Math.random() * 100000)}`;
            const ruleId = `rule_${Math.floor(Math.random() * 100000)}`;

            const updatedDecisionRules = [
                ...(parentNode.data.decisionRules || []),
                {
                    id: ruleId,
                    left: "last_user_answer",
                    op: "eq" as DecisionOp,
                    right: "New Option",
                    nextKey: newNodeId,
                },
            ];

            const newMessageNode: Node<FlowNodeData> = {
                id: newNodeId,
                type: "custom",
                data: {
                    id: newNodeId,
                    label: "New Option",
                    nodeType: "message",
                    ui_metadata: {},
                    body: "New branch message",
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
                position: { x: 0, y: 0 },
                draggable: false,
            };

            const placeholderIds = new Set(
                nodes.filter((n) => isPlaceholderNode(n)).map((n) => String(n.id))
            );
            const baseNodes = nodes
                .filter((n) => !placeholderIds.has(String(n.id)))
                .map((n) =>
                    n.id === parentNode.id
                        ? { ...n, data: { ...n.data, decisionRules: updatedDecisionRules } }
                        : n
                );
            const baseEdges = edges.filter(
                (e) =>
                    !placeholderIds.has(String(e.source)) &&
                    !placeholderIds.has(String(e.target)) &&
                    !(e.data as any)?.isPlaceholderEdge
            );

            const nextEdges = [
                ...baseEdges,
                {
                    id: `${parentKey}-${newNodeId}-${Math.random().toString(36).slice(2, 8)}`,
                    source: parentKey,
                    target: newNodeId,
                    label: "New Option", // Label appears on the line
                    type: "step",
                    data: { edgeKind: "branch" as const }, // CRITICAL: This ensures it is NOT treated as fallback
                    style: { stroke: "#94a3b8", strokeWidth: 2 },
                },
            ];

            const layouted = getLayoutedElements<FlowNodeData, FlowEdgeData>(
                baseNodes.concat(newMessageNode),
                nextEdges,
                currentEntryKey
            );

            setNodes(layouted.initialNodes);
            setEdges(layouted.initialEdges);
            setSelectedNode(newMessageNode);
            setPendingParentId(null);
        },
        [nodes, edges, currentEntryKey]
    );

    const onNodeClick = useCallback(
        (_: any, node: Node<FlowNodeData>) => {
            if (isPlaceholderNode(node)) {
                const parentId = (node.data as any)?.parentId || null;
                setPendingParentId(parentId);
                setActionPickerOpen(true);
                setSelectedNode(null);
                return;
            }

            if ((node.data as any)?.nodeType === "add_branch") {
                const parentId = (node.data as any)?.parentId || null;
                handleAddBranch(parentId);
                return;
            }

            setSelectedNode(node);
        },
        [handleAddBranch]
    );

    const onPaneClick = useCallback(() => {
        setSelectedNode(null);
        setPendingParentId(null);
        setActionPickerOpen(false);
    }, []);

    const updateNodeData = (key: string, value: any) => {
        if (!selectedNode) return;

        setNodes((nds) =>
            nds.map((n) => {
                if (n.id === selectedNode.id) {
                    const updated = { ...n, data: { ...n.data, [key]: value } };
                    setSelectedNode(updated);
                    return updated;
                }
                return n;
            })
        );
    };

    // -------- decision helpers --------
    const addDecisionRule = () => {
        if (!selectedNode) return;
        const rules: DecisionRule[] = selectedNode.data.decisionRules || [];
        const newRule: DecisionRule = {
            id: `r_${Math.random().toString(36).slice(2, 9)}`,
            left: "last_user_answer",
            op: "eq",
            right: "",
            nextKey: "",
        };
        updateNodeData("decisionRules", [...rules, newRule]);
    };

    const updateDecisionRule = (rid: string, patch: Partial<DecisionRule>) => {
        if (!selectedNode) return;
        const rules: DecisionRule[] = selectedNode.data.decisionRules || [];
        updateNodeData(
            "decisionRules",
            rules.map((r) => (r.id === rid ? { ...r, ...patch } : r))
        );
    };

    const removeDecisionRule = (rid: string) => {
        if (!selectedNode) return;
        const rules: DecisionRule[] = selectedNode.data.decisionRules || [];
        updateNodeData("decisionRules", rules.filter((r) => r.id !== rid));
    };

    // 3) Save
    const handleSave = async () => {
        if (!flowData) return;
        const trimmedName = flowName.trim();
        if (!trimmedName) {
            alert("Flow name is required.");
            return;
        }
        setSaving(true);

        try {
            const placeholderIds = new Set(
                nodes.filter((n) => isPlaceholderNode(n)).map((n) => String(n.id))
            );

            const deriveAllowedInputs = (node: Node<FlowNodeData>) => {
                if (node.data.nodeType === "message") {
                    if (node.data.interactiveType === "buttons") {
                        return (node.data.buttons || []).filter(Boolean);
                    }
                    if (node.data.interactiveType === "list") {
                        return (node.data.listOptions || []).filter(Boolean);
                    }
                    return [];
                }
                return node.data.allowedInputs || [];
            };

            const payloadNodes = nodes
                .filter((n) => !placeholderIds.has(String(n.id)))
                .map((node) => {
                    const resolvedType =
                        node.data.nodeType === "fallback"
                            ? "message"
                            : (node.data.nodeType as any) === "question"
                                ? "message"
                                : node.data.nodeType;

                    const base = {
                        key: node.id,
                        type: resolvedType,
                        body:
                            node.id === "GLOBAL_FALLBACK"
                                ? globalFallbackText
                                : node.data.body || "",
                        allowedInputs: deriveAllowedInputs(node),
                        fallbackKey: node.data.fallback || null,
                        ui_metadata: node.data.ui_metadata ?? {},

                        attachmentType: node.data.attachmentType || "none",
                        attachmentUrl: node.data.attachmentUrl || "",
                        interactiveType: node.data.interactiveType || "none",
                        buttons: node.data.buttons || [],
                        listOptions: node.data.listOptions || [],

                        endpointId: node.data.endpointId || null,
                        apiSuccessKey: node.data.apiSuccessKey || null,
                        apiErrorKey: node.data.apiErrorKey || null,

                        waitTimeoutMin: node.data.waitTimeoutMin ?? null,
                        templateId: node.data.templateId ?? null,
                        jumpNextKey: node.data.jumpNextKey ?? null,
                    };

                    return {
                        ...base,
                        decisionRules: node.data.decisionRules || [],
                        elseKey: node.data.elseKey || null,
                    };
                });

            const isPlaceholderEdge = (e: Edge<FlowEdgeData>) =>
                (e.data as any)?.isPlaceholderEdge ||
                placeholderIds.has(String(e.source)) ||
                placeholderIds.has(String(e.target));

            const isFallbackEdge = (e: Edge<FlowEdgeData>) =>
                e.data?.edgeKind === "fallback" ||
                e.sourceHandle === "fallback" ||
                (typeof e.label === "string" && e.label.toUpperCase() === "FALLBACK");

            const branchEdges = edges.filter((e) => !isFallbackEdge(e) && !isPlaceholderEdge(e));
            const fallbackEdges = edges.filter(
                (e) => isFallbackEdge(e) && !isPlaceholderEdge(e)
            );

            const outgoingBranchesBySource: Record<string, Edge<FlowEdgeData>[]> = {};
            branchEdges.forEach((e) => {
                const src = String(e.source);
                if (!outgoingBranchesBySource[src]) outgoingBranchesBySource[src] = [];
                outgoingBranchesBySource[src].push(e);
            });

            const fallbackEdgeBySource: Record<string, Edge<FlowEdgeData> | undefined> = {};
            fallbackEdges.forEach((e) => {
                const src = String(e.source);
                if (!fallbackEdgeBySource[src]) fallbackEdgeBySource[src] = e;
            });

            const payloadNodesWithDecisions = payloadNodes.map((node) => {
                if (node.type === "decision") {
                    const srcId = String(node.key);
                    const out = outgoingBranchesBySource[srcId] || [];
                    const fbEdge = fallbackEdgeBySource[srcId];

                    const rules = (node.decisionRules || []).map((r, idx) => ({
                        ...r,
                        left: "last_user_answer",
                        op: "eq",
                        nextKey: out[idx] ? String(out[idx].target) : r.nextKey || null,
                    }));

                    const elseKey = fbEdge ? String(fbEdge.target) : null;

                    return {
                        ...node,
                        decisionRules: rules,
                        elseKey,
                    };
                }
                return node;
            });

            const payloadEdges = branchEdges.map((e) => ({
                source: e.source,
                target: e.target,
                label: e.data?.edgeKind === "fallback" ? "FALLBACK" : ((e.label as string) || "ANY"),
            }));

            const payloadFallbackEdges = fallbackEdges.map((e) => ({
                source: e.source,
                target: e.target,
            }));

            await Api.updateFlowDefinition(flowId, {
                userflowname: trimmedName,
                description: (flowData as any).description || "",
                entryKey: flowData.entryKey || draftEntryKey,
                fallbackKey: "GLOBAL_FALLBACK",
                nodes: payloadNodesWithDecisions as any,
                edges: payloadEdges,
                fallbackEdges: payloadFallbackEdges,
                flowType: (flowData as any).flowType,
            });
            setFlowData((fd) => (fd ? { ...fd, name: trimmedName } : fd));
            if (typeof window !== "undefined") {
                sessionStorage.setItem(
                    "flow-hub-message",
                    `Flow "${trimmedName}" was updated.`
                );
            }
            router.push("/flows/user");
        } catch (err: any) {
            console.error(err);
            alert("Failed to save: " + err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteFlow = async () => {
        if (!flowId) return;
        const confirmed = window.confirm(
            "Delete this flow and all related data? This cannot be undone."
        );
        if (!confirmed) return;
        setDeleting(true);
        try {
            await Api.deleteFlowDefinition(flowId);
            if (typeof window !== "undefined") {
                sessionStorage.setItem(
                    "flow-hub-message",
                    `Flow "${flowName || flowId}" was deleted.`
                );
            }
            router.push("/flows/user");
        } catch (err: any) {
            console.error(err);
            alert("Failed to delete: " + (err?.message || "Unknown error"));
        } finally {
            setDeleting(false);
        }
    };

    // 4) Add Node by type (action picker)
    const handleAddNodeByType = (nodeType: FlowNodeData["nodeType"]) => {
        const placeholderIds = new Set(
            nodes.filter((n) => isPlaceholderNode(n)).map((n) => String(n.id))
        );
        const baseNodes = nodes.filter((n) => !placeholderIds.has(String(n.id)));
        const baseEdges = edges.filter(
            (e) =>
                !placeholderIds.has(String(e.source)) &&
                !placeholderIds.has(String(e.target)) &&
                !(e.data as any)?.isPlaceholderEdge
        );

        const nextEdges: Edge<FlowEdgeData>[] = [...baseEdges];
        const newNodes: Node<FlowNodeData>[] = [];

        if (nodeType === "decision") {
            const raw = typeof window !== "undefined" ? window.prompt("How many choices?", "2") : null;
            const numChoices = Math.max(1, parseInt(raw || "2", 10) || 2);

            const decisionId = `decision_${Math.floor(Math.random() * 100000)}`;
            const decisionNode: Node<FlowNodeData> = {
                id: decisionId,
                type: "custom",
                data: {
                    id: decisionId,
                    label: decisionId,
                    nodeType: "decision",
                    ui_metadata: {},
                    body: "",
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
                position: { x: 0, y: 0 },
                draggable: false,
            };

            const choiceNodes: Node<FlowNodeData>[] = [];
            const rules = [];
            for (let i = 0; i < numChoices; i++) {
                const choiceId = `option_${Math.floor(Math.random() * 100000)}`;
                const choiceNode: Node<FlowNodeData> = {
                    id: choiceId,
                    type: "custom",
                    data: {
                        id: choiceId,
                        label: `Option ${i + 1}`,
                        nodeType: "message",
                        ui_metadata: {},
                        body: `Option ${i + 1}`,
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
                    position: { x: 0, y: 0 },
                    draggable: false,
                };
                choiceNodes.push(choiceNode);
                rules.push({
                    id: `rule_${Math.random().toString(36).slice(2, 9)}`,
                    left: "last_user_answer",
                    op: "eq" as DecisionOp,
                    right: `Option ${i + 1}`,
                    nextKey: choiceId,
                });
            }

            const fallbackId = `fallback_${Math.floor(Math.random() * 100000)}`;
            const fallbackNode: Node<FlowNodeData> = {
                id: fallbackId,
                type: "custom",
                data: {
                    id: fallbackId,
                    label: "Fallback",
                    nodeType: "message",
                    ui_metadata: {},
                    body: "Fallback branch",
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
                position: { x: 0, y: 0 },
                draggable: false,
            };

            const decisionNodeWithRules = {
                ...decisionNode,
                data: { ...decisionNode.data, decisionRules: rules, elseKey: fallbackId },
            };

            newNodes.push(decisionNodeWithRules, ...choiceNodes, fallbackNode);

            if (pendingParentId && !isPlaceholderNodeId(pendingParentId)) {
                nextEdges.push({
                    id: `${pendingParentId}-${decisionId}-${Math.random().toString(36).slice(2, 8)}`,
                    source: pendingParentId,
                    target: decisionId,
                    label: "",
                    type: "step",
                    data: { edgeKind: "branch" },
                    style: { stroke: "#94a3b8", strokeWidth: 2 },
                });
            }

            choiceNodes.forEach((n) => {
                nextEdges.push({
                    id: `${decisionId}-${n.id}-${Math.random().toString(36).slice(2, 8)}`,
                    source: decisionId,
                    target: n.id,
                    label: n.data.label,
                    type: "step",
                    data: { edgeKind: "branch" },
                    style: { stroke: "#94a3b8", strokeWidth: 2 },
                });
            });

            nextEdges.push({
                id: `${decisionId}-${fallbackId}-${Math.random().toString(36).slice(2, 8)}`,
                source: decisionId,
                target: fallbackId,
                label: "Fallback",
                type: "step",
                data: { edgeKind: "fallback" },
                style: { stroke: "#94a3b8", strokeWidth: 2, strokeDasharray: "4 4" },
            });

            const layouted = getLayoutedElements<FlowNodeData, FlowEdgeData>(
                baseNodes.concat(newNodes),
                nextEdges,
                currentEntryKey
            );

            setNodes(layouted.initialNodes);
            setEdges(layouted.initialEdges);
            setSelectedNode(decisionNodeWithRules);
            setActionPickerOpen(false);
            setPendingParentId(null);
            return;
        }

        const id = `${nodeType}_${Math.floor(Math.random() * 100000)}`;
        const newNode: Node<FlowNodeData> = {
            id,
            type: "custom",
                data: {
                    id,
                    label: null,
                    nodeType,
                    ui_metadata: {},
                    body: "New message text",
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
            position: { x: 0, y: 0 },
            draggable: false,
        };

        if (pendingParentId && !isPlaceholderNodeId(pendingParentId)) {
            nextEdges.push({
                id: `${pendingParentId}-${id}-${Math.random().toString(36).slice(2, 8)}`,
                source: pendingParentId,
                target: id,
                label: "",
                type: "step",
                data: { edgeKind: "branch" },
                style: { stroke: "#94a3b8", strokeWidth: 2 },
            });
        }

        const layouted = getLayoutedElements<FlowNodeData, FlowEdgeData>(
            baseNodes.concat(newNode),
            nextEdges,
            currentEntryKey
        );

        setNodes(layouted.initialNodes);
        setEdges(layouted.initialEdges);
        setSelectedNode(newNode);
        setActionPickerOpen(false);
        setPendingParentId(null);
    };

    const handleAutoLayout = () => {
        const placeholderIds = new Set(
            nodes.filter((n) => isPlaceholderNode(n)).map((n) => String(n.id))
        );
        const baseNodes = nodes.filter((n) => !placeholderIds.has(String(n.id)));
        const baseEdges = edges.filter(
            (e) =>
                !placeholderIds.has(String(e.source)) &&
                !placeholderIds.has(String(e.target)) &&
                !(e.data as any)?.isPlaceholderEdge
        );
        const layouted = getLayoutedElements<FlowNodeData, FlowEdgeData>(
            baseNodes,
            baseEdges,
            currentEntryKey
        );
        setNodes(layouted.initialNodes);
        setEdges(layouted.initialEdges);
    };

    if (loading)
        return (
            <div className="h-full flex items-center justify-center bg-[#f8f8f8]">
                <Loader2 className="animate-spin text-[#43b899]" size={32} />
            </div>
        );

    const nodeType = selectedNode?.data?.nodeType || "message";
    const actionLabel = (() => {
        switch (nodeType) {
            case "message":
                return "Send message";
            case "template":
                return "Send template";
            case "decision":
                return "Choice";
            case "api":
                return "API call";
            case "jump":
                return "Jump";
            case "fallback":
                return "Fallback";
            default:
                return "Action";
        }
    })();

    return (
        <div className="h-full w-full flex flex-col font-sans text-[#3e3e55]">
            {/* Header */}
            <header className="h-16 bg-white border-b border-[#e0e0e7] px-6 flex items-center justify-between z-20 shadow-sm">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => router.push("/flows/user")}
                        className="text-[#8e8e9e] hover:text-[#3e3e55]"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div className="space-y-1">
                        <input
                            className="w-full max-w-sm rounded border border-[#e0e0e7] px-3 py-1.5 text-sm font-semibold text-[#3e3e55] outline-none focus:ring-2 focus:ring-[#43b899]"
                            value={flowName}
                            onChange={(e) => setFlowName(e.target.value)}
                            placeholder="Flow name"
                        />
                        <p className="text-xs text-[#8e8e9e]">Flow Builder</p>
                    </div>
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={handleDeleteFlow}
                        disabled={deleting}
                        className="flex items-center gap-2 px-4 py-2 rounded border border-[#f3c0c0] text-[#c0392b] hover:bg-[#fff1f1] text-sm font-bold transition disabled:opacity-60"
                    >
                        {deleting ? "Deleting..." : "Delete flow"}
                    </button>
                    <button
                        onClick={() => setSettingsOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded border border-[#e0e0e7] hover:bg-[#f8f8f8] text-sm font-medium transition"
                    >
                        Flow settings
                    </button>
                    <button
                        onClick={handleAutoLayout}
                        className="flex items-center gap-2 px-4 py-2 rounded border border-[#e0e0e7] hover:bg-[#f8f8f8] text-sm font-medium transition"
                    >
                        Auto layout
                    </button>
                    <button
                        onClick={() => {
                            setPendingParentId(null);
                            setActionPickerOpen(true);
                        }}
                        className="flex items-center gap-2 px-4 py-2 rounded border border-[#e0e0e7] hover:bg-[#f8f8f8] text-sm font-medium transition"
                    >
                        <Plus size={16} /> Add action
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 px-4 py-2 rounded bg-[#43b899] hover:bg-[#058563] text-white text-sm font-bold transition shadow-sm disabled:opacity-70"
                    >
                        {saving ? (
                            <Loader2 size={16} className="animate-spin" />
                        ) : (
                            <Save size={16} />
                        )}
                        Save Changes
                    </button>
                </div>
            </header>

            {/* Canvas Area */}
            <div className="flex-1 flex overflow-hidden relative">
                <div className="flex-1 bg-[#f8f8f8] h-full">
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        nodeTypes={nodeTypes}
                        defaultEdgeOptions={defaultEdgeOptions}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        onNodeClick={onNodeClick}
                        onPaneClick={onPaneClick}
                        fitView
                        minZoom={0.1}
                    >
                        <Controls className="bg-white border border-[#e0e0e7] shadow-sm rounded-md" />
                    </ReactFlow>
                </div>

                {/* Properties Panel */}
                <div
                    className={`
            absolute right-0 top-0 bottom-0 w-[350px] bg-white border-l border-[#e0e0e7] shadow-xl z-30 
            transform transition-transform duration-300 ease-in-out
                            ${selectedNode ? "translate-x-0" : "translate-x-full"}
          `}
                >
                    {selectedNode && (
                        <div className="flex flex-col h-full">
                            <div className="flex items-center justify-between p-5 border-b border-[#e0e0e7]">
                                <h3 className="font-bold text-lg">Edit "{actionLabel}" action</h3>
                                <button
                                    onClick={() => setSelectedNode(null)}
                                    className="text-[#8e8e9e] hover:text-[#3e3e55]"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-5 space-y-6">
                                {/* Title (optional) */}
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-[#8e8e9e] uppercase">
                                        Title (optional)
                                    </label>
                                    <input
                                        className="w-full p-2.5 border border-[#e0e0e7] rounded text-sm"
                                        value={selectedNode.data.ui_metadata?.title || ""}
                                        onChange={(e) => {
                                            const title = e.target.value;
                                            setNodes((nds) =>
                                                nds.map((n) =>
                                                    n.id === selectedNode.id
                                                        ? {
                                                            ...n,
                                                            data: {
                                                                ...n.data,
                                                                ui_metadata: { ...(n.data.ui_metadata || {}), title },
                                                                label: title || null,
                                                            },
                                                        }
                                                        : n
                                                )
                                            );
                                            setSelectedNode((sn) =>
                                                sn
                                                    ? {
                                                        ...sn,
                                                        data: {
                                                            ...sn.data,
                                                            ui_metadata: { ...(sn.data.ui_metadata || {}), title },
                                                            label: title || null,
                                                        },
                                                    }
                                                    : sn
                                            );
                                        }}
                                        placeholder="e.g. Welcome message"
                                    />
                                    <p className="text-[11px] text-[#aaaab6]">
                                        If empty, the canvas will show the action type (e.g. Send message).
                                    </p>
                                </div>

                                {/* Action Type */}
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-[#8e8e9e] uppercase">
                                        Action Type
                                    </label>
                                    <div className="w-full p-2.5 border border-[#e0e0e7] rounded bg-[#f9fafb] text-sm font-semibold capitalize">
                                        {selectedNode.data.nodeType.replace("_", " ")}
                                    </div>
                                </div>

                                {/* ---------------- MESSAGE ---------------- */}
                                {nodeType === "message" && (
                                    <>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-[#8e8e9e] uppercase">
                                                Content
                                            </label>
                                            <textarea
                                                className="w-full p-3 border border-[#e0e0e7] rounded text-sm min-h-[120px] focus:ring-2 focus:ring-[#43b899] outline-none resize-y"
                                                value={selectedNode.data.body || ""}
                                                onChange={(e) => updateNodeData("body", e.target.value)}
                                                placeholder="Message text..."
                                            />
                                        </div>

                                        <div className="space-y-1 p-3 border border-dashed border-[#e0e0e7] rounded">
                                            <p className="text-xs font-bold text-[#8e8e9e] uppercase">
                                                Fallback
                                            </p>
                                            <p className="text-xs text-[#8e8e9e]">
                                                Fallback is set by dragging the orange fallback handle to the desired node.
                                                Current:{" "}
                                                <span className="font-mono text-[#3e3e55]">
                                                    {selectedNode.data.fallback || "None"}
                                                </span>
                                            </p>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-[#8e8e9e] uppercase">
                                                Attachment
                                            </label>
                                            <select
                                                className="w-full p-2.5 border border-[#e0e0e7] rounded bg-white text-sm"
                                                value={selectedNode.data.attachmentType || "none"}
                                                onChange={(e) =>
                                                    updateNodeData("attachmentType", e.target.value)
                                                }
                                            >
                                                <option value="none">None</option>
                                                <option value="image">Image</option>
                                                <option value="video">Video</option>
                                                <option value="audio">Audio</option>
                                                <option value="document">Document</option>
                                            </select>

                                            {selectedNode.data.attachmentType !== "none" && (
                                                <input
                                                    type="text"
                                                    className="w-full p-2.5 border border-[#e0e0e7] rounded text-sm"
                                                    placeholder="Attachment URL..."
                                                    value={selectedNode.data.attachmentUrl || ""}
                                                    onChange={(e) =>
                                                        updateNodeData("attachmentUrl", e.target.value)
                                                    }
                                                />
                                            )}
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-[#8e8e9e] uppercase">
                                                Interactive
                                            </label>
                                            <select
                                                className="w-full p-2.5 border border-[#e0e0e7] rounded bg-white text-sm"
                                                value={selectedNode.data.interactiveType || "none"}
                                                onChange={(e) => {
                                                    const type = e.target.value as InteractiveType;
                                                    updateNodeData("interactiveType", type);
                                                    if (type === "none") {
                                                        updateNodeData("buttons", []);
                                                        updateNodeData("listOptions", []);
                                                        updateNodeData("allowedInputs", []);
                                                    }
                                                }}
                                            >
                                                <option value="none">None</option>
                                                <option value="buttons">Buttons</option>
                                                <option value="list">List</option>
                                            </select>

                                            {selectedNode.data.interactiveType === "buttons" && (
                                                <div className="space-y-2 mt-2">
                                                    {(selectedNode.data.buttons || []).map((btn, idx) => (
                                                        <div key={idx} className="flex gap-2">
                                                            <input
                                                                className="flex-1 p-2.5 border border-[#e0e0e7] rounded text-sm"
                                                                placeholder="Button text"
                                                                value={btn}
                                                                onChange={(e) => {
                                                                    const next = [...(selectedNode.data.buttons || [])];
                                                                    next[idx] = e.target.value;
                                                                    updateNodeData("buttons", next);
                                                                    updateNodeData(
                                                                        "allowedInputs",
                                                                        next.filter(Boolean)
                                                                    );
                                                                }}
                                                            />
                                                            <button
                                                                type="button"
                                                                className="px-2 text-xs text-red-500"
                                                                onClick={() => {
                                                                    const next = [...(selectedNode.data.buttons || [])];
                                                                    next.splice(idx, 1);
                                                                    updateNodeData("buttons", next);
                                                                    updateNodeData(
                                                                        "allowedInputs",
                                                                        next.filter(Boolean)
                                                                    );
                                                                }}
                                                            >
                                                                x
                                                            </button>
                                                        </div>
                                                    ))}
                                                    <button
                                                        type="button"
                                                        className="w-full py-2 border border-[#e0e0e7] rounded text-sm hover:bg-[#f8f8f8]"
                                                        onClick={() => {
                                                            const next = [...(selectedNode.data.buttons || []), ""];
                                                            updateNodeData("buttons", next);
                                                        }}
                                                    >
                                                        + Add button
                                                    </button>
                                                </div>
                                            )}

                                            {selectedNode.data.interactiveType === "list" && (
                                                <div className="space-y-2 mt-2">
                                                    {(selectedNode.data.listOptions || []).map((opt, idx) => (
                                                        <div key={idx} className="flex gap-2">
                                                            <input
                                                                className="flex-1 p-2.5 border border-[#e0e0e7] rounded text-sm"
                                                                placeholder="List option"
                                                                value={opt}
                                                                onChange={(e) => {
                                                                    const next = [...(selectedNode.data.listOptions || [])];
                                                                    next[idx] = e.target.value;
                                                                    updateNodeData("listOptions", next);
                                                                    updateNodeData(
                                                                        "allowedInputs",
                                                                        next.filter(Boolean)
                                                                    );
                                                                }}
                                                            />
                                                            <button
                                                                type="button"
                                                                className="px-2 text-xs text-red-500"
                                                                onClick={() => {
                                                                    const next = [...(selectedNode.data.listOptions || [])];
                                                                    next.splice(idx, 1);
                                                                    updateNodeData("listOptions", next);
                                                                    updateNodeData(
                                                                        "allowedInputs",
                                                                        next.filter(Boolean)
                                                                    );
                                                                }}
                                                            >
                                                                x
                                                            </button>
                                                        </div>
                                                    ))}
                                                    <button
                                                        type="button"
                                                        className="w-full py-2 border border-[#e0e0e7] rounded text-sm hover:bg-[#f8f8f8]"
                                                        onClick={() => {
                                                            const next = [...(selectedNode.data.listOptions || []), ""];
                                                            updateNodeData("listOptions", next);
                                                        }}
                                                    >
                                                        + Add option
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </>
                                )}

                                {/* ---------------- TEMPLATE ---------------- */}
                                {nodeType === "template" && (
                                    <>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-[#8e8e9e] uppercase">
                                                Template
                                            </label>
                                            <select
                                                className="w-full p-2.5 border border-[#e0e0e7] rounded text-sm"
                                                value={selectedNode.data.templateId || ""}
                                                onChange={(e) =>
                                                    updateNodeData(
                                                        "templateId",
                                                        e.target.value ? Number(e.target.value) : null
                                                    )
                                                }
                                            >
                                                <option value="">Select template...</option>
                                                {templates.map((tpl) => (
                                                    <option key={tpl.contentid} value={tpl.contentid}>
                                                        {tpl.title}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </>
                                )}

                                {/* ---------------- JUMP ---------------- */}
                                {nodeType === "jump" && (
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-[#8e8e9e] uppercase">
                                            Jump to action
                                        </label>
                                        <select
                                            className="w-full p-2.5 border rounded text-sm"
                                            value={selectedNode.data.jumpNextKey || ""}
                                            onChange={(e) =>
                                                updateNodeData("jumpNextKey", e.target.value || null)
                                            }
                                        >
                                            <option value="">Select next action...</option>
                                            {fallbackOptionsForSelected.map((nid) => (
                                                <option key={nid} value={nid}>
                                                    {nid}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {/* ---------------- DECISION ---------------- */}
                                {nodeType === "decision" && (
                                    <>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-[#8e8e9e] uppercase">
                                                Trigger choice if:
                                            </label>

                                            <div className="space-y-3">
                                                {(selectedNode.data.decisionRules || []).map(
                                                    (r: DecisionRule, index: number) => (
                                                        <div
                                                            key={r.id}
                                                            className="p-3 border rounded bg-[#fafafa] space-y-2"
                                                        >
                                                            <div className="text-xs text-[#8e8e9e]">
                                                                Choice #{index + 1}
                                                            </div>
                                                            <div className="text-xs text-[#8e8e9e]">
                                                                Trigger choice if <span className="font-mono">last_user_answer</span> equals:
                                                            </div>
                                                            <input
                                                                className="w-full p-2 border rounded text-sm"
                                                                placeholder="Button text / expected reply"
                                                                value={r.right}
                                                                onChange={(e) =>
                                                                    updateDecisionRule(r.id, {
                                                                        left: "last_user_answer",
                                                                        op: "eq",
                                                                        right: e.target.value,
                                                                    })
                                                                }
                                                            />

                                                            <button
                                                                onClick={() => removeDecisionRule(r.id)}
                                                                className="text-xs text-red-500 hover:underline"
                                                            >
                                                                Remove rule
                                                            </button>
                                                        </div>
                                                    )
                                                )}

                                                <button
                                                    onClick={addDecisionRule}
                                                    className="w-full py-2 border rounded text-sm hover:bg-[#f2f2f2]"
                                                >
                                                    + Add choice
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                )}

                                {/* ---------------- API ---------------- */}
                                {nodeType === "api" && (
                                    <>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-[#8e8e9e] uppercase">
                                                Endpoint
                                            </label>
                                            <select
                                                className="w-full p-2.5 border rounded text-sm"
                                                value={selectedNode.data.endpointId || ""}
                                                onChange={(e) =>
                                                    updateNodeData(
                                                        "endpointId",
                                                        e.target.value
                                                            ? Number(e.target.value)
                                                            : null
                                                    )
                                                }
                                            >
                                                <option value="">Select endpoint...</option>
                                                {endpoints.map((ep, idx) => (
                                                    <option
                                                        key={ep.apiid ?? `${ep.name ?? "endpoint"}-${idx}`}
                                                        value={ep.apiid ?? ""}
                                                    >
                                                        {ep.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-[#8e8e9e] uppercase">
                                                On Success -- Next action
                                            </label>
                                            <select
                                                className="w-full p-2.5 border rounded text-sm"
                                                value={selectedNode.data.apiSuccessKey || ""}
                                                onChange={(e) =>
                                                    updateNodeData(
                                                        "apiSuccessKey",
                                                        e.target.value || null
                                                    )
                                                }
                                            >
                                                <option value="">None</option>
                                                {fallbackOptionsForSelected.map((nid) => (
                                                    <option key={nid} value={nid}>
                                                        {nid}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-[#8e8e9e] uppercase">
                                                On Error -- Next action
                                            </label>
                                            <select
                                                className="w-full p-2.5 border rounded text-sm"
                                                value={selectedNode.data.apiErrorKey || ""}
                                                onChange={(e) =>
                                                    updateNodeData(
                                                        "apiErrorKey",
                                                        e.target.value || null
                                                    )
                                                }
                                            >
                                                <option value="">None</option>
                                                {fallbackOptionsForSelected.map((nid) => (
                                                    <option key={nid} value={nid}>
                                                        {nid}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* optional node fallback still useful */}
                                        <div className="space-y-1 p-3 border border-dashed border-[#e0e0e7] rounded">
                                            <p className="text-xs font-bold text-[#8e8e9e] uppercase">
                                                Fallback (if neither success/error route)
                                            </p>
                                            <p className="text-xs text-[#8e8e9e]">
                                                Set by dragging the orange fallback handle. Current:{" "}
                                                <span className="font-mono text-[#3e3e55]">
                                                    {selectedNode.data.fallback || "None"}
                                                </span>
                                            </p>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Delete */}
                            <div className="p-5 border-t border-[#e0e0e7] bg-[#f8f8f8]">
                                <button
                                    onClick={() => {
                                        if (selectedNode?.id === "GLOBAL_FALLBACK") {
                                            alert("GLOBAL_FALLBACK cannot be deleted.");
                                            return;
                                        }
                                        if (selectedNode?.data?.isStart) {
                                            alert("The START / incoming message action cannot be deleted.");
                                            return;
                                        }

                                        const placeholderIds = new Set(
                                            nodes
                                                .filter((n) => isPlaceholderNode(n))
                                                .map((n) => String(n.id))
                                        );
                                        const isPlaceholderEdge = (e: Edge<FlowEdgeData>) =>
                                            (e.data as any)?.isPlaceholderEdge ||
                                            placeholderIds.has(String(e.source)) ||
                                            placeholderIds.has(String(e.target));

                                        const isFallbackEdge = (e: Edge<FlowEdgeData>) =>
                                            e.data?.edgeKind === "fallback" ||
                                            (typeof e.label === "string" && e.label.toUpperCase() === "FALLBACK") ||
                                            e.sourceHandle === "fallback";

                                        const nonPlaceholderNodes = nodes.filter((n) => !isPlaceholderNode(n));
                                        const nonPlaceholderEdges = edges.filter((e) => !isPlaceholderEdge(e));

                                        const nodesToRemove = new Set<string>([String(selectedNode.id)]);

                                        // Determine parent and siblings to possibly remove fallback too
                                        const parentEdge = nonPlaceholderEdges.find(
                                            (e) => String(e.target) === String(selectedNode.id)
                                        );
                                        if (parentEdge) {
                                            const parentId = String(parentEdge.source);
                                            const siblingEdges = nonPlaceholderEdges.filter(
                                                (e) => String(e.source) === parentId
                                            );
                                            const fallbackEdge = siblingEdges.find(isFallbackEdge);
                                            const realChoiceEdges = siblingEdges.filter((e) => !isFallbackEdge(e));

                                            // If deleting the last real choice and a fallback exists, also delete that fallback node
                                            if (!isFallbackEdge(parentEdge) && realChoiceEdges.length === 1 && fallbackEdge) {
                                                nodesToRemove.add(String(fallbackEdge.target));
                                            }
                                        }

                                        const baseNodes = nonPlaceholderNodes.filter(
                                            (n) => !nodesToRemove.has(String(n.id))
                                        );
                                        const baseEdges = nonPlaceholderEdges.filter(
                                            (e) =>
                                                !nodesToRemove.has(String(e.source)) &&
                                                !nodesToRemove.has(String(e.target))
                                        );

                                        const layouted =
                                            getLayoutedElements<FlowNodeData, FlowEdgeData>(
                                                baseNodes,
                                                baseEdges,
                                                currentEntryKey
                                            );
                                        setNodes(layouted.initialNodes);
                                        setEdges(layouted.initialEdges);
                                        setSelectedNode(null);
                                    }}
                                    className="w-full flex justify-center items-center gap-2 p-2 text-[#cc3d3d] border border-[#cc3d3d] rounded hover:bg-[#ffe6e6] text-sm font-bold transition"
                                >
                                    <Trash2 size={16} /> Delete action
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Action picker modal */}
            <ActionPickerModal
                open={actionPickerOpen}
                onClose={() => {
                    setActionPickerOpen(false);
                    setPendingParentId(null);
                }}
                onPick={handleAddNodeByType}
            />

            {/* Flow settings modal */}
            <FlowSettingsModal
                open={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                allNodeIds={allNodeIds}
                draftEntryKey={draftEntryKey}
                setDraftEntryKey={setDraftEntryKey}
                globalFallbackText={globalFallbackText}
                setGlobalFallbackText={setGlobalFallbackText}
                onApply={() => {
                    setNodes((nds) =>
                        nds.map((n) => {
                            if (n.id === "GLOBAL_FALLBACK") {
                                return {
                                    ...n,
                                    data: {
                                        ...n.data,
                                        body: globalFallbackText,
                                        ui_metadata: {
                                            ...(n.data.ui_metadata || {}),
                                            title: n.data.ui_metadata?.title || "Global fallback",
                                        },
                                    },
                                };
                            }
                            return {
                                ...n,
                                data: { ...n.data, isStart: draftEntryKey ? String(draftEntryKey) === String(n.id) : false },
                            };
                        })
                    );
                    setFlowData((fd) =>
                        fd
                            ? {
                                ...fd,
                                entryKey: draftEntryKey,
                                fallbackKey: "GLOBAL_FALLBACK",
                            }
                            : fd
                    );
                    setSettingsOpen(false);
                }}
            />
        </div>
    );
}

function ActionPickerModal({
    open,
    onClose,
    onPick,
}: {
    open: boolean;
    onClose: () => void;
    onPick: (t: FlowNodeData["nodeType"]) => void;
}) {
    if (!open) return null;

    const Btn = ({ t, label }: { t: FlowNodeData["nodeType"]; label: string }) => (
        <button
            onClick={() => onPick(t)}
            className="w-full text-left px-3 py-2 rounded border hover:bg-[#f8f8f8] text-sm"
        >
            {label}
        </button>
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="w-full max-w-md bg-white rounded-xl shadow-xl border p-5 space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="font-bold text-lg">Add action</h3>
                    <button onClick={onClose}>X</button>
                </div>

                <div className="space-y-2">
                    <p className="text-xs font-bold text-[#8e8e9e] uppercase">Interaction</p>
                    <div className="space-y-2">
                        <Btn t="message" label="Send message" />
                        <Btn t="template" label="Send template" />
                    </div>
                </div>

                <div className="space-y-2">
                    <p className="text-xs font-bold text-[#8e8e9e] uppercase">Logic</p>
                    <div className="space-y-2">
                        <Btn t="decision" label="Choice" />
                        <Btn t="jump" label="Jump to action" />
                        <Btn t="api" label="Call API" />
                    </div>
                </div>
            </div>
        </div>
    );
}

function FlowSettingsModal({
    open,
    onClose,
    allNodeIds,
    draftEntryKey,
    setDraftEntryKey,
    globalFallbackText,
    setGlobalFallbackText,
    onApply,
}: {
    open: boolean;
    onClose: () => void;
    allNodeIds: string[];
    draftEntryKey: string | null;
    setDraftEntryKey: (v: string | null) => void;
    globalFallbackText: string;
    setGlobalFallbackText: (v: string) => void;
    onApply: () => void;
}) {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="w-full max-w-lg bg-white rounded-xl shadow-xl border border-[#e0e0e7]">
                <div className="px-6 py-4 border-b border-[#e0e0e7] flex items-center justify-between">
                    <h3 className="text-lg font-bold">Flow settings</h3>
                    <button
                        onClick={onClose}
                        className="text-[#8e8e9e] hover:text-black"
                        aria-label="Close flow settings"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    {/* Entry key */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-[#8e8e9e] uppercase">
                            Entry action
                        </label>
                        <select
                            className="w-full p-2.5 border border-[#e0e0e7] rounded bg-white text-sm"
                            value={draftEntryKey || ""}
                            onChange={(e) => setDraftEntryKey(e.target.value || null)}
                        >
                            <option value="">None</option>
                            {allNodeIds.map((nid) => (
                                <option key={nid} value={nid}>
                                    {nid}
                                </option>
                            ))}
                        </select>
                        <p className="text-[11px] text-[#aaaab6]">
                            This is where a session starts if no checkpoint exists.
                        </p>
                    </div>

                    {/* Global fallback */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <label className="text-xs font-bold text-[#8e8e9e] uppercase">
                                Text for GLOBAL_FALLBACK action
                            </label>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-mono bg-[#f3f4f6] text-[#4b5563]">
                                Node id: GLOBAL_FALLBACK
                            </span>
                        </div>
                        <textarea
                            className="w-full p-3 border border-[#e0e0e7] rounded text-sm min-h-[80px] focus:ring-2 focus:ring-[#43b899] outline-none resize-y"
                            value={globalFallbackText}
                            onChange={(e) => setGlobalFallbackText(e.target.value)}
                            placeholder="Sorry, I didn't understand that. Please try again."
                        />
                        <p className="text-[11px] text-[#aaaab6]">
                            This edits the message for the GLOBAL_FALLBACK action shown at the top of the flow. It is used when no node-level fallback or branch matches the user's reply.
                        </p>
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-[#e0e0e7] flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded border text-sm hover:bg-[#f8f8f8]"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onApply}
                        className="px-4 py-2 rounded bg-[#43b899] text-white text-sm font-bold hover:bg-[#058563]"
                    >
                        Apply
                    </button>
                </div>
            </div>
        </div>
    );
}

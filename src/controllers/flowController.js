// src/controllers/flowController.js
import { prisma } from "../config/prismaClient.js";

const FLOW_TYPES = ["START", "CAMPAIGN", "END"];

function normalizeFlowType(value) {
    if (!value) return "CAMPAIGN";
    const upper = String(value).toUpperCase();
    return FLOW_TYPES.includes(upper) ? upper : "CAMPAIGN";
}

function normalizeFlowStatus(value) {
    if (!value) return "Draft";
    const formatted = String(value).trim();
    return formatted === "Active" ? "Active" : "Draft";
}

// helpers stay the same
function buildPlaceholdersFromNode(n = {}) {
    const attachmentType = n.attachmentType || "none";
    const attachmentUrl =
        attachmentType !== "none" ? (n.attachmentUrl || null) : null;

    const interactiveType = n.interactiveType || "none";
    const buttons =
        interactiveType === "buttons" ? (n.buttons || []) : [];
    const listOptions =
        interactiveType === "list" ? (n.listOptions || []) : [];

    // decision extras (just metadata for now)
    const decisionRules = Array.isArray(n.decisionRules) ? n.decisionRules : [];
    const elseKey = n.elseKey || null;

    // api extras (metadata; engine can ignore if not used)
    const endpointId = n.endpointId ?? null;
    const apiSuccessKey = n.apiSuccessKey || null;
    const apiErrorKey = n.apiErrorKey || null;

    const waitTimeoutMin = n.waitTimeoutMin ?? null;
    const templateId = n.templateId ?? null;
    const jumpNextKey = n.jumpNextKey ?? null;

    return {
        attachmentType,
        attachmentUrl,
        interactiveType,
        buttons,
        listOptions,
        decisionRules,
        elseKey,
        endpointId,
        apiSuccessKey,
        apiErrorKey,
        waitTimeoutMin,
        templateId,
        jumpNextKey,
    };
}

function extractNodeExtras(placeholders) {
    const p = placeholders || {};
    return {
        attachmentType: p.attachmentType || "none",
        attachmentUrl: p.attachmentUrl || null,
        interactiveType: p.interactiveType || "none",
        buttons: Array.isArray(p.buttons) ? p.buttons : [],
        listOptions: Array.isArray(p.listOptions) ? p.listOptions : [],
        decisionRules: Array.isArray(p.decisionRules) ? p.decisionRules : [],
        elseKey: p.elseKey || null,
        endpointId: p.endpointId ?? null,
        apiSuccessKey: p.apiSuccessKey || null,
        apiErrorKey: p.apiErrorKey || null,
        waitTimeoutMin: p.waitTimeoutMin ?? null,
        templateId: p.templateId ?? null,
        jumpNextKey: p.jumpNextKey ?? null,
    };
}

function normalizeUiMetadata(raw) {
    if (!raw) return null;
    if (typeof raw !== "object") return null;
    try {
        return JSON.parse(JSON.stringify(raw));
    } catch (err) {
        console.warn("normalizeUiMetadata failed:", err);
        return null;
    }
}

/**
 * GET /api/flow/list
 * Returns flows for table listing.
 */
export async function listFlows(req, res) {
    try {
        const flows = await prisma.userflow.findMany({
            select: {
                userflowid: true,
                userflowname: true,
                description: true,
                status: true,
                createdat: true,
                updatedat: true,
                flow_type: true,
                _count: {
                    select: { keymapping: true },
                },
            },
            orderBy: { userflowid: "desc" },
        });

        const flowIds = flows.map((f) => f.userflowid);

        // FLOW-level fallbacks only (ENTRY + GLOBAL_FALLBACK)
        const flowFallbacks = await prisma.fallback.findMany({
            where: {
                userflowid: { in: flowIds },
                scope: "FLOW",
            },
            select: {
                userflowid: true,
                value: true,         // "ENTRY" | "GLOBAL_FALLBACK"
                contentkeyid: true,
            },
        });

        // group fallbacks by flowid
        const fbMap = new Map();
        for (const fb of flowFallbacks) {
            if (!fbMap.has(fb.userflowid)) fbMap.set(fb.userflowid, []);
            fbMap.get(fb.userflowid).push(fb);
        }

        const mapped = flows.map((f) => {
            let entryKey = null;
            let fallbackKey = null;

            const fbs = fbMap.get(f.userflowid) || [];
            for (const fb of fbs) {
                if (fb.value === "ENTRY") entryKey = fb.contentkeyid;
                if (fb.value === "GLOBAL_FALLBACK") fallbackKey = fb.contentkeyid;
            }

            return {
                userflowid: f.userflowid,
                userflowname: f.userflowname,
                description: f.description || null,
                nodeCount: f._count?.keymapping || 0,
                entryKey,
                fallbackKey,
                status: normalizeFlowStatus(f.status),
                updatedAt: f.updatedat || f.createdat,
                flowType: f.flow_type || "CAMPAIGN",
            };
        });

        return res.json(mapped);
    } catch (err) {
        console.error("listFlows error:", err);
        return res
            .status(500)
            .json({ error: err.message || "Failed to list flows" });
    }
}

/**
 * POST /api/flow/create
 */
export async function createFlowDefinition(req, res) {
    try {
        const {
            userflowname,
            description,
            nodes = [],
            edges = [],
            fallbackEdges = [],
            entryKey,
            fallbackKey,
            flowType,
        } = req.body || {};

        if (!userflowname || !nodes.length) {
            return res.status(400).json({
                error: "userflowname and nodes are required",
            });
        }

        const preparedNodes = [...nodes];

        const hasGF = preparedNodes.some((n) => String(n.key || n.label) === "GLOBAL_FALLBACK");
        if (!hasGF) {
            preparedNodes.unshift({
                key: "GLOBAL_FALLBACK",
                type: "message",
                body: "Sorry, I didn't understand that. Please try again.",
                allowedInputs: [],
                fallbackKey: null,
            });
        }

        const nodeKeySet = new Set(
            preparedNodes
                .map((n) => String(n.key || n.label || "").trim())
                .filter(Boolean)
        );

        const normalizedFlowType = normalizeFlowType(flowType);

        const result = await prisma.$transaction(
            async (tx) => {
                const flow = await tx.userflow.create({
                    data: {
                        userflowname: userflowname.trim(),
                        description: description || null,
                        status: "Draft",
                        flow_type: normalizedFlowType,
                    },
                    select: { userflowid: true, userflowname: true },
                });

            const ufid = flow.userflowid;

            // ---------- 1) nodes ----------
            for (const n of preparedNodes) {
                const key = String(n.key || n.label || "").trim();
                if (!key) continue;

                const placeholders = buildPlaceholdersFromNode(n);
                const ui_metadata = normalizeUiMetadata(n.ui_metadata) || {};
                const body = String(n.body || "").trim();
                const safeType =
                    n.type === "wait_input"
                        ? "message"
                        : n.type === "question"
                            ? "message"
                            : (n.type || "message");

                const content = await tx.content.create({
                    data: {
                        type: safeType,
                        body,
                        description: body || `Node ${key}`,
                        status: "Active",
                        placeholders, // ✅ extra UI fields
                    },
                    select: { contentid: true },
                });

                await tx.keymapping.create({
                    data: {
                        contentkeyid: key,
                        contentid: content.contentid,
                        userflowid: ufid,
                        ui_metadata,
                    },
                });

                // ✅ unique allowedInputs only once
                const uniqueAllowed = Array.from(
                    new Set([...(n.allowedInputs || [])].map((s) => String(s).trim()).filter(Boolean))
                );

                for (const val of uniqueAllowed) {
                    await tx.allowedinput.create({
                        data: {
                            triggerkey: key,
                            allowedvalue: val,
                            userflowid: ufid,
                        },
                    });
                }

            }

            // ---------- 2) edges -> branchrule ----------
            for (const e of edges) {
                const from = String(e.source || "").trim();
                const to = String(e.target || "").trim();
                if (!from || !to) continue;

                const inputvalue = String(e.label || "").trim() || "ANY";

                await tx.branchrule.create({
                    data: {
                        triggerkey: from,
                        inputvalue,
                        nextkey: to,
                        userflowid: ufid,
                        priority: 1,
                    },
                });
            }

            const sanitizedFallbackEdges = Array.isArray(fallbackEdges) ? fallbackEdges : [];
            for (const fe of sanitizedFallbackEdges) {
                const from = String(fe.source || "").trim();
                const to = String(fe.target || "").trim();
                if (!from || !to) continue;
                if (!nodeKeySet.has(from) || !nodeKeySet.has(to)) continue;
                await tx.fallback.create({
                    data: {
                        scope: "NODE",
                        value: from,
                        contentkeyid: to,
                        userflowid: ufid,
                    },
                });
            }

            // ---------- 3) flow fallbacks ----------
            const firstKey = String(preparedNodes[0]?.key || "").trim();

            await tx.fallback.create({
                data: {
                    scope: "FLOW",
                    value: "ENTRY",
                    contentkeyid: String(entryKey || firstKey || "").trim(),
                    userflowid: ufid,
                },
            });

            await tx.fallback.create({
                data: {
                    scope: "FLOW",
                    value: "GLOBAL_FALLBACK",
                    contentkeyid: String(fallbackKey || "GLOBAL_FALLBACK").trim(),
                    userflowid: ufid,
                },
            });

            return flow;
            },
            { maxWait: 5000, timeout: 20000 }
        );

        return res.status(201).json({
            message: "Flow created",
            userflow: result,
        });
    } catch (err) {
        console.error("createFlowDefinition error:", err);
        return res.status(500).json({
            error: err.message || "Failed to create flow",
        });
    }
}

/**
 * GET /api/flow/:id
 */
export async function getFlowDefinition(req, res) {
    try {
        const userflowid = Number(req.params.id);

        if (!userflowid || Number.isNaN(userflowid)) {
            return res.status(400).json({ error: "Invalid userflow id" });
        }

        const flow = await prisma.userflow.findUnique({
            where: { userflowid },
            select: { userflowid: true, userflowname: true, description: true, flow_type: true },
        });

        if (!flow) {
            return res.status(404).json({ error: "Flow not found" });
        }

        // 1) FLOW fallbacks
        const flowFallbacks = await prisma.fallback.findMany({
            where: { userflowid, scope: "FLOW" },
            select: { value: true, contentkeyid: true },
        });

        let entryKey = null;
        let fallbackKey = null;
        for (const fb of flowFallbacks) {
            if (fb.value === "ENTRY") entryKey = fb.contentkeyid;
            if (fb.value === "GLOBAL_FALLBACK") fallbackKey = fb.contentkeyid;
        }

        // 2) keymaps
        const keymaps = await prisma.keymapping.findMany({
            where: { userflowid },
            include: {
                content: {
                    select: {
                        type: true,
                        body: true,
                        description: true,
                        placeholders: true,
                    },
                },
                allowedinput: true,
                branchrule: true,
            },
            orderBy: { contentkeyid: "asc" },
        });

        const nodeKeys = keymaps.map((km) => km.contentkeyid);

        // 3) NODE fallbacks (authoritative)
        const nodeFallbacks = await prisma.fallback.findMany({
            where: {
                userflowid,
                scope: "NODE",
                value: { in: nodeKeys },
            },
            select: { value: true, contentkeyid: true },
        });

        const nodeFbMap = new Map();
        for (const fb of nodeFallbacks) {
            nodeFbMap.set(fb.value, fb.contentkeyid);
        }

        // 4) nodes
        const nodes = keymaps.map((km) => {
            const extras = extractNodeExtras(km.content?.placeholders);

            return {
                key: km.contentkeyid,
                type:
                    km.content?.type === "wait_input"
                        ? "message"
                        : km.content?.type === "question"
                            ? "message"
                            : km.content?.type || "message",
                body: km.content?.body || "",
                description: km.content?.description || "",
                allowedInputs: km.allowedinput.map((ai) => ai.allowedvalue),

                branches: km.branchrule.map((br) => ({
                    input: br.inputvalue,
                    next: br.nextkey,
                })),

                // ✅ real NODE fallback from fallback table
                fallback: nodeFbMap.get(km.contentkeyid) || null,

                ui_metadata: normalizeUiMetadata(km.ui_metadata) || {},

                ...extras,
            };
        });

        return res.json({
            id: flow.userflowid,
            name: flow.userflowname,
            description: flow.description || null,
            entryKey,
            fallbackKey,
            nodes,
            flowType: flow.flow_type || "CAMPAIGN",
        });
    } catch (err) {
        console.error("getFlowDefinition error:", err);
        return res.status(500).json({
            error: err.message || "Failed to load flow definition",
        });
    }
}

/**
 * PUT /api/flow/:id
 */
export async function updateFlowDefinition(req, res) {
    try {
        const userflowid = Number(req.params.id);
        const {
            userflowname,
            description,
            nodes = [],
            edges = [],
            fallbackEdges = [],
            entryKey,
            fallbackKey,
            flowType,
        } = req.body || {};

        if (!userflowid || Number.isNaN(userflowid)) {
            return res.status(400).json({ error: "Invalid userflow id" });
        }
        if (!userflowname || !nodes.length) {
            return res.status(400).json({ error: "Invalid update payload" });
        }

        const preparedNodes = [...nodes];

        // ensure GLOBAL_FALLBACK is always present (required for flow-level fallback FK)
        const hasGlobalFallback = preparedNodes.some(
            (n) => String(n.key || n.label || "").trim() === "GLOBAL_FALLBACK"
        );
        if (!hasGlobalFallback) {
            preparedNodes.unshift({
                key: "GLOBAL_FALLBACK",
                type: "message",
                body: "Sorry, I didn't understand that. Please try again.",
                allowedInputs: [],
                fallbackKey: null,
            });
        }

        const nodeKeySet = new Set(
            preparedNodes
                .map((n) => String(n.key || n.label || "").trim())
                .filter(Boolean)
        );

        await prisma.$transaction(
            async (tx) => {
            const existing = await tx.userflow.findUnique({
                where: { userflowid },
                select: { description: true, flow_type: true },
            });
            if (!existing) throw new Error("Flow not found");

            const normalizedFlowType = flowType
                ? normalizeFlowType(flowType)
                : existing.flow_type || "CAMPAIGN";

            await tx.userflow.update({
                where: { userflowid },
                data: {
                    userflowname: userflowname.trim(),
                    description:
                        description !== undefined ? description : existing.description,
                    updatedat: new Date(),
                    flow_type: normalizedFlowType,
                },
            });

            // delete old graph
            const oldMaps = await tx.keymapping.findMany({
                where: { userflowid },
                select: { contentid: true },
            });
            const oldContentIds = oldMaps.map((m) => m.contentid);

            await tx.allowedinput.deleteMany({ where: { userflowid } });
            await tx.branchrule.deleteMany({ where: { userflowid } });
            await tx.fallback.deleteMany({ where: { userflowid } });
            await tx.keymapping.deleteMany({ where: { userflowid } });

            if (oldContentIds.length) {
                await tx.content.deleteMany({
                    where: { contentid: { in: oldContentIds } },
                });
            }

            // recreate nodes
            for (const n of preparedNodes) {
                const key = String(n.key || n.label || "").trim();
                if (!key) continue;

                const placeholders = buildPlaceholdersFromNode(n);
                const ui_metadata = normalizeUiMetadata(n.ui_metadata) || {};
                const body = String(n.body || "").trim();
                const safeType =
                    n.type === "wait_input"
                        ? "message"
                        : n.type === "question"
                            ? "message"
                            : (n.type || "message");

                const content = await tx.content.create({
                    data: {
                        type: safeType,
                        body,
                        description: body || `Node ${key}`,
                        status: "Active",
                        placeholders,
                    },
                    select: { contentid: true },
                });

                await tx.keymapping.create({
                    data: {
                        contentkeyid: key,
                        contentid: content.contentid,
                        userflowid,
                        ui_metadata,
                    },
                });

                const uniqueAllowed = Array.from(
                    new Set([...(n.allowedInputs || [])].map((s) => String(s).trim()).filter(Boolean))
                );

                for (const val of uniqueAllowed) {
                    await tx.allowedinput.create({
                        data: {
                            triggerkey: key,
                            allowedvalue: val,
                            userflowid,
                        },
                    });
                }

            }

            // recreate edges
            for (const e of edges) {
                const from = String(e.source || "").trim();
                const to = String(e.target || "").trim();
                if (!from || !to) continue;

                const inputvalue = String(e.label || "").trim() || "ANY";

                await tx.branchrule.create({
                    data: {
                        triggerkey: from,
                        inputvalue,
                        nextkey: to,
                        userflowid,
                        priority: 1,
                    },
                });
            }

            const sanitizedFallbackEdges = Array.isArray(fallbackEdges) ? fallbackEdges : [];
            for (const fe of sanitizedFallbackEdges) {
                const from = String(fe.source || "").trim();
                const to = String(fe.target || "").trim();
                if (!from || !to) continue;
                if (!nodeKeySet.has(from) || !nodeKeySet.has(to)) continue;
                await tx.fallback.create({
                    data: {
                        scope: "NODE",
                        value: from,
                        contentkeyid: to,
                        userflowid,
                    },
                });
            }

            // flow fallbacks
            const firstKey = String(preparedNodes[0]?.key || "").trim();
            const safeEntryKey = nodeKeySet.has(String(entryKey || "").trim())
                ? String(entryKey || "").trim()
                : firstKey;
            const defaultFallbackKey = nodeKeySet.has("GLOBAL_FALLBACK")
                ? "GLOBAL_FALLBACK"
                : firstKey;
            const safeFallbackKey = nodeKeySet.has(String(fallbackKey || "").trim())
                ? String(fallbackKey || "").trim()
                : defaultFallbackKey;

            await tx.fallback.create({
                data: {
                    scope: "FLOW",
                    value: "ENTRY",
                    contentkeyid: safeEntryKey,
                    userflowid,
                },
            });

            await tx.fallback.create({
                data: {
                    scope: "FLOW",
                    value: "GLOBAL_FALLBACK",
                    contentkeyid: safeFallbackKey,
                    userflowid,
                },
            });
        },
            { maxWait: 5000, timeout: 20000 }
        );

        return res.json({ message: "Flow updated" });
    } catch (err) {
        console.error("updateFlowDefinition error:", err);
        return res.status(500).json({
            error: err.message || "Failed to update flow",
        });
    }
}

export async function updateFlowStatus(req, res) {
    try {
        const userflowid = Number(req.params.id);
        const { status } = req.body || {};

        if (!userflowid || Number.isNaN(userflowid)) {
            return res.status(400).json({ error: "Invalid userflow id" });
        }

        const rawStatus = typeof status === "string" ? status.trim() : "";
        const normalizedStatus =
            rawStatus.toLowerCase() === "active"
                ? "Active"
                : rawStatus.toLowerCase() === "draft"
                    ? "Draft"
                    : null;

        if (!normalizedStatus) {
            return res.status(400).json({ error: "Invalid status value" });
        }

        await prisma.userflow.update({
            where: { userflowid },
            data: {
                status: normalizedStatus,
                updatedat: new Date(),
            },
        });

        return res.json({ message: "Flow status updated", status: normalizedStatus });
    } catch (err) {
        console.error("updateFlowStatus error:", err);
        return res.status(500).json({
            error: err.message || "Failed to update flow status",
        });
    }
}

/**
 * DELETE /api/flow/:id
 * Removes a flow and all related records (nodes, rules, fallbacks, sessions, transitions, keywords, system flows, campaigns).
 */
export async function deleteFlowDefinition(req, res) {
    try {
        const userflowid = Number(req.params.id);
        if (!userflowid || Number.isNaN(userflowid)) {
            return res.status(400).json({ error: "Invalid userflow id" });
        }

        const existing = await prisma.userflow.findUnique({
            where: { userflowid },
            select: { userflowid: true },
        });
        if (!existing) {
            return res.status(404).json({ error: "Flow not found" });
        }

        await prisma.$transaction(
            async (tx) => {
                // gather content ids for cleanup
                const keymaps = await tx.keymapping.findMany({
                    where: { userflowid },
                    select: { contentid: true },
                });
                const contentIds = keymaps.map((k) => k.contentid);

                // delete dependent records
                await tx.campaignsession.deleteMany({
                    where: { current_userflowid: userflowid },
                });
                await tx.campaign.deleteMany({
                    where: { userflowid },
                });
                await tx.system_keyword.deleteMany({
                    where: { userflowid },
                });
                await tx.system_flow.deleteMany({
                    where: { userflowid },
                });
                await tx.flow_transition.deleteMany({
                    where: {
                        OR: [{ from_userflowid: userflowid }, { to_userflowid: userflowid }],
                    },
                });
                await tx.fallback.deleteMany({ where: { userflowid } });
                await tx.branchrule.deleteMany({ where: { userflowid } });
                await tx.allowedinput.deleteMany({ where: { userflowid } });
                await tx.keymapping.deleteMany({ where: { userflowid } });

                if (contentIds.length) {
                    await tx.content.deleteMany({
                        where: { contentid: { in: contentIds } },
                    });
                }

                await tx.userflow.delete({
                    where: { userflowid },
                });
            },
            { maxWait: 5000, timeout: 20000 }
        );

        return res.json({ message: "Flow deleted" });
    } catch (err) {
        console.error("deleteFlowDefinition error:", err);
        return res.status(500).json({
            error: err.message || "Failed to delete flow",
        });
    }
}

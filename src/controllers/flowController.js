import prisma from "../config/prismaClient.js";

export async function listFlows(req, res) {
    try {
        const flows = await prisma.userflow.findMany({
            orderBy: { userflowid: "asc" },
            select: {
                userflowid: true,
                userflowname: true,
                keymapping: {
                    select: {
                        contentkeyid: true,
                        content: {
                            select: {
                                updatedat: true,
                                createdat: true,
                            },
                        },
                    },
                },
                fallback: {
                    select: {
                        scope: true,
                        value: true,
                        contentkeyid: true,
                    },
                },
            },
        });

        const mapped = flows.map((f) => {
            const entry = f.fallback.find(
                (fb) => fb.scope === "FLOW" && fb.value === "ENTRY"
            );
            const globalFb = f.fallback.find(
                (fb) => fb.scope === "FLOW" && fb.value === "GLOBAL_FALLBACK"
            );

            const nodeCount = f.keymapping.length;

            // take the latest content updatedat/createdat as "updatedAt"
            let latest = null;
            for (const km of f.keymapping) {
                const ts = km.content.updatedat || km.content.createdat;
                if (!ts) continue;
                if (!latest || ts > latest) latest = ts;
            }

            return {
                userflowid: f.userflowid,
                userflowname: f.userflowname,
                nodeCount,
                entryKey: entry?.contentkeyid ?? null,
                fallbackKey: globalFb?.contentkeyid ?? null,
                status: "Active", // you can later make this real if you add a column
                updatedAt: latest ? latest.toISOString() : null,
            };
        });

        return res.status(200).json(mapped);
    } catch (err) {
        console.error("listFlows error:", err);
        return res.status(500).json({ error: err.message || "Failed to list flows" });
    }
}

/**
 * POST /api/flows
 *
 * Body: FlowCreatePayload
 * - userflowname: string
 * - entryKey: string
 * - fallbackKey: string
 * - description?: string | null
 * - nodes: [
 *     {
 *       key: string;
 *       type: string;
 *       content: string;
 *       allowedInputs?: string[];
 *       branches?: { input: string; next: string }[];
 *       fallbackKey?: string | null;
 *     }
 *   ]
 */
export async function createFlowDefinition(req, res) {
    try {
        const payload = req.body || {};
        const {
            userflowname,
            entryKey,
            fallbackKey,
            description,
            nodes,
        } = payload;

        // Basic validation
        if (!userflowname || typeof userflowname !== "string") {
            return res.status(400).json({ error: "userflowname is required" });
        }
        if (!Array.isArray(nodes) || nodes.length === 0) {
            return res.status(400).json({ error: "At least one node is required" });
        }

        const trimmedName = userflowname.trim();

        // Extra defensive checks (mirroring your frontend validate)
        const keys = nodes.map((n) => (n.key || "").trim());
        if (keys.some((k) => !k)) {
            return res.status(400).json({
                error: "Every node must have a non-empty key (CONTENT_KEY).",
            });
        }

        const lowerKeys = keys.map((k) => k.toLowerCase());
        const hasDuplicates = lowerKeys.some(
            (k, idx) => lowerKeys.indexOf(k) !== idx
        );
        if (hasDuplicates) {
            return res.status(400).json({
                error: "Duplicate node keys found. CONTENT_KEY must be unique per flow.",
            });
        }

        const entryKeyLower = (entryKey || "").trim().toLowerCase();
        const fallbackKeyLower = (fallbackKey || "").trim().toLowerCase();

        if (!lowerKeys.includes(entryKeyLower)) {
            return res.status(400).json({
                error:
                    'Entry content key must match one of the node keys defined in "nodes".',
            });
        }
        if (!lowerKeys.includes(fallbackKeyLower)) {
            return res.status(400).json({
                error:
                    'Fallback content key must match one of the node keys defined in "nodes".',
            });
        }

        // Main transaction
        const result = await prisma.$transaction(async (tx) => {
            // 1) Create userflow
            const userflow = await tx.userflow.create({
                data: {
                    userflowname: trimmedName,
                },
                select: {
                    userflowid: true,
                    userflowname: true,
                },
            });

            const ufid = userflow.userflowid;

            // 2) For each node, create content + keymapping
            for (const rawNode of nodes) {
                const nodeKey = (rawNode.key || "").trim();
                const nodeType = (rawNode.type || "message").trim();
                const nodeContent = (rawNode.content || "").trim();
                const descriptionText =
                    description && description.trim().length > 0
                        ? description.trim()
                        : `Node ${nodeKey} in flow ${trimmedName}`;

                const content = await tx.content.create({
                    data: {
                        type: nodeType, // e.g. 'message', 'question', 'api', 'decision'
                        body: nodeContent,
                        description: descriptionText,
                        status: "Active",
                    },
                    select: {
                        contentid: true,
                    },
                });

                await tx.keymapping.create({
                    data: {
                        contentkeyid: nodeKey,
                        contentid: content.contentid,
                        userflowid: ufid,
                    },
                });
            }

            // 3) Configure allowedinput + branchrule + fallback per node
            for (const rawNode of nodes) {
                const nodeKey = (rawNode.key || "").trim();
                const nodeAllowed = Array.isArray(rawNode.allowedInputs)
                    ? rawNode.allowedInputs
                    : [];
                const nodeBranches = Array.isArray(rawNode.branches)
                    ? rawNode.branches
                    : [];
                const nodeFallbackKey = rawNode.fallbackKey
                    ? rawNode.fallbackKey.trim()
                    : null;

                // allowedinput rows
                for (const value of nodeAllowed) {
                    const val = (value || "").trim();
                    if (!val) continue;

                    await tx.allowedinput.create({
                        data: {
                            triggerkey: nodeKey,
                            allowedvalue: val,
                            userflowid: ufid,
                        },
                    });
                }

                // branchrule rows
                for (const br of nodeBranches) {
                    const inputVal = (br.input || "").trim();
                    const nextKey = (br.next || "").trim();
                    if (!inputVal || !nextKey) continue;

                    await tx.branchrule.create({
                        data: {
                            triggerkey: nodeKey,
                            inputvalue: inputVal,
                            nextkey: nextKey,
                            userflowid: ufid,
                        },
                    });
                }

                // node-level fallback: scope = "NODE"
                if (nodeFallbackKey) {
                    await tx.fallback.create({
                        data: {
                            scope: "NODE",
                            value: nodeKey, // "this node's fallback config"
                            contentkeyid: nodeFallbackKey,
                            userflowid: ufid,
                        },
                    });
                }
            }

            // 4) (Optional) Flow-level metadata for entry + global fallback
            // We re-use the "fallback" table for conceptual flow config.
            // - scope = "FLOW"
            // - value = "ENTRY" or "GLOBAL_FALLBACK"
            await tx.fallback.create({
                data: {
                    scope: "FLOW",
                    value: "ENTRY",
                    contentkeyid: entryKey.trim(),
                    userflowid: ufid,
                },
            });

            await tx.fallback.create({
                data: {
                    scope: "FLOW",
                    value: "GLOBAL_FALLBACK",
                    contentkeyid: fallbackKey.trim(),
                    userflowid: ufid,
                },
            });

            return userflow;
        });

        return res.status(201).json({
            message: "Flow created",
            userflow: result,
        });
    } catch (err) {
        console.error("createFlowDefinition error:", err);
        return res.status(500).json({
            error: err?.message || "Failed to create flow definition",
        });
    }
}

export async function getFlowDefinition(req, res) {
    try {
        const rawId = req.params.id;
        const userflowid = Number(rawId);

        if (!userflowid || Number.isNaN(userflowid)) {
            return res.status(400).json({ error: "Invalid userflow id" });
        }

        // 1) Load basic userflow
        const userflow = await prisma.userflow.findUnique({
            where: { userflowid },
        });

        if (!userflow) {
            return res.status(404).json({ error: "Flow not found" });
        }

        // 2) Load flow-level fallbacks (ENTRY + GLOBAL_FALLBACK)
        const flowFallbacks = await prisma.fallback.findMany({
            where: { userflowid, scope: "FLOW" },
        });

        let entryKey = "START";
        let fallbackKey = "FALLBACK";

        for (const fb of flowFallbacks) {
            if (fb.value === "ENTRY" && fb.contentkeyid) {
                entryKey = fb.contentkeyid;
            }
            if (fb.value === "GLOBAL_FALLBACK" && fb.contentkeyid) {
                fallbackKey = fb.contentkeyid;
            }
        }

        // 3) Load nodes: keymapping + content + allowedinput + branchrule + node-level fallback
        const keymaps = await prisma.keymapping.findMany({
            where: { userflowid },
            include: {
                content: {
                    select: {
                        type: true,
                        body: true,
                        description: true,
                    },
                },
                allowedinput: true,
                branchrule: true,
                fallback: {
                    where: { scope: "NODE" },
                },
            },
            orderBy: { contentkeyid: "asc" },
        });

        const nodes = keymaps.map((km) => {
            const c = km.content || {};
            const nodeDescription = c.body || c.description || "";

            return {
                key: km.contentkeyid,
                type: c.type || "message",
                description: nodeDescription,
                allowedInputs: km.allowedinput.map((ai) => ai.allowedvalue),
                branches: km.branchrule.map((br) => ({
                    input: br.inputvalue,
                    next: br.nextkey,
                })),
                fallback:
                    km.fallback && km.fallback.length > 0
                        ? km.fallback[0].contentkeyid
                        : null,
            };
        });

        return res.json({
            id: userflow.userflowid,
            name: userflow.userflowname,
            entryKey,
            fallbackKey,
            nodes,
        });
    } catch (err) {
        console.error("getFlowDefinition error:", err);
        return res.status(500).json({
            error: err?.message || "Failed to load flow definition",
        });
    }
}

export async function updateFlowDefinition(req, res) {
    try {
        const rawId = req.params.id;
        const userflowid = Number(rawId);

        if (!userflowid || Number.isNaN(userflowid)) {
            return res.status(400).json({ error: "Invalid userflow id" });
        }

        const payload = req.body || {};
        const { userflowname, entryKey, fallbackKey, description, nodes } = payload;

        if (!userflowname || typeof userflowname !== "string") {
            return res.status(400).json({ error: "userflowname is required" });
        }
        if (!Array.isArray(nodes) || nodes.length === 0) {
            return res.status(400).json({ error: "At least one node is required" });
        }

        const trimmedName = userflowname.trim();

        const keys = nodes.map((n) => (n.key || "").trim());
        if (keys.some((k) => !k)) {
            return res.status(400).json({
                error: "Every node must have a non-empty key (CONTENT_KEY).",
            });
        }

        const lowerKeys = keys.map((k) => k.toLowerCase());
        const hasDuplicates = lowerKeys.some(
            (k, idx) => lowerKeys.indexOf(k) !== idx
        );
        if (hasDuplicates) {
            return res.status(400).json({
                error: "Duplicate node keys found. CONTENT_KEY must be unique per flow.",
            });
        }

        const entryKeyLower = (entryKey || "").trim().toLowerCase();
        const fallbackKeyLower = (fallbackKey || "").trim().toLowerCase();

        if (!lowerKeys.includes(entryKeyLower)) {
            return res.status(400).json({
                error:
                    'Entry content key must match one of the node keys defined in "nodes".',
            });
        }
        if (!lowerKeys.includes(fallbackKeyLower)) {
            return res.status(400).json({
                error:
                    'Fallback content key must match one of the node keys defined in "nodes".',
            });
        }

        await prisma.$transaction(async (tx) => {
            // Ensure flow exists
            const existing = await tx.userflow.findUnique({
                where: { userflowid },
            });
            if (!existing) {
                throw new Error("Flow not found");
            }

            // 1) Update basic userflow info
            await tx.userflow.update({
                where: { userflowid },
                data: { userflowname: trimmedName },
            });

            // 2) Delete old nodes + rules
            const oldMappings = await tx.keymapping.findMany({
                where: { userflowid },
                select: { contentid: true },
            });
            const oldContentIds = oldMappings.map((m) => m.contentid);

            await tx.allowedinput.deleteMany({ where: { userflowid } });
            await tx.branchrule.deleteMany({ where: { userflowid } });
            await tx.fallback.deleteMany({ where: { userflowid } });
            await tx.keymapping.deleteMany({ where: { userflowid } });

            if (oldContentIds.length > 0) {
                await tx.content.deleteMany({
                    where: { contentid: { in: oldContentIds } },
                });
            }

            // 3) Re-create nodes
            for (const rawNode of nodes) {
                const nodeKey = (rawNode.key || "").trim();
                const nodeType = (rawNode.type || "message").trim();
                const nodeContent = (rawNode.content || "").trim();
                const descriptionText =
                    description && description.trim().length > 0
                        ? description.trim()
                        : `Node ${nodeKey} in flow ${trimmedName}`;

                const content = await tx.content.create({
                    data: {
                        type: nodeType,
                        body: nodeContent,
                        description: descriptionText,
                        status: "Active",
                    },
                    select: { contentid: true },
                });

                await tx.keymapping.create({
                    data: {
                        contentkeyid: nodeKey,
                        contentid: content.contentid,
                        userflowid,
                    },
                });

                const nodeAllowed = Array.isArray(rawNode.allowedInputs)
                    ? rawNode.allowedInputs
                    : [];
                const nodeBranches = Array.isArray(rawNode.branches)
                    ? rawNode.branches
                    : [];
                const nodeFallbackKey = rawNode.fallbackKey
                    ? rawNode.fallbackKey.trim()
                    : null;

                // allowedinput
                for (const value of nodeAllowed) {
                    const val = (value || "").trim();
                    if (!val) continue;

                    await tx.allowedinput.create({
                        data: {
                            triggerkey: nodeKey,
                            allowedvalue: val,
                            userflowid,
                        },
                    });
                }

                // branchrule
                for (const br of nodeBranches) {
                    const inputVal = (br.input || "").trim();
                    const nextKey = (br.next || "").trim();
                    if (!inputVal || !nextKey) continue;

                    await tx.branchrule.create({
                        data: {
                            triggerkey: nodeKey,
                            inputvalue: inputVal,
                            nextkey: nextKey,
                            userflowid,
                        },
                    });
                }

                // node-level fallback
                if (nodeFallbackKey) {
                    await tx.fallback.create({
                        data: {
                            scope: "NODE",
                            value: nodeKey,
                            contentkeyid: nodeFallbackKey,
                            userflowid,
                        },
                    });
                }
            }

            // 4) Recreate flow-level ENTRY / GLOBAL_FALLBACK
            await tx.fallback.create({
                data: {
                    scope: "FLOW",
                    value: "ENTRY",
                    contentkeyid: entryKey.trim(),
                    userflowid,
                },
            });

            await tx.fallback.create({
                data: {
                    scope: "FLOW",
                    value: "GLOBAL_FALLBACK",
                    contentkeyid: fallbackKey.trim(),
                    userflowid,
                },
            });
        });

        return res.status(200).json({ message: "Flow updated" });
    } catch (err) {
        console.error("updateFlowDefinition error:", err);
        return res.status(500).json({
            error: err?.message || "Failed to update flow definition",
        });
    }
}

// src/controllers/systemFlowController.js
import prisma from "../config/prismaClient.js";

/**
 * SYSTEM FLOWS
 * model: system_flow(code UNIQUE, userflowid FK)
 */

// GET /api/system/flows
export async function listSystemFlows(req, res) {
    try {
        const rows = await prisma.system_flow.findMany({
            include: {
                userflow: { select: { userflowid: true, userflowname: true } },
            },
            orderBy: { systemflowid: "desc" },
        });

        return res.json(
            rows.map((r) => ({
                systemflowid: r.systemflowid,
                code: r.code,
                userflowid: r.userflowid,
                userflowname: r.userflow?.userflowname || "",
                is_active: r.is_active,
                createdat: r.createdat,
            }))
        );
    } catch (err) {
        console.error("listSystemFlows error:", err);
        return res.status(500).json({ error: err.message });
    }
}

// GET /api/system/start-flow
export async function getActiveSystemStartFlow(_req, res) {
    try {
        const startFlow = await prisma.system_flow.findFirst({
            where: { code: "START", is_active: true },
            select: { systemflowid: true, userflowid: true },
        });

        return res.json(startFlow || null);
    } catch (err) {
        console.error("getActiveSystemStartFlow error:", err);
        return res.status(500).json({ error: err.message });
    }
}

// POST /api/system/start-flow
export async function setActiveSystemStartFlow(req, res) {
    try {
        const { userflowid } = req.body || {};
        const ufid = Number(userflowid);

        if (!ufid || Number.isNaN(ufid)) {
            return res.status(400).json({ error: "userflowid is required" });
        }

        const exists = await prisma.userflow.findUnique({
            where: { userflowid: ufid },
            select: { userflowid: true, flow_type: true },
        });

        if (!exists) {
            return res.status(404).json({ error: "userflow not found" });
        }
        if ((exists.flow_type || "").toUpperCase() !== "START") {
            return res
                .status(400)
                .json({ error: "Selected flow is not categorized as START." });
        }

        const start = await prisma.$transaction(async (tx) => {
            await tx.system_flow.updateMany({
                where: { code: "START" },
                data: { is_active: false },
            });

            return tx.system_flow.upsert({
                where: { code: "START" },
                update: { userflowid: ufid, is_active: true },
                create: {
                    code: "START",
                    userflowid: ufid,
                    is_active: true,
                },
            });
        });

        return res.json({
            systemflowid: start.systemflowid,
            userflowid: start.userflowid,
        });
    } catch (err) {
        console.error("setActiveSystemStartFlow error:", err);
        return res.status(500).json({ error: err.message });
    }
}

// GET /api/system/end-flow
export async function getActiveSystemEndFlow(_req, res) {
    try {
        const endFlow = await prisma.system_flow.findFirst({
            where: { code: "END", is_active: true },
            select: { systemflowid: true, userflowid: true },
        });

        return res.json(endFlow || null);
    } catch (err) {
        console.error("getActiveSystemEndFlow error:", err);
        return res.status(500).json({ error: err.message });
    }
}

// POST /api/system/end-flow
export async function setActiveSystemEndFlow(req, res) {
    try {
        const { userflowid } = req.body || {};
        const ufid = Number(userflowid);

        if (!ufid || Number.isNaN(ufid)) {
            return res.status(400).json({ error: "userflowid is required" });
        }

        const exists = await prisma.userflow.findUnique({
            where: { userflowid: ufid },
            select: { userflowid: true, flow_type: true },
        });

        if (!exists) {
            return res.status(404).json({ error: "userflow not found" });
        }
        if ((exists.flow_type || "").toUpperCase() !== "END") {
            return res
                .status(400)
                .json({ error: "Selected flow is not categorized as END." });
        }

        const end = await prisma.$transaction(async (tx) => {
            await tx.system_flow.updateMany({
                where: { code: "END" },
                data: { is_active: false },
            });

            return tx.system_flow.upsert({
                where: { code: "END" },
                update: { userflowid: ufid, is_active: true },
                create: {
                    code: "END",
                    userflowid: ufid,
                    is_active: true,
                },
            });
        });

        return res.json({
            systemflowid: end.systemflowid,
            userflowid: end.userflowid,
        });
    } catch (err) {
        console.error("setActiveSystemEndFlow error:", err);
        return res.status(500).json({ error: err.message });
    }
}

// POST /api/system/flows
export async function createSystemFlow(req, res) {
    try {
        const { code, userflowid, is_active = true } = req.body || {};
        if (!code || !userflowid) {
            return res.status(400).json({ error: "code and userflowid are required" });
        }

        const created = await prisma.system_flow.create({
            data: {
                code: code.trim(),
                userflowid: Number(userflowid),
                is_active: !!is_active,
            },
        });

        return res.status(201).json(created);
    } catch (err) {
        console.error("createSystemFlow error:", err);
        return res.status(500).json({ error: err.message });
    }
}

// PUT /api/system/flows/:id
export async function updateSystemFlow(req, res) {
    try {
        const id = Number(req.params.id);
        const { code, userflowid, is_active } = req.body || {};

        const updated = await prisma.system_flow.update({
            where: { systemflowid: id },
            data: {
                code: code?.trim(),
                userflowid: userflowid != null ? Number(userflowid) : undefined,
                is_active: is_active != null ? !!is_active : undefined,
            },
        });

        return res.json(updated);
    } catch (err) {
        console.error("updateSystemFlow error:", err);
        return res.status(500).json({ error: err.message });
    }
}

// DELETE /api/system/flows/:id
export async function deleteSystemFlow(req, res) {
    try {
        const id = Number(req.params.id);

        // Optional safety: block delete if keywords reference it
        const refCount = await prisma.system_keyword.count({
            where: { systemflowid: id },
        });
        if (refCount > 0) {
            return res.status(400).json({
                error: "Cannot delete: referenced by system_keyword rows",
            });
        }

        await prisma.system_flow.delete({
            where: { systemflowid: id },
        });

        return res.json({ ok: true });
    } catch (err) {
        console.error("deleteSystemFlow error:", err);
        return res.status(500).json({ error: err.message });
    }
}

/**
 * SYSTEM KEYWORDS
 * model: system_keyword(keyword PK, userflowid, systemflowid nullable)
 */

// GET /api/system/keywords
export async function listSystemKeywords(req, res) {
    try {
        const rows = await prisma.system_keyword.findMany({
            include: {
                userflow: { select: { userflowid: true, userflowname: true } },
                system_flow: { select: { systemflowid: true, code: true } },
            },
            orderBy: { createdat: "desc" },
        });

        return res.json(
            rows.map((r) => ({
                keyword: r.keyword,
                userflowid: r.userflowid,
                userflowname: r.userflow?.userflowname || "",
                systemflowid: r.systemflowid || null,
                systemflowcode: r.system_flow?.code || null,
                is_active: r.is_active,
                createdat: r.createdat,
            }))
        );
    } catch (err) {
        console.error("listSystemKeywords error:", err);
        return res.status(500).json({ error: err.message });
    }
}

// POST /api/system/keywords
export async function createSystemKeyword(req, res) {
    try {
        const { keyword, userflowid, systemflowid = null, is_active = true } =
            req.body || {};

        if (!keyword || !userflowid) {
            return res
                .status(400)
                .json({ error: "keyword and userflowid are required" });
        }

        const created = await prisma.system_keyword.create({
            data: {
                keyword: keyword.trim(),
                userflowid: Number(userflowid),
                systemflowid: systemflowid ? Number(systemflowid) : null,
                is_active: !!is_active,
            },
        });

        return res.status(201).json(created);
    } catch (err) {
        console.error("createSystemKeyword error:", err);
        return res.status(500).json({ error: err.message });
    }
}

// PUT /api/system/keywords/:keyword
export async function updateSystemKeyword(req, res) {
    try {
        const oldKeyword = req.params.keyword;
        const { keyword, userflowid, systemflowid = null, is_active } =
            req.body || {};

        // keyword is PK, allow update of other fields only
        const updated = await prisma.system_keyword.update({
            where: { keyword: oldKeyword },
            data: {
                userflowid: userflowid != null ? Number(userflowid) : undefined,
                systemflowid:
                    systemflowid === null || systemflowid === ""
                        ? null
                        : Number(systemflowid),
                is_active: is_active != null ? !!is_active : undefined,
            },
        });

        return res.json(updated);
    } catch (err) {
        console.error("updateSystemKeyword error:", err);
        return res.status(500).json({ error: err.message });
    }
}

// DELETE /api/system/keywords/:keyword
export async function deleteSystemKeyword(req, res) {
    try {
        const kw = req.params.keyword;
        await prisma.system_keyword.delete({ where: { keyword: kw } });
        return res.json({ ok: true });
    } catch (err) {
        console.error("deleteSystemKeyword error:", err);
        return res.status(500).json({ error: err.message });
    }
}

// src/controllers/systemController.js

import { prisma } from "../config/prismaClient.js";

// GET /api/system/whatsapp-config
export async function getWhatsAppConfig(req, res) {
    try {
        const config = await prisma.whatsapp_config.findFirst({
            where: { is_active: true },
            orderBy: { id: "desc" },
        });

        if (!config) {
            // Default values for first-time setup
            return res.json({
                display_name: "",
                phone_number: "",
                phone_number_id: "",
                waba_id: "",
                verify_token: "",
                api_version: "v21.0",
                is_active: true,
            });
        }

        return res.json(config);
    } catch (err) {
        console.error("getWhatsAppConfig error:", err);
        return res.status(500).json({ message: err.message });
    }
}

// PUT /api/system/whatsapp-config
export async function upsertWhatsAppConfig(req, res) {
    try {
        const body = req.body || {};

        const {
            id,
            display_name,
            phone_number,
            phone_number_id,
            waba_id,
            verify_token,
            api_version,
            is_active,
        } = body;

        if (!phone_number || !phone_number_id || !verify_token) {
            return res.status(400).json({
                message: "phone_number, phone_number_id and verify_token are required.",
            });
        }

        // TODO: get current admin id from auth middleware/session
        const updatedByAdminId = null;

        const data = {
            display_name: display_name ?? null,
            phone_number,
            phone_number_id,
            waba_id: waba_id ?? null,
            verify_token,
            api_version: api_version || "v21.0",
            is_active: is_active ?? true,
            updatedat: new Date(),
            updatedby_adminid: updatedByAdminId,
        };

        let result;

        if (id) {
            // Update existing row
            result = await prisma.whatsapp_config.update({
                where: { id: Number(id) },
                data,
            });
        } else {
            // (Optional) deactivate existing rows if you only ever want 1 active config
            // await prisma.whatsapp_config.updateMany({
            //   where: { is_active: true },
            //   data: { is_active: false },
            // });

            result = await prisma.whatsapp_config.create({ data });
        }

        return res.json(result);
    } catch (err) {
        console.error("upsertWhatsAppConfig error:", err);
        return res.status(500).json({ message: err.message });
    }
}

// GET /api/system/tokens
export async function listTokens(req, res) {
    try {
        const tokens = await prisma.session_token.findMany({
            orderBy: [{ is_revoked: "asc" }, { issued_at: "desc" }],
            include: {
                admin: {
                    select: { admin_id: true, name: true, email: true, role: true },
                },
            },
        });

        const normalized = tokens.map((t) => ({
            tokenid: t.token_id,
            adminid: t.admin_id,
            admin: t.admin
                ? { id: t.admin.admin_id, name: t.admin.name, email: t.admin.email, role: t.admin.role }
                : null,
            roletype: t.role_type,
            issuedat: t.issued_at,
            expiryat: t.expiry_at,
            lastusedat: t.last_used_at,
            is_revoked: t.is_revoked,
            createdby: t.created_by,
        }));

        return res.json(normalized);
    } catch (err) {
        console.error("listTokens error:", err);
        return res.status(500).json({ message: err.message });
    }
}

// GET /api/system/security-logs
export async function listSecurityLogs(req, res) {
    try {
        const limit = Math.min(Number(req.query.limit) || 200, 500);
        const logs = await prisma.token_log.findMany({
            orderBy: { log_time: "desc" },
            take: limit,
            include: {
                session_token: {
                    select: {
                        token_id: true,
                        role_type: true,
                        admin: { select: { admin_id: true, name: true, email: true, role: true } },
                    },
                },
            },
        });

        const normalized = logs.map((log) => ({
            logid: log.log_id,
            action: log.action,
            ipaddress: log.ip_address,
            useragent: log.user_agent,
            logtime: log.log_time,
            tokenid: log.token_id,
            role: log.session_token?.role_type || null,
            admin: log.session_token?.admin
                ? {
                      id: log.session_token.admin.admin_id,
                      name: log.session_token.admin.name,
                      email: log.session_token.admin.email,
                      role: log.session_token.admin.role,
                  }
                : null,
        }));

        return res.json(normalized);
    } catch (err) {
        console.error("listSecurityLogs error:", err);
        return res.status(500).json({ message: err.message });
    }
}

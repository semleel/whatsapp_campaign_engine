// src/controllers/sessionController.js

import { prisma } from "../config/prismaClient.js";

/**
 * Helper: map DB session to API shape
 */
function deriveCheckpoint(session) {
    if (session?.last_payload_type === "system_feedback") {
        return "Feedback";
    }
    const primaryStep = session?.campaign_step;
    const responseStep = session?.campaign_response?.[0]?.campaign_step;
    const step = primaryStep || responseStep;
    if (!step) return session?.checkpoint ?? null; // fallback if column exists in some envs
    if (step.step_code) return step.step_code;
    if (typeof step.step_number === "number") return `Step ${step.step_number}`;
    return null;
}

const sessionInclude = {
    campaign: true,
    contact: true,
    campaign_step: { select: { step_code: true, step_number: true } },
    campaign_response: {
        orderBy: { created_at: "desc" },
        take: 1,
        include: {
            campaign_step: { select: { step_code: true, step_number: true } },
        },
    },
};

const SESSION_STATUS = {
  ACTIVE: "ACTIVE",
  PAUSED: "PAUSED",
  COMPLETED: "COMPLETED",
  EXPIRED: "EXPIRED",
  CANCELLED: "CANCELLED",
};

function formatSession(s) {
    return {
        id: s.campaign_session_id,
        contactid: s.contact_id,
        campaignid: s.campaign_id,
        campaignname:
            s.campaign?.campaign_name ??
            (s.last_payload_type === "system_feedback" ? "Feedback" : null),
        contact_phonenum: s.contact?.phone_num ?? null,
        checkpoint: deriveCheckpoint(s),
        status: s.session_status ?? "ACTIVE",
        createdAt: s.created_at ?? null,
        lastActiveAt: s.last_active_at ?? null,
    };
}


/**
 * GET /api/session/list
 */
export async function listSessions(req, res) {
    try {
        const sessions = await prisma.campaign_session.findMany({
            include: sessionInclude,
            orderBy: { last_active_at: "desc" },
            take: 1000,
        });

        return res.status(200).json(sessions.map(formatSession));
    } catch (err) {
        console.error("listSessions error:", err);
        return res.status(500).json({ error: err.message });
    }
}

/**
 * GET /api/session/:id
 */
export async function getSession(req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });

        const s = await prisma.campaign_session.findUnique({
            where: { campaign_session_id: id },
            include: {
                ...sessionInclude,
                message: { orderBy: { created_at: "asc" }, take: 500 },
                session_log: { orderBy: { logged_at: "asc" }, take: 200 },
            },
        });

        if (!s) return res.status(404).json({ error: "Session not found" });

        return res.status(200).json(formatSession(s));
    } catch (err) {
        console.error("getSession error:", err);
        return res.status(500).json({ error: err.message });
    }
}

/**
 * POST /api/session/create
 * Body: { contactid, campaignid }
 */
export async function createSession(req, res) {
    try {
        const { contactid, campaignid } = req.body;
        if (!contactid || !campaignid) {
            return res
                .status(400)
                .json({ error: "contactid and campaignid are required" });
        }

        // Because of unique constraint contactid+campaignid, try to upsert
        let session;
        try {
            session = await prisma.campaign_session.create({
                data: {
                    contact_id: Number(contactid),
                    campaign_id: Number(campaignid),
                    session_status: "ACTIVE",
                    last_active_at: new Date(),
                },
                include: sessionInclude,
            });
        } catch (err) {
            // If already exists, return existing
            if (err.code === "P2002") {
                session = await prisma.campaign_session.findUnique({
                    where: {
                        contact_id_campaign_id: {
                            contact_id: Number(contactid),
                            campaign_id: Number(campaignid),
                        },
                    },
                    include: sessionInclude,
                });
            } else {
                throw err;
            }
        }

        return res.status(201).json(formatSession(session));
    } catch (err) {
        console.error("createSession error:", err);
        return res.status(500).json({ error: err.message });
    }
}

/**
 * POST /api/session/:id/pause
 */
export async function pauseSession(req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });

        const updated = await prisma.campaign_session.update({
            where: { campaign_session_id: id },
            data: { session_status: "PAUSED" },
            include: sessionInclude,
        });

        return res.status(200).json({ message: "Session paused", session: formatSession(updated) });
    } catch (err) {
        console.error("pauseSession error:", err);
        if (err.code === "P2025") return res.status(404).json({ error: "Session not found" });
        return res.status(500).json({ error: err.message });
    }
}

/**
 * POST /api/session/:id/resume
 */
export async function resumeSession(req, res) {
    try {
        const id = parseInt(req.params.id, 10);
        if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });

        const session = await prisma.campaign_session.findUnique({
            where: { campaign_session_id: id },
            include: {
                campaign: true,
                contact: true,
                campaign_step: { select: { step_code: true, step_number: true } },
            },
        });

        if (!session) {
            return res.status(404).json({ error: "Session not found" });
        }

        if (session.session_status !== SESSION_STATUS.EXPIRED) {
            return res.status(400).json({ error: "Only expired sessions can be resumed" });
        }

        const updated = await prisma.campaign_session.update({
            where: { campaign_session_id: id },
            data: { session_status: SESSION_STATUS.ACTIVE, last_active_at: new Date() },
            include: sessionInclude,
        });

        return res.status(200).json({ message: "Session resumed", session: formatSession(updated) });
    } catch (err) {
        console.error("resumeSession error:", err);
        if (err.code === "P2025") return res.status(404).json({ error: "Session not found" });
        return res.status(500).json({ error: err.message });
    }
}

/**
 * POST /api/session/:id/cancel
 */
export async function cancelSession(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
        if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });

        const updated = await prisma.campaign_session.update({
            where: { campaign_session_id: id },
            data: { session_status: "CANCELLED" },
            include: sessionInclude,
        });

        return res.status(200).json({ message: "Session cancelled", session: formatSession(updated) });
    } catch (err) {
    console.error("cancelSession error:", err);
    if (err.code === "P2025") return res.status(404).json({ error: "Session not found" });
    return res.status(500).json({ error: err.message });
  }
}

/**
 * GET /api/session/by-contact/:contactId
 */
export async function listSessionsByContact(req, res) {
  try {
    const contactId = parseInt(req.params.contactId, 10);
    if (Number.isNaN(contactId)) {
      return res.status(400).json({ error: "Invalid contact id" });
    }

    const sessions = await prisma.campaign_session.findMany({
      where: { contact_id: contactId },
      orderBy: [{ last_active_at: "desc" }, { created_at: "desc" }],
      include: sessionInclude,
    });

    return res.status(200).json(sessions.map(formatSession));
  } catch (err) {
    console.error("listSessionsByContact error:", err);
    return res.status(500).json({ error: err.message });
  }
}

export async function markSessionCompleted(campaignsessionid) {
  try {
    const updated = await prisma.campaign_session.update({
      where: { campaign_session_id: campaignsessionid },
      data: {
        session_status: SESSION_STATUS.COMPLETED,
        last_active_at: new Date(),
        last_payload_json: null,
        last_payload_type: null,
      },
    });
    return updated;
  } catch (err) {
    console.error("markSessionCompleted error:", err);
    throw err;
  }
}

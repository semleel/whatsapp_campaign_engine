import prisma from "../config/prismaClient.js";

/**
 * Helper: map DB session to API shape
 */

const SESSION_STATUS = {
  ACTIVE: "ACTIVE",
  PAUSED: "PAUSED",
  COMPLETED: "COMPLETED",
  EXPIRED: "EXPIRED",
  CANCELLED: "CANCELLED",
};

function formatSession(s) {
    return {
        id: s.campaignsessionid,
        contactid: s.contactid,
        campaignid: s.campaignid,
        campaignname: s.campaign?.campaignname ?? null,
        contact_phonenum: s.contact?.phonenum ?? null,
        checkpoint: s.checkpoint ?? null,
        status: s.sessionstatus ?? "ACTIVE",
        createdAt: s.createdat ?? null,
        lastActiveAt: s.lastactiveat ?? null,
    };
}


/**
 * GET /api/session/list
 */
export async function listSessions(req, res) {
    try {
        const sessions = await prisma.campaignsession.findMany({
            include: {
                campaign: { select: { campaignname: true } },
                contact: { select: { phonenum: true } },
            },
            orderBy: { lastactiveat: "desc" },
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

        const s = await prisma.campaignsession.findUnique({
            where: { campaignsessionid: id },
            include: {
                campaign: true,
                contact: true,
                message: { orderBy: { timestamp: "asc" }, take: 500 },
                sessionlog: { orderBy: { loggedat: "asc" }, take: 200 },
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
 * Body: { contactid, campaignid, checkpoint? }
 */
export async function createSession(req, res) {
    try {
        const { contactid, campaignid, checkpoint } = req.body;
        if (!contactid || !campaignid) {
            return res
                .status(400)
                .json({ error: "contactid and campaignid are required" });
        }

        // Because of unique constraint contactid+campaignid, try to upsert
        let session;
        try {
            session = await prisma.campaignsession.create({
                data: {
                    contactid: Number(contactid),
                    campaignid: Number(campaignid),
                    checkpoint: checkpoint ?? null,
                    sessionstatus: "ACTIVE",
                    lastactiveat: new Date(),
                },
                include: { campaign: true, contact: true },
            });
        } catch (err) {
            // If already exists, return existing
            if (err.code === "P2002") {
                session = await prisma.campaignsession.findUnique({
                    where: {
                        contactid_campaignid: {
                            contactid: Number(contactid),
                            campaignid: Number(campaignid),
                        },
                    },
                    include: { campaign: true, contact: true },
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

        const updated = await prisma.campaignsession.update({
            where: { campaignsessionid: id },
            data: { sessionstatus: "PAUSED" },
            include: { campaign: true, contact: true },
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

        const session = await prisma.campaignsession.findUnique({
            where: { campaignsessionid: id },
            include: { campaign: true, contact: true },
        });

        if (!session) {
            return res.status(404).json({ error: "Session not found" });
        }

        if (session.sessionstatus !== SESSION_STATUS.EXPIRED) {
            return res.status(400).json({ error: "Only expired sessions can be resumed" });
        }

        const updated = await prisma.campaignsession.update({
            where: { campaignsessionid: id },
            data: { sessionstatus: SESSION_STATUS.ACTIVE, lastactiveat: new Date() },
            include: { campaign: true, contact: true },
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

        const updated = await prisma.campaignsession.update({
            where: { campaignsessionid: id },
            data: { sessionstatus: "CANCELLED" },
            include: { campaign: true, contact: true },
        });

        return res.status(200).json({ message: "Session cancelled", session: formatSession(updated) });
    } catch (err) {
        console.error("cancelSession error:", err);
        if (err.code === "P2025") return res.status(404).json({ error: "Session not found" });
        return res.status(500).json({ error: err.message });
    }
}

export async function markSessionCompleted(campaignsessionid) {
  try {
    const updated = await prisma.campaignsession.update({
      where: { campaignsessionid },
      data: {
        sessionstatus: SESSION_STATUS.COMPLETED,
        lastactiveat: new Date(),
      },
    });
    return updated;
  } catch (err) {
    console.error("markSessionCompleted error:", err);
    throw err;
  }
}

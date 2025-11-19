import prisma from "../config/prismaClient.js";

/**
 * Find or create contact by phone number (phonenum should match DB format)
 */
export async function findOrCreateContactByPhone(phonenum) {
    let contact = await prisma.contact.findUnique({ where: { phonenum } });
    if (!contact) {
        contact = await prisma.contact.create({ data: { phonenum } });
    }
    return contact;
}

/**
 * Determine campaign by keyword value (exact match). Returns campaign or null.
 */
export async function findCampaignByKeyword(text) {
    if (!text) return null;
    const kw = await prisma.keyword.findUnique({
        where: { value: text.toLowerCase() },
    });
    if (!kw) return null;
    const campaign = await prisma.campaign.findUnique({
        where: { campaignid: kw.campaignid },
    });
    return campaign;
}

/**
 * Get the entry content key for a given campaign's userflow.
 * Heuristic:
 *  - find keymapping where userflowid = campaign.userflowid and content.category = 'entry'
 *  - else pick first keymapping for that userflow
 */
async function getEntryContentKeyForCampaign(campaign) {
    if (!campaign?.userflowid) return null;

    // Get up to 50 keys for that userflow
    const allKeys = await prisma.keymapping.findMany({
        where: { userflowid: campaign.userflowid },
        include: { content: true },
        orderBy: { contentkeyid: "asc" },
        take: 50,
    });

    const entry = allKeys.find(
        (k) =>
            (k.content?.category || "").toLowerCase() === "entry" ||
            (k.content?.title || "").toLowerCase().includes("entry")
    );
    if (entry) return entry.contentkeyid;
    if (allKeys.length) return allKeys[0].contentkeyid;
    return null;
}

/**
 * Create or return existing campaign session for user + campaign.
 * Because of uniqueness on (contactid,campaignid) we provide upsert-like behaviour.
 */
export async function findOrCreateSession(contactid, campaign) {
    const entryKey = await getEntryContentKeyForCampaign(campaign);

    // try find latest existing
    const existing = await prisma.campaignsession.findFirst({
        where: {
            contactid: Number(contactid),
            campaignid: Number(campaign.campaignid),
        },
        orderBy: { createdat: "desc" },
    });

    // If user previously cancelled, start a brand new session instance
    if (existing && existing.sessionstatus === "CANCELLED") {
        return prisma.campaignsession.create({
            data: {
                contactid: Number(contactid),
                campaignid: Number(campaign.campaignid),
                checkpoint: entryKey,
                sessionstatus: "ACTIVE",
                lastactiveat: new Date(),
            },
        });
    }

    if (existing) {
        // DO NOT auto-reactivate EXPIRED here — expiry is handled separately
        return existing;
    }

    // create new session with entry checkpoint
    const created = await prisma.campaignsession.create({
        data: {
            contactid: Number(contactid),
            campaignid: Number(campaign.campaignid),
            checkpoint: entryKey,
            sessionstatus: "ACTIVE",
            lastactiveat: new Date(),
        },
    });
    return created;
}

/**
 * Update session checkpoint and lastActive
 */
export async function updateSessionCheckpoint(sessionid, nextCheckpoint) {
    return prisma.campaignsession.update({
        where: { campaignsessionid: Number(sessionid) },
        data: { checkpoint: nextCheckpoint, lastactiveat: new Date() },
    });
}

/**
 * Determine whether a keymapping node is terminal (no outgoing branches or node-level fallback).
 */
async function isTerminalNode(contentkeyid, userflowid) {
    if (!contentkeyid) return false;

    const [branchCount, nodeFallback] = await Promise.all([
        prisma.branchrule.count({
            where: { triggerkey: contentkeyid, userflowid: userflowid ?? undefined },
        }),
        prisma.fallback.findFirst({
            where: { scope: "NODE", value: contentkeyid, userflowid: userflowid ?? undefined },
        }),
    ]);

    return branchCount === 0 && !nodeFallback;
}

/**
 * Process an incoming message (called by webhook handler).
 * 1) find/create contact
 * 2) check keyword -> campaign
 * 3) find/create campaignsession
 * 4) handle paused/completed/expired states
 * 5) update checkpoint
 *
 * Returns an object with:
 *  - action: "no_campaign" | "paused" | "completed" | "expired" | "moved"
 *  - reply?: string
 *  - reason?: string
 *  - sessionid?: number
 *  - campaignid?: number
 *  - nextKey?: string | null
 */
export async function processIncomingMessage({ from, text }) {
    // Normalize phone number (you may need custom normalization)
    const phonenum = (from || "").trim();
    const messageText = (text || "").trim();

    const contact = await findOrCreateContactByPhone(phonenum);

    // Check if message matches a campaign keyword
    const campaign = await findCampaignByKeyword(messageText.toLowerCase());

    if (!campaign) {
        return {
            action: "no_campaign",
            reply: null,
            reason: "no keyword matched",
        };
    }

    // find or create session
    const session = await findOrCreateSession(contact.contactid, campaign);

    // ===== AUTO EXPIRY LOGIC (2 hours) =====
    const now = new Date();
    const lastActive = session.lastactiveat ? new Date(session.lastactiveat) : null;

    const EXPIRY_MS = 2 * 60 * 60 * 1000; // 2 hours

    if (lastActive && now - lastActive > EXPIRY_MS) {
        // Mark expired
        await prisma.campaignsession.update({
            where: { campaignsessionid: session.campaignsessionid },
            data: { sessionstatus: "EXPIRED" },
        });

        return {
            action: "expired",
            reply:
                "Hi! This chat session has ended.\n\nPlease reply with 'hi' to start a new conversation.",
            sessionid: session.campaignsessionid,
            campaignid: campaign.campaignid,
            nextKey: null,
        };
    }
    // ===== END AUTO EXPIRY =====

    // If paused — don't move forward
    if (session.sessionstatus === "PAUSED") {
        return {
            action: "paused",
            reply:
                "Your session is paused. Please contact support to resume or ask an agent.",
            sessionid: session.campaignsessionid,
            campaignid: campaign.campaignid,
        };
    }

    // If completed — don't move forward
    if (session.sessionstatus === "COMPLETED") {
        return {
            action: "completed",
            reply: "You have already completed this campaign.",
            sessionid: session.campaignsessionid,
            campaignid: campaign.campaignid,
        };
    }

    // If already marked EXPIRED (e.g. by cron), also treat as expired
    if (session.sessionstatus === "EXPIRED") {
        return {
            action: "expired",
            reply:
                "Hi! This chat session has ended.\n\nPlease reply with 'hi' to start a new conversation.",
            sessionid: session.campaignsessionid,
            campaignid: campaign.campaignid,
            nextKey: null,
        };
    }

    // ---------- Branch decision logic ----------
    const checkpoint = session.checkpoint;
    let nextKey = null;
    let nextKeyIsTerminal = false;

    if (checkpoint) {
        const br = await prisma.branchrule.findFirst({
            where: {
                triggerkey: checkpoint,
                inputvalue: messageText,
                userflowid: campaign.userflowid ?? undefined,
            },
            orderBy: { priority: "asc" },
        });

        if (br) {
            nextKey = br.nextkey;
        } else {
            // fallback: look for a fallback row
            const fb = await prisma.fallback.findFirst({
                where: {
                    contentkeyid: checkpoint,
                    userflowid: campaign.userflowid ?? undefined,
                },
            });
            nextKey = fb?.value ?? null;
        }
    } else {
        // No checkpoint set: pick entry key (already set during session creation)
        nextKey = session.checkpoint;
    }

    // Determine if the upcoming node is terminal (no further branches/fallbacks)
    if (nextKey) {
        nextKeyIsTerminal = await isTerminalNode(nextKey, campaign.userflowid);
    }

    // Update the session checkpoint & lastactive
    if (nextKey) {
        // If this is the last node, also mark the session completed
        await prisma.campaignsession.update({
            where: { campaignsessionid: session.campaignsessionid },
            data: {
                checkpoint: nextKey,
                lastactiveat: new Date(),
                sessionstatus: nextKeyIsTerminal ? "COMPLETED" : session.sessionstatus,
            },
        });
    } else {
        // if no nextKey determined, we do not change checkpoint but update lastactive
        await prisma.campaignsession.update({
            where: { campaignsessionid: session.campaignsessionid },
            data: { lastactiveat: new Date() },
        });
    }

    // Log session action
    await prisma.sessionlog.create({
        data: {
            campaignsessionid: session.campaignsessionid,
            contentkeyid: checkpoint ?? null,
            detail: `received: ${String(messageText).slice(0, 200)}`,
        },
    });
    if (nextKeyIsTerminal) {
        await prisma.sessionlog.create({
            data: {
                campaignsessionid: session.campaignsessionid,
                contentkeyid: nextKey,
                detail: `completed at node: ${nextKey}`,
            },
        });
    }

    // Return to webhook for final message send logic
    return {
        action: "moved",
        sessionid: session.campaignsessionid,
        campaignid: campaign.campaignid,
        nextKey,
        completed: nextKeyIsTerminal,
    };
}

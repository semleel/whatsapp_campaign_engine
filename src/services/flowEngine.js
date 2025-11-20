// src/services/flowEngine.js

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
 * Determine campaign by keyword value.
 * - Case-insensitive
 * - Works with multiple keyword rows per campaign (findFirst)
 */
export async function findCampaignByKeyword(text) {
  const normalized = (text || "").trim();
  if (!normalized) return null;

  const kw = await prisma.keyword.findFirst({
    where: {
      value: {
        equals: normalized,
        mode: "insensitive", // "cny" / "CNY" / "Cny" all match
      },
    },
    orderBy: { keywordid: "asc" }, // pick the earliest if there are duplicates
  });

  if (!kw) return null;

  const campaign = await prisma.campaign.findUnique({
    where: { campaignid: kw.campaignid },
  });

  return campaign;
}

/**
 * Get the entry content key for a given campaign's userflow.
 * New behaviour:
 *   1) Prefer fallback(scope='FLOW', value='ENTRY')
 *   2) Fallback to old heuristic on keymapping/content
 */
async function getEntryContentKeyForCampaign(campaign) {
  // ✅ 0) If no userflow, try CAMPAIGN_<id>_INTRO
  if (!campaign?.userflowid) {
    const introKey = `CAMPAIGN_${campaign.campaignid}_INTRO`;

    const km = await prisma.keymapping.findUnique({
      where: { contentkeyid: introKey },
    });

    if (km) return introKey;          // use your intro content
    return null;                      // no intro configured
  }

  // 1) FLOW-level ENTRY config
  const flowEntry = await prisma.fallback.findFirst({
    where: {
      userflowid: campaign.userflowid,
      scope: "FLOW",
      value: "ENTRY",
    },
  });

  if (flowEntry?.contentkeyid) {
    return flowEntry.contentkeyid;
  }

  // 2) Heuristic on content.category/title
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
 */
export async function findOrCreateSession(contactid, campaign) {
  // 🔎 find latest existing
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
        checkpoint: null,         // ✅ start with no node
        sessionstatus: "ACTIVE",
        lastactiveat: new Date(),
      },
    });
  }

  if (existing) {
    // EXPIRED is handled outside (we don't auto-reactivate here)
    return existing;
  }

  // create new session with no checkpoint yet
  const created = await prisma.campaignsession.create({
    data: {
      contactid: Number(contactid),
      campaignid: Number(campaign.campaignid),
      checkpoint: null,          // ✅ first message will choose entry key
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
      where: {
        scope: "NODE",
        value: contentkeyid,
        userflowid: userflowid ?? undefined,
      },
    }),
  ]);

  return branchCount === 0 && !nodeFallback;
}

/**
 * Process an incoming message (called by webhook handler).
 */
export async function processIncomingMessage({ from, text }) {
  const phonenum = (from || "").trim();
  const messageText = (text || "").trim();

  const contact = await findOrCreateContactByPhone(phonenum);

  // Check if message matches a campaign keyword (case-insensitive)
  const campaign = await findCampaignByKeyword(messageText);

  if (!campaign) {
    return {
      action: "no_campaign",
      reply: null,
      reason: "no keyword matched",
    };
  }

  // find or create session
  const session = await findOrCreateSession(contact.contactid, campaign);

  // ===== AUTO EXPIRY LOGIC (unchanged) =====
  const now = new Date();
  const lastActive = session.lastactiveat ? new Date(session.lastactiveat) : null;
  const EXPIRY_MS = 2 * 60 * 60 * 1000;

  if (lastActive && now - lastActive > EXPIRY_MS) {
    await prisma.campaignsession.update({
      where: { campaignsessionid: session.campaignsessionid },
      data: { sessionstatus: "EXPIRED" },
    });

    return {
      action: "expired",
      reply:
        "Hi! This chat session has ended.\n\nPlease reply with 'start' to start a new conversation.",
      sessionid: session.campaignsessionid,
      campaignid: campaign.campaignid,
      nextKey: null,
    };
  }

  // paused / completed / expired (unchanged)
  if (session.sessionstatus === "PAUSED") {
    return {
      action: "paused",
      reply:
        "Your session is paused. Please contact support to resume or ask an agent.",
      sessionid: session.campaignsessionid,
      campaignid: campaign.campaignid,
    };
  }

  if (session.sessionstatus === "COMPLETED") {
    return {
      action: "completed",
      reply: "You have already completed this campaign.",
      sessionid: session.campaignsessionid,
      campaignid: campaign.campaignid,
    };
  }

  if (session.sessionstatus === "EXPIRED") {
    return {
      action: "expired",
      reply:
        "Hi! This chat session has ended.\n\nPlease reply with 'start' to start a new conversation.",
      sessionid: session.campaignsessionid,
      campaignid: campaign.campaignid,
      nextKey: null,
    };
  }

  // ---------- Branch decision logic ----------
  const checkpoint = session.checkpoint;
  let nextKey = null;
  let nextKeyIsTerminal = false;

  if (!checkpoint) {
    // ✅ first step: go to entry node for this campaign
    nextKey = await getEntryContentKeyForCampaign(campaign);
  } else {
    // existing logic: branchrule / fallback
    const br = await prisma.branchrule.findFirst({
      where: {
        triggerkey: checkpoint,
        inputvalue: {
          equals: messageText,
          mode: "insensitive",
        },
        userflowid: campaign.userflowid ?? undefined,
      },
      orderBy: { priority: "asc" },
    });

    if (br) {
      nextKey = br.nextkey;
    } else {
      const fb = await prisma.fallback.findFirst({
        where: {
          contentkeyid: checkpoint,
          userflowid: campaign.userflowid ?? undefined,
        },
      });
      nextKey = fb?.value ?? null;
    }
  }

  // Determine if the upcoming node is terminal (no further branches/fallbacks)
  if (nextKey) {
    nextKeyIsTerminal = await isTerminalNode(nextKey, campaign.userflowid);
  }

  // Update session checkpoint & lastactive
  if (nextKey) {
    await prisma.campaignsession.update({
      where: { campaignsessionid: session.campaignsessionid },
      data: {
        checkpoint: nextKey,
        lastactiveat: new Date(),
        sessionstatus: nextKeyIsTerminal ? "COMPLETED" : session.sessionstatus,
      },
    });
  } else {
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

  return {
    action: "moved",
    sessionid: session.campaignsessionid,
    campaignid: campaign.campaignid,
    nextKey,
    completed: nextKeyIsTerminal,
  };
}

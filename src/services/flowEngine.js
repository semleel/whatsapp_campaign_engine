// src/services/flowEngine.js

import prisma from "../config/prismaClient.js";

export const SESSION_STATUS = {
  ACTIVE: "ACTIVE",
  PAUSED: "PAUSED",
  COMPLETED: "COMPLETED",
  EXPIRED: "EXPIRED",
  CANCELLED: "CANCELLED",
};

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

export async function findCommandContentKeyForCampaign(campaign, command) {
  if (!campaign?.userflowid || !command) return null;

  const normalized = command.toLowerCase();

  const keys = await prisma.keymapping.findMany({
    where: { userflowid: campaign.userflowid },
    include: { content: true },
    orderBy: { contentkeyid: "asc" },
    take: 100,
  });

  const match = keys.find((k) => {
    const category = (k.content?.category || "").toLowerCase();
    const title = (k.content?.title || "").toLowerCase();

    return (
      category === `command:${normalized}` ||
      category === `command_${normalized}` ||
      category === normalized ||
      title === normalized ||
      title === `command:${normalized}` ||
      title === `command_${normalized}`
    );
  });

  return match?.contentkeyid ?? null;
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

  const needsNewInstance =
    existing &&
    [SESSION_STATUS.CANCELLED, SESSION_STATUS.COMPLETED].includes(existing.sessionstatus);

  // Start a fresh session when user previously cancelled/completed
  if (needsNewInstance) {
    return prisma.campaignsession.create({
      data: {
        contactid: Number(contactid),
        campaignid: Number(campaign.campaignid),
        checkpoint: entryKey,
        sessionstatus: SESSION_STATUS.ACTIVE,
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
      sessionstatus: SESSION_STATUS.ACTIVE,
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
 * 1) find/create contact
 * 2) check keyword -> campaign
 * 3) find/create campaignsession
 * 4) handle paused/completed/expired states
 * 5) update checkpoint
 *
 * Returns an object with:
 *  - action: "no_campaign" | "paused" | "completed" | "moved"
 *  - reply?: string
 *  - reason?: string
 *  - sessionid?: number
 *  - campaignid?: number
 *  - nextKey?: string | null
 */
export async function processIncomingMessage({ from, text }) {
  const phonenum = (from || "").trim();
  const messageText = (text || "").trim();

  const contact = await findOrCreateContactByPhone(phonenum);

  // Check if message matches a campaign keyword
  let campaign = await findCampaignByKeyword(messageText.toLowerCase());
  let session = null;

  if (campaign) {
    // find or create session for keyword-triggered campaign
    session = await findOrCreateSession(contact.contactid, campaign);
  } else {
    // fallback: use most recent non-cancelled session
    session = await prisma.campaignsession.findFirst({
      where: {
        contactid: Number(contact.contactid),
        sessionstatus: { not: SESSION_STATUS.CANCELLED },
      },
      include: { campaign: true },
      orderBy: [
        { lastactiveat: "desc" },
        { createdat: "desc" },
      ],
    });

    if (!session || !session.campaign) {
      return {
        action: "no_campaign",
        reply: null,
        reason: "no keyword matched",
      };
    }

    campaign = session.campaign;
  }

  // ===== AUTO EXPIRY LOGIC (2 hours) =====
  const now = new Date();
  const lastActive = session.lastactiveat ? new Date(session.lastactiveat) : null;

  const EXPIRY_MS = 2 * 60 * 60 * 1000; // 2 hours
  const shouldAutoExpire =
    session.sessionstatus === SESSION_STATUS.ACTIVE &&
    lastActive &&
    now - lastActive > EXPIRY_MS;

  if (shouldAutoExpire) {
    await prisma.campaignsession.update({
      where: { campaignsessionid: session.campaignsessionid },
      data: { sessionstatus: SESSION_STATUS.EXPIRED },
    });
    session.sessionstatus = SESSION_STATUS.EXPIRED;
  }
  // ===== END AUTO EXPIRY =====

  // If expired, automatically resume on inbound interaction
  if (session.sessionstatus === SESSION_STATUS.EXPIRED) {
    const resumed = await prisma.campaignsession.update({
      where: { campaignsessionid: session.campaignsessionid },
      data: {
        sessionstatus: SESSION_STATUS.ACTIVE,
        lastactiveat: new Date(),
      },
    });
    session.sessionstatus = resumed.sessionstatus;
    session.lastactiveat = resumed.lastactiveat;
  }

  // If paused – don't move forward
  if (session.sessionstatus === SESSION_STATUS.PAUSED) {
    return {
      action: "paused",
      reply:
        "Your session is paused. Please contact support to resume or ask an agent.",
      sessionid: session.campaignsessionid,
      campaignid: campaign.campaignid,
    };
  }

  // If completed – don't move forward
  if (session.sessionstatus === SESSION_STATUS.COMPLETED) {
    return {
      action: "completed",
      reply: "You have already completed this campaign.",
      sessionid: session.campaignsessionid,
      campaignid: campaign.campaignid,
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
        sessionstatus: nextKeyIsTerminal
          ? SESSION_STATUS.COMPLETED
          : session.sessionstatus,
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

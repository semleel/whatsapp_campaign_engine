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
        mode: "insensitive",
      },
    },
    orderBy: { keywordid: "asc" },
  });

  if (!kw) return null;

  const campaign = await prisma.campaign.findUnique({
    where: { campaignid: kw.campaignid },
  });

  return campaign;
}

/**
 * Get the entry content key for a given campaign.
 * Behaviour:
 *   0) If campaign.contentkeyid is set, use it
 *   1) Otherwise try CAMPAIGN_<id>_INTRO key
 */
async function getEntryContentKeyForCampaign(campaign) {
  if (!campaign) return null;

  // 0) Explicit entry key
  if (campaign.contentkeyid) {
    return campaign.contentkeyid;
  }

  // 1) Heuristic key per campaign
  const introKey = `CAMPAIGN_${campaign.campaignid}_INTRO`;
  const km = await prisma.keymapping.findUnique({
    where: { contentkeyid: introKey },
  });
  if (km) return introKey;

  return null;
}

export async function findCommandContentKeyForCampaign(campaign, command) {
  if (!campaign || !command) return null;

  const normalized = command.toLowerCase();

  const flowId = await getUserflowIdForKey(campaign.contentkeyid);

  const keys = await prisma.keymapping.findMany({
    where: flowId ? { userflowid: flowId } : {},
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
 * - If there is a non-cancelled, non-completed session → reuse it
 * - Otherwise create a fresh session with checkpoint = null
 *   (first node will be decided by getEntryContentKeyForCampaign)
 */
export async function findOrCreateSession(contactid, campaign) {
  const existing = await prisma.campaignsession.findFirst({
    where: {
      contactid: Number(contactid),
      campaignid: Number(campaign.campaignid),
    },
    orderBy: { createdat: "desc" },
  });

  if (
    existing &&
    ![SESSION_STATUS.CANCELLED, SESSION_STATUS.COMPLETED].includes(
      existing.sessionstatus
    )
  ) {
    return existing;
  }

  // Fresh session (no checkpoint yet)
  return prisma.campaignsession.create({
    data: {
      contactid: Number(contactid),
      campaignid: Number(campaign.campaignid),
      checkpoint: null,
      sessionstatus: SESSION_STATUS.ACTIVE,
      lastactiveat: new Date(),
    },
  });
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

async function getUserflowIdForKey(contentkeyid) {
  if (!contentkeyid) return null;
  const km = await prisma.keymapping.findUnique({
    where: { contentkeyid },
    select: { userflowid: true },
  });
  return km?.userflowid ?? null;
}

/**
 * Determine whether a keymapping node is terminal
 * (no outgoing branches or node-level fallback).
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
 *
 * Returns:
 *  - action: "no_campaign" | "paused" | "completed" | "expired" | "moved"
 *  - reply?: string
 *  - reason?: string
 *  - sessionid?: number
 *  - campaignid?: number
 *  - nextKey?: string | null
 *  - completed?: boolean
 */
export async function processIncomingMessage({ from, text }) {
  const phonenum = (from || "").trim();
  const messageText = (text || "").trim();

  const contact = await findOrCreateContactByPhone(phonenum);

  // 1) Check if message matches a campaign keyword
  const campaign = await findCampaignByKeyword(messageText);
  if (!campaign) {
    return {
      action: "no_campaign",
      reply: null,
      reason: "no keyword matched",
    };
  }

  // 2) Find or create session
  const session = await findOrCreateSession(contact.contactid, campaign);

  // 3) AUTO EXPIRY (2 hours)
  const now = new Date();
  const lastActive = session.lastactiveat ? new Date(session.lastactiveat) : null;
  const EXPIRY_MS = 2 * 60 * 60 * 1000;

  if (
    lastActive &&
    now.getTime() - lastActive.getTime() > EXPIRY_MS &&
    session.sessionstatus === SESSION_STATUS.ACTIVE
  ) {
    await prisma.campaignsession.update({
      where: { campaignsessionid: session.campaignsessionid },
      data: { sessionstatus: SESSION_STATUS.EXPIRED },
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

  // 4) Handle paused / completed / expired states
  if (session.sessionstatus === SESSION_STATUS.PAUSED) {
    return {
      action: "paused",
      reply:
        "Your session is paused. Please contact support to resume or ask an agent.",
      sessionid: session.campaignsessionid,
      campaignid: campaign.campaignid,
    };
  }

  if (session.sessionstatus === SESSION_STATUS.COMPLETED) {
    return {
      action: "completed",
      reply: "You have already completed this campaign.",
      sessionid: session.campaignsessionid,
      campaignid: campaign.campaignid,
    };
  }

  if (session.sessionstatus === SESSION_STATUS.EXPIRED) {
    return {
      action: "expired",
      reply:
        "Hi! This chat session has ended.\n\nPlease reply with 'start' to start a new conversation.",
      sessionid: session.campaignsessionid,
      campaignid: campaign.campaignid,
      nextKey: null,
    };
  }

  // 5) Branch decision logic
  const checkpoint = session.checkpoint;
  let nextKey = null;
  let nextKeyIsTerminal = false;

  if (!checkpoint) {
    // first step: go to entry node for this campaign
    nextKey = await getEntryContentKeyForCampaign(campaign);
  } else {
    const checkpointFlowId = await getUserflowIdForKey(checkpoint);

    const br = await prisma.branchrule.findFirst({
      where: {
        triggerkey: checkpoint,
        inputvalue: {
          equals: messageText,
          mode: "insensitive",
        },
        userflowid: checkpointFlowId ?? undefined,
      },
      orderBy: { priority: "asc" },
    });

    if (br) {
      nextKey = br.nextkey;
    } else {
      const checkpointFlowIdForFallback = checkpointFlowId ?? undefined;
      const fb = await prisma.fallback.findFirst({
        where: {
          contentkeyid: checkpoint,
          userflowid: checkpointFlowIdForFallback,
        },
      });
      nextKey = fb?.value ?? null;
    }
  }

  // 6) Determine if upcoming node is terminal
  const nextKeyFlowId = await getUserflowIdForKey(nextKey);

  if (nextKey) {
    nextKeyIsTerminal = await isTerminalNode(nextKey, nextKeyFlowId);
  }

  // 7) Update session checkpoint & lastactive
  if (nextKey) {
    await prisma.campaignsession.update({
      where: { campaignsessionid: session.campaignsessionid },
      data: {
        checkpoint: nextKey,
        lastactiveat: new Date(),
        current_userflowid: nextKeyFlowId,
        sessionstatus: nextKeyIsTerminal
          ? SESSION_STATUS.COMPLETED
          : session.sessionstatus,
      },
    });
  } else {
    await prisma.campaignsession.update({
      where: { campaignsessionid: session.campaignsessionid },
      data: { lastactiveat: new Date() },
    });
  }

  // 8) Log session action
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

  // 9) Return to webhook
  if (!nextKey) {
    // nothing to move to, but we did have a campaign
    return {
      action: "no_campaign",
      reply: null,
      reason: "no nextKey determined",
    };
  }

  return {
    action: "moved",
    sessionid: session.campaignsessionid,
    campaignid: campaign.campaignid,
    nextKey,
    completed: nextKeyIsTerminal,
  };
}

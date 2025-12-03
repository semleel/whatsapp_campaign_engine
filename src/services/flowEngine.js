// src/services/flowEngine.js
import { prisma } from "../config/prismaClient.js";

export const SESSION_STATUS = {
  ACTIVE: "ACTIVE",
  PAUSED: "PAUSED",
  COMPLETED: "COMPLETED",
  EXPIRED: "EXPIRED",
  CANCELLED: "CANCELLED",
};

const EXPIRY_MS = 2 * 60 * 60 * 1000;
const ENTRY_AUTO_PATH_MAX_STEPS = 50;

function normalizeNodeType(rawType = "") {
  const safe = String(rawType || "").toLowerCase();
  if (safe === "wait_input" || safe === "question") return "message";
  return safe || "message";
}

// -------------------------
// helpers: load node + placeholders
// -------------------------
async function loadNodeWithContent(contentkeyid, userflowid) {
  if (!contentkeyid) return null;

  const km = await prisma.keymapping.findFirst({
    where: { contentkeyid, userflowid },
    include: { content: true },
  });

  if (!km?.content) return null;

  return {
    key: km.contentkeyid,
    type: normalizeNodeType(km.content.type),
    body: km.content.body || "",
    placeholders: km.content.placeholders || {},
  };
}

async function getBranchGroups({ userflowid, triggerkey }) {
  if (!userflowid || !triggerkey) return { anyBranches: [], specificBranches: [] };

  const branches = await prisma.branchrule.findMany({
    where: { userflowid, triggerkey },
    orderBy: { priority: "asc" },
  });

  const anyBranches = [];
  const specificBranches = [];

  for (const br of branches) {
    const input = (br.inputvalue || "").toUpperCase();
    const isAny = input === "ANY" || input === "*";
    (isAny ? anyBranches : specificBranches).push(br);
  }

  return { anyBranches, specificBranches };
}

// -------------------------
// decision evaluation helpers
// -------------------------
function getValueByPath(path, ctx) {
  if (!path) return undefined;
  const parts = String(path).split(".");
  let cur = ctx;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function compare(leftVal, op, rightRaw) {
  const right = String(rightRaw);
  const left = leftVal;

  const rightNum = Number(right);
  const leftNum = Number(left);

  switch (op) {
    case "eq": return String(left) === right;
    case "neq": return String(left) !== right;
    case "contains": return String(left).toLowerCase().includes(right.toLowerCase());
    case "gt": return !Number.isNaN(leftNum) && !Number.isNaN(rightNum) && leftNum > rightNum;
    case "gte": return !Number.isNaN(leftNum) && !Number.isNaN(rightNum) && leftNum >= rightNum;
    case "lt": return !Number.isNaN(leftNum) && !Number.isNaN(rightNum) && leftNum < rightNum;
    case "lte": return !Number.isNaN(leftNum) && !Number.isNaN(rightNum) && leftNum <= rightNum;
    default: return false;
  }
}

function evaluateDecisionRules(rules = [], ctx = {}) {
  for (const r of rules) {
    if (!r?.left || !r?.op) continue;
    const leftVal = getValueByPath(r.left, ctx);
    if (compare(leftVal, r.op, r.right)) {
      return r.nextKey || null;
    }
  }
  return null;
}

// -------------------------
// API call (uses api + apiparameter tables)
// -------------------------
async function callApiEndpoint(endpointId, ctx, campaign, session) {
  if (!endpointId) return { ok: false, status: 0, json: null };

  const ep = await prisma.api.findUnique({
    where: { apiid: Number(endpointId) },
    include: { apiparameter: true },
  });
  if (!ep || !ep.is_active) return { ok: false, status: 0, json: null };

  const method = (ep.method || "GET").toUpperCase();
  const baseUrl = String(ep.base_url || "").replace(/\/+$/, "");
  const path = String(ep.path || "").replace(/^\/+/, "");
  let url = `${baseUrl}/${path}`;

  const headers = {};
  let bodyObj = {};
  const queryObj = {};

  // auth header
  if (ep.auth_type === "bearer_header" && ep.auth_token) {
    headers[ep.auth_header_name || "Authorization"] = `Bearer ${ep.auth_token}`;
  }
  if (ep.auth_type === "api_key_header" && ep.auth_token) {
    headers[ep.auth_header_name || "x-api-key"] = ep.auth_token;
  }

  // parameters
  for (const p of ep.apiparameter || []) {
    const loc = p.location;
    const key = p.key;

    let value = null;
    if (p.valuesource === "contact") value = getValueByPath(p.valuepath, { contact: ctx.contact });
    if (p.valuesource === "campaign") value = getValueByPath(p.valuepath, { campaign });
    if (p.valuesource === "session") value = getValueByPath(p.valuepath, { session });
    if (p.valuesource === "constant") value = p.constantvalue;

    if (value == null && p.required) {
      return { ok: false, status: 0, json: null };
    }
    if (value == null) continue;

    if (loc === "query") queryObj[key] = value;
    if (loc === "header") headers[key] = String(value);
    if (loc === "path") url = url.replace(`:${key}`, encodeURIComponent(String(value)));
    if (loc === "body") bodyObj[key] = value;
  }

  const qs = new URLSearchParams(
    Object.entries(queryObj).map(([k, v]) => [k, String(v)])
  ).toString();
  if (qs) url += (url.includes("?") ? "&" : "?") + qs;

  const init = {
    method,
    headers: { "Content-Type": "application/json", ...headers },
  };
  if (method !== "GET") init.body = JSON.stringify(bodyObj);

  let res, json;
  try {
    res = await fetch(url, init);
    const text = await res.text();
    try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  } catch (e) {
    return { ok: false, status: 0, json: null };
  }

  return { ok: res.ok, status: res.status, json };
}

/**
 * Find or create contact by phone number
 */
export async function findOrCreateContactByPhone(phonenum) {
  let contact = await prisma.contact.findUnique({ where: { phonenum } });
  if (!contact) {
    contact = await prisma.contact.create({ data: { phonenum } });
  }
  return contact;
}

async function getActiveStartSystemFlow() {
  return prisma.system_flow.findFirst({
    where: { code: "START", is_active: true },
    select: { systemflowid: true, userflowid: true },
  });
}

export async function ensureResetKeywordPointsToStart() {
  const startFlow = await getActiveStartSystemFlow();
  if (!startFlow?.userflowid) return null;

  const payload = {
    keyword: "/reset",
    userflowid: startFlow.userflowid,
    systemflowid: startFlow.systemflowid || null,
    is_active: true,
  };

  await prisma.system_keyword.upsert({
    where: { keyword: "/reset" },
    update: {
      userflowid: payload.userflowid,
      systemflowid: payload.systemflowid,
      is_active: true,
    },
    create: payload,
  });

  return payload;
}

/**
 * SYSTEM keyword matcher (DB-driven)
 * Looks up system_keyword.keyword case-insensitively.
 * If systemflowid exists -> map through system_flow to get userflowid.
 */
async function findSystemFlowByKeyword(text) {
  const normalized = (text || "").trim();
  if (!normalized) return null;

  const normalizedLower = normalized.toLowerCase();

  if (normalizedLower === "/reset") {
    const resetTarget = await ensureResetKeywordPointsToStart();
    if (resetTarget?.userflowid) {
      return {
        type: "SYSTEM",
        systemflowid: resetTarget.systemflowid,
        userflowid: resetTarget.userflowid,
        code: "START",
      };
    }
  }

  const sk = await prisma.system_keyword.findFirst({
    where: {
      is_active: true,
      keyword: { equals: normalized, mode: "insensitive" },
    },
  });

  if (!sk) return null;

  // if points to systemflowid, resolve it
  if (sk.systemflowid) {
    const sf = await prisma.system_flow.findUnique({
      where: { systemflowid: sk.systemflowid },
    });
    if (sf?.is_active) {
      return {
        type: "SYSTEM",
        systemflowid: sf.systemflowid,
        userflowid: sf.userflowid,
        code: sf.code,
      };
    }
  }

  // fallback: direct userflowid
  return {
    type: "SYSTEM",
    systemflowid: null,
    userflowid: sk.userflowid,
    code: null,
  };
}

/**
 * Find campaign by campaign keyword (keyword table)
 */
async function findCampaignByKeyword(text) {
  const normalized = (text || "").trim();
  if (!normalized) return null;

  const kw = await prisma.keyword.findFirst({
    where: { value: { equals: normalized, mode: "insensitive" } },
    orderBy: { keywordid: "asc" },
  });

  if (!kw) return null;

  return prisma.campaign.findUnique({
    where: { campaignid: kw.campaignid },
  });
}

/**
 * Get entry content key for a flow (FLOW fallback ENTRY)
 */
async function getEntryKeyForUserflow(userflowid) {
  if (!userflowid) return null;

  const flowEntry = await prisma.fallback.findFirst({
    where: { userflowid, scope: "FLOW", value: "ENTRY" },
  });
  if (flowEntry?.contentkeyid) return flowEntry.contentkeyid;

  // heuristic fallback
  const allKeys = await prisma.keymapping.findMany({
    where: { userflowid },
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

async function computeEntryAutoPath({ userflowid }) {
  const entryKey = await getEntryKeyForUserflow(userflowid);
  if (!entryKey) return { entryKey: null, keysToSend: [], checkpointKey: null };

  const keysToSend = [];
  let currentKey = entryKey;
  let safety = 0;

  while (currentKey && safety++ < ENTRY_AUTO_PATH_MAX_STEPS) {
    const node = await loadNodeWithContent(currentKey, userflowid);
    if (!node) break;

    const nodeType = normalizeNodeType(node.type);
    const interactiveType = (node.placeholders?.interactiveType || "none").toLowerCase();
    const buttons = Array.isArray(node.placeholders?.buttons) ? node.placeholders.buttons : [];
    const listOptions = Array.isArray(node.placeholders?.listOptions)
      ? node.placeholders.listOptions
      : [];
    const hasInteractive =
      (interactiveType && interactiveType !== "none") ||
      buttons.length > 0 ||
      listOptions.length > 0;

    if (nodeType === "decision" || nodeType === "api" || nodeType === "jump") {
      break;
    }

    keysToSend.push(currentKey);

    const { anyBranches, specificBranches } = await getBranchGroups({
      userflowid,
      triggerkey: currentKey,
    });

    const canAutoTraverse =
      specificBranches.length === 0 &&
      anyBranches.length === 1 &&
      !hasInteractive;

    if (!canAutoTraverse) {
      break;
    }

    currentKey = anyBranches[0].nextkey;
  }

  const checkpointKey = keysToSend.length > 0 ? keysToSend[keysToSend.length - 1] : entryKey;

  return { entryKey, keysToSend, checkpointKey };
}

/**
 * Find or create a session for:
 *  - CAMPAIGN flow: (contactid + campaignid)
 *  - SYSTEM flow: (contactid + current_userflowid, campaignid null)
 */
export async function findOrCreateSession(contactid, { campaign, userflowid }) {
  if (campaign) {
    const existing = await prisma.campaignsession.findFirst({
      where: {
        contactid: Number(contactid),
        campaignid: Number(campaign.campaignid),
      },
      orderBy: { createdat: "desc" },
    });

    if (
      existing &&
      ![SESSION_STATUS.CANCELLED, SESSION_STATUS.COMPLETED].includes(existing.sessionstatus)
    ) {
      return existing;
    }

    return prisma.campaignsession.create({
      data: {
        contactid: Number(contactid),
        campaignid: Number(campaign.campaignid),
        checkpoint: null,
        sessionstatus: SESSION_STATUS.ACTIVE,
        lastactiveat: new Date(),
        current_userflowid: campaign.userflowid,
      },
    });
  }

  // SYSTEM
  const existing = await prisma.campaignsession.findFirst({
    where: {
      contactid: Number(contactid),
      campaignid: null,
      current_userflowid: Number(userflowid),
    },
    orderBy: { createdat: "desc" },
  });

  if (
    existing &&
    ![SESSION_STATUS.CANCELLED, SESSION_STATUS.COMPLETED].includes(existing.sessionstatus)
  ) {
    return existing;
  }

  return prisma.campaignsession.create({
    data: {
      contactid: Number(contactid),
      campaignid: null,
      checkpoint: null,
      sessionstatus: SESSION_STATUS.ACTIVE,
      lastactiveat: new Date(),
      current_userflowid: Number(userflowid),
    },
  });
}

/**
 * Determine whether a node is terminal
 */
async function isTerminalNode(contentkeyid, userflowid) {
  if (!contentkeyid || !userflowid) return false;

  const [branchCount, nodeFallback] = await Promise.all([
    prisma.branchrule.count({
      where: { triggerkey: contentkeyid, userflowid },
    }),
    prisma.fallback.findFirst({
      where: { scope: "NODE", value: contentkeyid, userflowid },
    }),
  ]);

  return branchCount === 0 && !nodeFallback;
}

// -------------------------
// MAIN ENGINE (patched)
// -------------------------
export async function processIncomingMessage({ from, text }) {
  const phonenum = (from || "").trim();
  const messageText = (text || "").trim();

  const contact = await findOrCreateContactByPhone(phonenum);

  // 0) SYSTEM keyword first
  let mode = null;

  const sysFlow = await findSystemFlowByKeyword(messageText);
  if (sysFlow) {
    mode = { type: "SYSTEM", userflowid: sysFlow.userflowid, system: sysFlow };
  } else {
    const campaign = await findCampaignByKeyword(messageText);
    if (campaign) mode = { type: "CAMPAIGN", userflowid: campaign.userflowid, campaign };
  }

  if (!mode && !contact.tos_accepted) {
    const onboarding = await prisma.system_flow.findFirst({
      where: { code: "ONBOARDING", is_active: true },
    });
    if (onboarding) {
      mode = { type: "SYSTEM", userflowid: onboarding.userflowid, system: onboarding };
    }
  }

  if (!mode) {
    const startFlow = await prisma.system_flow.findFirst({
      where: { code: "START", is_active: true },
    });
    if (startFlow) {
      mode = { type: "SYSTEM", userflowid: startFlow.userflowid, system: startFlow };
    }
  }

  if (!mode) {
    return { action: "no_campaign", reply: null, reason: "no keyword matched" };
  }

  const userflowid = Number(mode.userflowid);
  const campaign = mode.campaign || null;

  const session = await findOrCreateSession(contact.contactid, mode);

  // ---- your expiry + blocked checks (unchanged) ----
  const now = new Date();
  const lastActive = session.lastactiveat ? new Date(session.lastactiveat) : null;

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
      reply: "Hi! This chat session has ended.\n\nPlease send a keyword to start again.",
      sessionid: session.campaignsessionid,
      campaignid: campaign?.campaignid || null,
      nextKey: null,
    };
  }

  if (session.sessionstatus === SESSION_STATUS.PAUSED) {
    return {
      action: "paused",
      reply: "Your session is paused. Please contact support.",
      sessionid: session.campaignsessionid,
      campaignid: campaign?.campaignid || null,
    };
  }
  if (session.sessionstatus === SESSION_STATUS.COMPLETED) {
    return {
      action: "completed",
      reply: "You have already completed this flow.",
      sessionid: session.campaignsessionid,
      campaignid: campaign?.campaignid || null,
    };
  }
  if (session.sessionstatus === SESSION_STATUS.EXPIRED) {
    return {
      action: "expired",
      reply: "Hi! This chat session has ended.\n\nPlease send a keyword to start again.",
      sessionid: session.campaignsessionid,
      campaignid: campaign?.campaignid || null,
      nextKey: null,
    };
  }

  // 6) Determine next key (your logic unchanged)
  const checkpoint = session.checkpoint;
  let nextKey = null;
  let keysToSend = [];

  if (!checkpoint) {
    const autoPath = await computeEntryAutoPath({ userflowid });
    nextKey = autoPath.checkpointKey;
    keysToSend = autoPath.keysToSend || [];
  } else {
    const br = await prisma.branchrule.findFirst({
      where: {
        triggerkey: checkpoint,
        userflowid,
        OR: [
          { inputvalue: { equals: messageText, mode: "insensitive" } },
          { inputvalue: { equals: "ANY", mode: "insensitive" } },
          { inputvalue: { equals: "*", mode: "insensitive" } },
        ],
      },
      orderBy: { priority: "asc" },
    });

    if (br) {
      nextKey = br.nextkey;
    } else {
      const nodeFb = await prisma.fallback.findFirst({
        where: { scope: "NODE", value: checkpoint, userflowid },
      });

      const flowFb = !nodeFb
        ? await prisma.fallback.findFirst({
          where: { scope: "FLOW", value: "GLOBAL_FALLBACK", userflowid },
        })
        : null;

      nextKey = nodeFb?.contentkeyid || flowFb?.contentkeyid || null;
    }
  }

  if (!nextKey) {
    return { action: "no_campaign", reply: null, reason: "no nextKey determined" };
  }

  // ✅ NEW: auto-run DECISION + API nodes
  let guard = 0;
  while (nextKey && guard < 20) {
    guard++;

    const node = await loadNodeWithContent(nextKey, userflowid);
    if (!node) break;

    const nodeType = normalizeNodeType(node.type);
    const ctx = { contact, session, campaign, last_user_answer: messageText };

    if (nodeType === "decision") {
      const rules = node.placeholders?.decisionRules || [];
      const elseKey = node.placeholders?.elseKey || null;

      const resolved = evaluateDecisionRules(rules, ctx);
      nextKey = resolved || elseKey;

      if (!nextKey) {
        const flowFb = await prisma.fallback.findFirst({
          where: { scope: "FLOW", value: "GLOBAL_FALLBACK", userflowid },
        });
        nextKey = flowFb?.contentkeyid || null;
      }
      continue;
    }

    if (nodeType === "api") {
      const endpointId = node.placeholders?.endpointId || null;
      const apiSuccessKey = node.placeholders?.apiSuccessKey || null;
      const apiErrorKey = node.placeholders?.apiErrorKey || null;

      const apiRes = await callApiEndpoint(endpointId, ctx, campaign, session);

      nextKey = apiRes.ok ? apiSuccessKey : apiErrorKey;

      if (!nextKey) {
        const nodeFb = await prisma.fallback.findFirst({
          where: { scope: "NODE", value: node.key, userflowid },
        });
        const flowFb = !nodeFb
          ? await prisma.fallback.findFirst({
            where: { scope: "FLOW", value: "GLOBAL_FALLBACK", userflowid },
          })
          : null;

        nextKey = nodeFb?.contentkeyid || flowFb?.contentkeyid || null;
      }
      continue;
    }

    if (nodeType === "jump") {
      const jumpNextKey = node.placeholders?.jumpNextKey || null;
      nextKey = jumpNextKey;

      if (!nextKey) {
        const flowFb = await prisma.fallback.findFirst({
          where: { scope: "FLOW", value: "GLOBAL_FALLBACK", userflowid },
        });
        nextKey = flowFb?.contentkeyid || null;
      }
      continue;
    }

    // stop on message/template/wait_input
    break;
  }

  // 7) Terminal?
  const nextKeyIsTerminal = nextKey
    ? await isTerminalNode(nextKey, userflowid)
    : false;

  // 8) Persist session (same as yours)
  if (nextKey) {
    await prisma.campaignsession.update({
      where: { campaignsessionid: session.campaignsessionid },
      data: {
        checkpoint: nextKey,
        lastactiveat: new Date(),
        sessionstatus: nextKeyIsTerminal
          ? SESSION_STATUS.COMPLETED
          : session.sessionstatus,
        current_userflowid: userflowid,
      },
    });
  } else {
    await prisma.campaignsession.update({
      where: { campaignsessionid: session.campaignsessionid },
      data: {
        lastactiveat: new Date(),
        current_userflowid: userflowid,
      },
    });
  }

  // 9) Log (same as yours)
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
    campaignid: campaign?.campaignid || null,
    userflowid,
    nextKey,
    keysToSend,
    completed: nextKeyIsTerminal,
  };
}

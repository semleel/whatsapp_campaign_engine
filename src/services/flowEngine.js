// src/services/flowEngine.js
import { prisma } from "../config/prismaClient.js";
import { sendWhatsAppMessage } from "./whatsappService.js";
import { buildWhatsappMessageFromContent } from "./whatsappContentService.js";
import { log, error as logError } from "../utils/logger.js";
import { SESSION_EXPIRY_MINUTES } from "../config/index.js";

export const SESSION_STATUS = {
  ACTIVE: "ACTIVE",
  PAUSED: "PAUSED",
  COMPLETED: "COMPLETED",
  EXPIRED: "EXPIRED",
  CANCELLED: "CANCELLED",
};

// Global start + menu handling
const GLOBAL_START_CODE = "START";
const GLOBAL_END_CODE = "END";
const MAIN_MENU_TITLE = "START_MENU";
const EXPIRY_MS = SESSION_EXPIRY_MINUTES * 60 * 1000;
const ENTRY_AUTO_PATH_MAX_STEPS = 50;

function normalizeNodeType(rawType = "") {
  const safe = String(rawType || "").toLowerCase();
  if (safe === "wait_input" || safe === "question") return "message";
  return safe || "message";
}

function buildTemplateContext(contact) {
  return {
    contact_name: contact?.name || contact?.phonenum || "there",
    phone: contact?.phonenum || "",
  };
}

async function sendContentKey({
  contact,
  session,
  contentKey,
  userflowid,
  updateCheckpoint = true,
}) {
  if (!contact || !session || !contentKey) return null;

  const mapping = await prisma.keymapping.findFirst({
    where: {
      contentkeyid: contentKey,
      userflowid: Number(userflowid || session.current_userflowid),
    },
    include: { content: true },
  });

  if (!mapping?.content || mapping.content.isdeleted) return null;

  const ctx = buildTemplateContext(contact);
  const built = buildWhatsappMessageFromContent(mapping.content, ctx);
  const messagePayload =
    built?.message || { type: "text", text: { body: built?.replyText || "" } };

  const msgRecord = await prisma.message.create({
    data: {
      direction: "outbound",
      content_type: messagePayload.type || "text",
      message_content: built?.replyText || "",
      senderid: "whatsapp-engine",
      receiverid: contact.phonenum,
      provider_msg_id: null,
      timestamp: new Date(),
      message_status: "pending",
      payload_json: JSON.stringify(messagePayload),
      contactid: contact.contactid,
      campaignsessionid: session.campaignsessionid,
      campaignid: session.campaignid || null,
      contentkeyid: contentKey,
    },
  });

  let providerId = null;
  try {
    const sendRes = await sendWhatsAppMessage(
      contact.phonenum,
      messagePayload,
      msgRecord
    );
    providerId = sendRes?.messages?.[0]?.id ?? null;
  } catch (err) {
    log("ERROR", "Failed to send content key", contentKey, err?.message || err);
  }

  if (providerId) {
    await prisma.message.update({
      where: { messageid: msgRecord.messageid },
      data: { provider_msg_id: providerId },
    });
  }

  const sessionUpdate = {
    lastactiveat: new Date(),
    sessionstatus: SESSION_STATUS.ACTIVE,
  };
  if (updateCheckpoint) {
    sessionUpdate.checkpoint = contentKey;
  }

  await prisma.campaignsession.update({
    where: { campaignsessionid: session.campaignsessionid },
    data: sessionUpdate,
  });

  // keep in-memory session up to date for caller loops
  session.checkpoint = updateCheckpoint ? contentKey : session.checkpoint;
  session.lastactiveat = sessionUpdate.lastactiveat;
  session.current_userflowid = session.current_userflowid || userflowid;

  return contentKey;
}

async function sendNodeFallbackIfAny(contact, session, currentNodeKey) {
  if (!currentNodeKey) return false;
  const fb = await prisma.fallback.findFirst({
    where: {
      scope: "NODE",
      value: currentNodeKey,
      userflowid: session.current_userflowid || undefined,
    },
  });

  if (!fb?.contentkeyid) return false;

  const sent = await sendContentKey({
    contact,
    session,
    contentKey: fb.contentkeyid,
    userflowid: session.current_userflowid,
    updateCheckpoint: false,
  });

  return Boolean(sent);
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
    ui_metadata: km.ui_metadata || {},
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

async function findAnyBranchFromNode(userflow, currentKey) {
  if (!userflow?.userflowid || !currentKey) return null;
  return prisma.branchrule.findFirst({
    where: {
      userflowid: userflow.userflowid,
      triggerkey: currentKey,
      inputvalue: "ANY",
    },
    orderBy: { priority: "asc" },
  });
}

async function loadNodeDefinition(userflow, contentKey) {
  if (!userflow?.userflowid || !contentKey) return null;
  const km = await prisma.keymapping.findFirst({
    where: { contentkeyid: contentKey, userflowid: userflow.userflowid },
    include: { content: true },
  });
  if (!km?.content) return null;
  return {
    key: km.contentkeyid,
    type: normalizeNodeType(km.content.type),
    interactiveType:
      (km.content.placeholders?.interactiveType || km.ui_metadata?.interactiveType || "none").toLowerCase(),
    content: km.content,
  };
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

/**
 * Resolve the entry content key for a campaign.
 * Preference order:
 *   1) campaign.entry_contentkeyid (explicit entry)
 *   2) campaign.contentkeyid (legacy field)
 * Returns null if none exist.
 */
export function getEntryContentKeyForCampaign(campaign) {
  if (!campaign) return null;
  return campaign.entry_contentkeyid || campaign.contentkeyid || null;
}

async function getActiveStartSystemFlow() {
  return prisma.system_flow.findFirst({
    where: { code: GLOBAL_START_CODE, is_active: true },
    select: { systemflowid: true, userflowid: true },
  });
}

export async function getOrCreateActiveSessionForGlobalStart(contactId) {
  if (!contactId) return null;

  const systemStart = await prisma.system_flow.findFirst({
    where: { code: GLOBAL_START_CODE, is_active: true },
  });
  if (!systemStart) {
    throw new Error("No active GLOBAL_START system flow configured.");
  }

  const activeSession = await prisma.campaignsession.findFirst({
    where: {
      contactid: contactId,
      sessionstatus: SESSION_STATUS.ACTIVE,
      campaignid: null,
      current_userflowid: systemStart.userflowid,
    },
    orderBy: { createdat: "desc" },
  });

  if (activeSession) {
    // One active session per contact: expire older ACTIVE sessions
    await prisma.campaignsession.updateMany({
      where: {
        contactid: contactId,
        sessionstatus: SESSION_STATUS.ACTIVE,
        campaignsessionid: { not: activeSession.campaignsessionid },
      },
      data: { sessionstatus: SESSION_STATUS.EXPIRED },
    });
    return activeSession;
  }

  const newSession = await prisma.campaignsession.create({
    data: {
      contactid: contactId,
      campaignid: null,
      checkpoint: null,
      sessionstatus: SESSION_STATUS.ACTIVE,
      current_userflowid: systemStart.userflowid,
      lastactiveat: new Date(),
    },
  });

  return newSession;
}

export async function findGlobalStartMainMenuKey() {
  const systemStart = await prisma.system_flow.findFirst({
    where: { code: GLOBAL_START_CODE, is_active: true },
  });
  if (!systemStart) return null;

  const km = await prisma.keymapping.findFirst({
    where: {
      userflowid: systemStart.userflowid,
      ui_metadata: {
        path: ["title"],
        equals: MAIN_MENU_TITLE,
      },
    },
  });

  return km ? km.contentkeyid : null;
}

export async function sendGlobalStartMainMenu(contact, session) {
  if (!contact || !session) return null;
  const menuKey = await findGlobalStartMainMenuKey();
  if (!menuKey) {
    log("WARN", "No START_MENU key found; cannot send main menu.");
    return null;
  }

  const sentKey = await sendContentKey({
    contact,
    session,
    contentKey: menuKey,
    userflowid: session.current_userflowid,
    updateCheckpoint: true,
  });

  if (!sentKey) {
    log("WARN", `No content found for main menu key ${menuKey}`);
  }

  return sentKey;
}

export async function resetAndRunGlobalStart(contact) {
  if (!contact?.contactid) return null;

  await prisma.campaignsession.updateMany({
    where: {
      contactid: contact.contactid,
      sessionstatus: SESSION_STATUS.ACTIVE,
    },
    data: { sessionstatus: SESSION_STATUS.EXPIRED },
  });

  const systemStart = await prisma.system_flow.findFirst({
    where: { code: GLOBAL_START_CODE, is_active: true },
  });
  if (!systemStart) {
    throw new Error("No active GLOBAL_START system flow configured.");
  }

  const session = await prisma.campaignsession.create({
    data: {
      contactid: contact.contactid,
      campaignid: null,
      checkpoint: null,
      sessionstatus: SESSION_STATUS.ACTIVE,
      current_userflowid: systemStart.userflowid,
      lastactiveat: new Date(),
    },
  });

  const autoPath = await computeEntryAutoPath({ userflowid: systemStart.userflowid });
  const keysToSend = [];
  if (Array.isArray(autoPath.keysToSend)) {
    keysToSend.push(...autoPath.keysToSend);
  }
  if (autoPath.checkpointKey && !keysToSend.includes(autoPath.checkpointKey)) {
    keysToSend.push(autoPath.checkpointKey);
  }

  for (const key of keysToSend) {
    await sendContentKey({
      contact,
      session,
      contentKey: key,
      userflowid: systemStart.userflowid,
      updateCheckpoint: true,
    });
  }

  return session;
}

export async function jumpToGlobalStartMainMenu(contact) {
  if (!contact?.contactid) return null;
  const session = await getOrCreateActiveSessionForGlobalStart(contact.contactid);
  await sendGlobalStartMainMenu(contact, session);
  return session;
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
        code: GLOBAL_START_CODE,
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

export async function getSystemStartFlowAndEntryKey() {
  const sysStart = await prisma.system_flow.findFirst({
    where: { code: GLOBAL_START_CODE, is_active: true },
  });
  if (!sysStart) return null;

  const userflowid = sysStart.userflowid;
  const entryFallback = await prisma.fallback.findFirst({
    where: {
      scope: "FLOW",
      value: "ENTRY",
      userflowid,
    },
  });

  if (!entryFallback) {
    return { userflowid, entryKey: null };
  }

  return { userflowid, entryKey: entryFallback.contentkeyid };
}

export async function getActiveSessionForContact(contactid) {
  if (!contactid) return null;
  return prisma.campaignsession.findFirst({
    where: { contactid, sessionstatus: SESSION_STATUS.ACTIVE },
    orderBy: { campaignsessionid: "desc" },
  });
}

export async function expireActiveSessionsForContact(contactid) {
  if (!contactid) return;
  await prisma.campaignsession.updateMany({
    where: { contactid, sessionstatus: SESSION_STATUS.ACTIVE },
    data: { sessionstatus: SESSION_STATUS.EXPIRED },
  });
}

export async function getOrCreateGlobalMenuSession(contactid) {
  if (!contactid) return null;

  const existing = await getActiveSessionForContact(contactid);
  if (existing) return existing;

  const sysStart = await getSystemStartFlowAndEntryKey();
  if (!sysStart || !sysStart.userflowid) {
    return null;
  }

  const now = new Date();
  return prisma.campaignsession.create({
    data: {
      contactid,
      campaignid: null,
      checkpoint: sysStart.entryKey || null,
      sessionstatus: SESSION_STATUS.ACTIVE,
      createdat: now,
      lastactiveat: now,
      current_userflowid: sysStart.userflowid,
    },
  });
}

export async function runFlowFromNodeKey({ userflowid, contentkeyid, session, contact }) {
  if (!userflowid || !contentkeyid || !session || !contact) return null;
  await sendContentKey({
    contact,
    session,
    contentKey: contentkeyid,
    userflowid,
    updateCheckpoint: true,
  });
  return contentkeyid;
}

export async function runFlowNode({ session, userflow, currentKey, incoming, contact }) {
  if (!session || !userflow || !currentKey) return null;
  const nodeDef = await loadNodeDefinition(userflow, currentKey);
  if (!nodeDef) return null;

  await sendContentKey({
    contact: contact || incoming?.contact || incoming?.contactInfo || incoming?.contactObj || incoming?.contactRef || incoming?.contactData || incoming?.contact || null,
    session,
    contentKey: currentKey,
    userflowid: userflow.userflowid,
    updateCheckpoint: true,
  });

  return {
    nodeType: nodeDef.type,
    interactiveType: nodeDef.interactiveType,
    currentKey,
  };
}

export async function runFlowNodeWithAutoAdvance({ session, userflow, startKey, incoming, contact }) {
  if (!session || !userflow || !startKey) return null;

  let currentKey = startKey;
  let guard = 0;
  let stopReason = "unknown";

  while (currentKey && guard < 20) {
    guard += 1;

    const node = await loadNodeDefinition(userflow, currentKey);
    if (!node) {
      stopReason = "no_node";
      break;
    }

    const result = await runFlowNode({
      session,
      userflow,
      currentKey,
      incoming,
      contact,
    });

    const nodeType = result?.nodeType || node.type || "message";
    const interactiveType = (result?.interactiveType || node.interactiveType || "none").toLowerCase();

    const expectsUserReply =
      nodeType === "decision" ||
      nodeType === "wait_input" ||
      nodeType === "jump" ||
      nodeType === "api" ||
      interactiveType === "buttons" ||
      interactiveType === "list";

    if (expectsUserReply) {
      stopReason = "await_input";
      break;
    }

    const anyBranch = await findAnyBranchFromNode(userflow, currentKey);
    if (!anyBranch?.nextkey) {
      stopReason = "no_next";
      await runSystemEndFlowOnce(contact, session);
      break;
    }

    currentKey = anyBranch.nextkey;
    incoming = null;
  }

  return { lastKey: currentKey, stopReason };
}

export async function runFlowFromNode({
  contact,
  session,
  userflow,
  startKey,
  campaign = null,
  fromKeyword = false,
}) {
  if (!contact || !session || !userflow || !startKey) return null;

  const result = await runFlowNodeWithAutoAdvance({
    session,
    userflow,
    startKey,
    incoming: { contact },
    contact,
  });

  const lastKey = result?.lastKey || startKey;
  const stopReason = result?.stopReason || "unknown";

  // If flow ended (no_next) and this is a campaign, mark completed
  if (stopReason === "no_next" && session.campaignid) {
    await prisma.campaignsession.update({
      where: { campaignsessionid: session.campaignsessionid },
      data: {
        sessionstatus: SESSION_STATUS.COMPLETED,
        checkpoint: lastKey,
        lastactiveat: new Date(),
        current_userflowid: userflow.userflowid,
      },
    });
  }

  return lastKey;
}

// NEW: run END system_flow when a session is completed
export async function runSystemEndFlowOnce(contact, session) {
  if (!contact || !session) return;
  try {
    const endSystemFlow = await prisma.system_flow.findFirst({
      where: { code: "END", is_active: true },
      include: { userflow: true },
    });

    if (!endSystemFlow?.userflow) {
      log?.("[END_FLOW] No active system_flow with code=END, skipping.");
      return;
    }

    const endUserflow = endSystemFlow.userflow;
    let entryKey = endUserflow.entry_contentkeyid || null;

    if (!entryKey) {
      const startKm = await prisma.keymapping.findFirst({
        where: {
          userflowid: endUserflow.userflowid,
          contentkeyid: "START",
        },
        include: { content: true },
      });

      if (!startKm?.content) {
        log?.(
          "[END_FLOW] END userflow found but no entry key or START keymapping with content."
        );
        return;
      }

      entryKey = startKm.contentkeyid;

      await sendWhatsAppMessage(contact.phonenum, {
        type: "text",
        text: { body: startKm.content.body || "" },
      });
    } else {
      const entryKm = await prisma.keymapping.findFirst({
        where: {
          userflowid: endUserflow.userflowid,
          contentkeyid: entryKey,
        },
        include: { content: true },
      });

      if (!entryKm?.content) {
        log?.(
          "[END_FLOW] END userflow entry_contentkeyid set, but no keymapping/content found."
        );
        return;
      }

      await sendWhatsAppMessage(contact.phonenum, {
        type: "text",
        text: { body: entryKm.content.body || "" },
      });
    }

    await prisma.campaignsession.update({
      where: { campaignsessionid: session.campaignsessionid },
      data: {
        sessionstatus: SESSION_STATUS.COMPLETED,
        checkpoint: entryKey,
        current_userflowid: endUserflow.userflowid,
        lastactiveat: new Date(),
      },
    });

    log?.(
      `[END_FLOW] Sent END flow entry node (${entryKey}) for session ${session.campaignsessionid}.`
    );
  } catch (err) {
    logError?.("[END_FLOW] Failed to run END flow:", err);
  }
}

export async function resetAndRunGlobalMenu(contact) {
  if (!contact?.contactid) return;

  await expireActiveSessionsForContact(contact.contactid);

  const sysStart = await getSystemStartFlowAndEntryKey();
  if (!sysStart || !sysStart.userflowid || !sysStart.entryKey) {
    log("WARN", "No START flow configured for global menu.");
    return;
  }

  const now = new Date();
  const session = await prisma.campaignsession.create({
    data: {
      contactid: contact.contactid,
      campaignid: null,
      checkpoint: sysStart.entryKey,
      sessionstatus: SESSION_STATUS.ACTIVE,
      createdat: now,
      lastactiveat: now,
      current_userflowid: sysStart.userflowid,
    },
  });

  await runFlowFromNodeKey({
    userflowid: sysStart.userflowid,
    contentkeyid: sysStart.entryKey,
    session,
    contact,
  });
}

export async function startCampaignFromMenuSelection({ contact, campaignId }) {
  if (!contact?.contactid || !campaignId) return;

  const campaign = await prisma.campaign.findUnique({
    where: { campaignid: campaignId },
    include: { userflow: true },
  });

  if (!campaign || !campaign.userflow) {
    await sendWhatsAppMessage(contact.phonenum, {
      type: "text",
      text: { body: "Sorry, this campaign is not configured yet." },
    });
    return;
  }

  const userflow = campaign.userflow;

  let entryKey = campaign.entry_contentkeyid || userflow.entry_contentkeyid || null;
  if (!entryKey) {
    const entryFallback = await prisma.fallback.findFirst({
      where: {
        scope: "FLOW",
        value: "ENTRY",
        userflowid: userflow.userflowid,
      },
    });
    entryKey = entryFallback?.contentkeyid || null;
  }

  if (!entryKey) {
    await sendWhatsAppMessage(contact.phonenum, {
      type: "text",
      text: { body: "Sorry, this campaign flow has no entry action configured." },
    });
    return;
  }

  await expireActiveSessionsForContact(contact.contactid);

  const now = new Date();
  const session = await prisma.campaignsession.create({
    data: {
      contactid: contact.contactid,
      campaignid: campaign.campaignid,
      checkpoint: entryKey,
      sessionstatus: SESSION_STATUS.ACTIVE,
      createdat: now,
      lastactiveat: now,
      current_userflowid: userflow.userflowid,
    },
  });

  await runFlowFromNode({
    contact,
    session,
    userflow,
    campaign,
    startKey: entryKey,
    fromKeyword: false,
  });
}

export async function createOrResetSessionForContact(contact, { reason = "start", defaultUserflowId }) {
  if (!contact?.contactid) return null;

  await expireActiveSessionsForContact(contact.contactid);

  const session = await prisma.campaignsession.create({
    data: {
      contactid: contact.contactid,
      campaignid: null,
      checkpoint: null,
      sessionstatus: SESSION_STATUS.ACTIVE,
      createdat: new Date(),
      lastactiveat: new Date(),
      current_userflowid: defaultUserflowId || null,
    },
  });

  return session;
}

export async function runSystemStartFlow({ contact, triggerReason }) {
  const systemStart = await prisma.system_flow.findFirst({
    where: { code: GLOBAL_START_CODE, is_active: true },
    include: { userflow: true },
  });
  if (!systemStart?.userflow) {
    throw new Error("System START flow is not configured");
  }

  const userflow = systemStart.userflow;
  const session = await createOrResetSessionForContact(contact, {
    reason: triggerReason || "start",
    defaultUserflowId: userflow.userflowid,
  });

  const entryKey =
    userflow.entry_contentkeyid ||
    (await getEntryKeyForUserflow(userflow.userflowid)) ||
    "START";

  await runFlowNodeWithAutoAdvance({
    session,
    userflow,
    startKey: entryKey,
    incoming: { contact },
    contact,
  });

  return session;
}

async function isGlobalStartFlow(userflowid) {
  if (!userflowid) return false;
  const systemStart = await prisma.system_flow.findFirst({
    where: { code: GLOBAL_START_CODE, is_active: true },
  });
  if (!systemStart) return false;
  return Number(systemStart.userflowid) === Number(userflowid);
}

async function handleUnmatchedDecisionInput({ contact, session, currentNodeKey, userText }) {
  try {
    await sendNodeFallbackIfAny(contact, session, currentNodeKey);
  } catch (err) {
    log("WARN", "Failed to send node-level fallback", err?.message || err);
  }

  await jumpToGlobalStartMainMenu(contact);

  await prisma.sessionlog.create({
    data: {
      campaignsessionid: session.campaignsessionid,
      contentkeyid: currentNodeKey ?? null,
      detail: `unmatched input: ${String(userText || "").slice(0, 200)}`,
    },
  });

  return {
    action: "menu_resent",
    sessionid: session.campaignsessionid,
    campaignid: session.campaignid || null,
    userflowid: session.current_userflowid,
  };
}

/**
 * Find or create a session for:
 *  - CAMPAIGN flow: (contactid + campaignid)
 *  - SYSTEM flow: (contactid + current_userflowid, campaignid null)
 */
export async function findOrCreateSession(contactid, { campaign, userflowid }) {
  const contactIdNum = Number(contactid);
  if (campaign) {
    const existing = await prisma.campaignsession.findFirst({
      where: {
        contactid: contactIdNum,
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

    const session = await prisma.campaignsession.create({
      data: {
        contactid: contactIdNum,
        campaignid: Number(campaign.campaignid),
        checkpoint: null,
        sessionstatus: SESSION_STATUS.ACTIVE,
        lastactiveat: new Date(),
        current_userflowid: campaign.userflowid,
      },
    });

    await prisma.campaignsession.updateMany({
      where: {
        contactid: contactIdNum,
        sessionstatus: SESSION_STATUS.ACTIVE,
        campaignsessionid: { not: session.campaignsessionid },
      },
      data: { sessionstatus: SESSION_STATUS.EXPIRED },
    });

    return session;
  }

  // SYSTEM
  const existing = await prisma.campaignsession.findFirst({
    where: {
      contactid: contactIdNum,
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

  const session = await prisma.campaignsession.create({
    data: {
      contactid: contactIdNum,
      campaignid: null,
      checkpoint: null,
      sessionstatus: SESSION_STATUS.ACTIVE,
      lastactiveat: new Date(),
      current_userflowid: Number(userflowid),
    },
  });

  await prisma.campaignsession.updateMany({
    where: {
      contactid: contactIdNum,
      sessionstatus: SESSION_STATUS.ACTIVE,
      campaignsessionid: { not: session.campaignsessionid },
    },
    data: { sessionstatus: SESSION_STATUS.EXPIRED },
  });

  return session;
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
  const normalizedLower = messageText.toLowerCase();

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
      where: { code: GLOBAL_START_CODE, is_active: true },
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
  const currentNode = checkpoint
    ? await loadNodeWithContent(checkpoint, userflowid)
    : null;

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
      const isDecisionNode =
        currentNode && normalizeNodeType(currentNode.type) === "decision";

      if (
        isDecisionNode &&
        (await isGlobalStartFlow(userflowid)) &&
        normalizedLower !== "/reset" &&
        normalizedLower !== "/start"
      ) {
        return handleUnmatchedDecisionInput({
          contact,
          session,
          currentNodeKey: checkpoint,
          userText: messageText,
        });
      }

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
    await runSystemEndFlowOnce(contact, session);
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
    await runSystemEndFlowOnce(contact, session);
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

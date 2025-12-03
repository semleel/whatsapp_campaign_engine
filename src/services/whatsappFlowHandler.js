// src/services/whatsappFlowHandler.js
import { prisma } from "../config/prismaClient.js";
import { error } from "../utils/logger.js";
import { ensureResetKeywordPointsToStart, processIncomingMessage } from "./flowEngine.js";
import {
    loadContentByKey,
    buildContentSequence,
} from "./whatsappContentService.js";
import {
    buildGlobalFallbackBundle,
    loadGlobalFallbackMessage,
} from "./whatsappFallbackService.js";

function makeResult({
    replyText,
    replyMessageObj,
    sessionid = null,
    campaignid = null,
    contentkeyid = null,
    extraReplies = [],
}) {
    return {
        replyText,
        replyMessageObj,
        sessionid,
        campaignid,
        contentkeyid,
        extraReplies,
    };
}

/**
 * Allowed input guard (same as before)
 */
async function enforceAllowedInputIfNeeded(lastOutboundKey, textLower, contact) {
    if (!lastOutboundKey) return null;

    const allowed = await prisma.allowedinput.findMany({
        where: { triggerkey: lastOutboundKey },
        select: { allowedvalue: true },
        take: 50,
    });

    if (!allowed.length) return null;

    const allowedSet = new Set(
        allowed.map((a) => (a.allowedvalue || "").toLowerCase())
    );

    if (allowedSet.has("any")) return null;
    if (allowedSet.has(textLower)) return null;

    // NODE fallback
    const nodeFb = await prisma.fallback.findFirst({
        where: { scope: "NODE", value: lastOutboundKey },
    });

    if (nodeFb?.contentkeyid) {
        const fbContent = await loadContentByKey(nodeFb.contentkeyid, contact);
        if (fbContent) {
            return makeResult({
                replyText: fbContent.replyText,
                replyMessageObj: fbContent.replyMessageObj,
                contentkeyid: fbContent.contentkeyid,
            });
        }
    }

    const { main, extras } = await buildGlobalFallbackBundle(contact);
    return makeResult({
        replyText: main.replyText,
        replyMessageObj: main.replyMessageObj,
        contentkeyid: main.contentkeyid || null,
        extraReplies: extras,
    });
}

/**
 * Resolve system keyword → userflow jump (DB configurable)
 */
async function resolveSystemKeyword(normalizedLower) {
    if (normalizedLower === "/reset") {
        const resetTarget = await ensureResetKeywordPointsToStart();
        if (resetTarget?.userflowid) {
            return {
                keyword: "/reset",
                userflowid: resetTarget.userflowid,
                systemflowid: resetTarget.systemflowid || null,
                systemflowcode: "START",
            };
        }
    }

    const sysKw = await prisma.system_keyword.findFirst({
        where: {
            keyword: normalizedLower,
            is_active: true,
        },
        include: {
            system_flow: true,
        },
    });

    if (!sysKw) return null;

    if (normalizedLower === "/reset" && sysKw.system_flow?.code !== "START") {
        const resetTarget = await ensureResetKeywordPointsToStart();
        if (resetTarget?.userflowid) {
            return {
                keyword: "/reset",
                userflowid: resetTarget.userflowid,
                systemflowid: resetTarget.systemflowid || null,
                systemflowcode: "START",
            };
        }
    }

    // If connected to a system_flow (code alias), prefer that flow's userflowid
    const targetUserflowid =
        sysKw.system_flow?.userflowid || sysKw.userflowid;

    return {
        keyword: sysKw.keyword,
        userflowid: targetUserflowid,
        systemflowid: sysKw.systemflowid || null,
        systemflowcode: sysKw.system_flow?.code || null,
    };
}

/**
 * Handle ALL text via flowEngine + system keywords.
 */
export async function handleFlowOrKeyword({ from, text, contact }) {
    const normalizedOriginal = (text || "").trim();
    const normalizedLower = normalizedOriginal.toLowerCase();

    // last outbound key
    let lastOutboundKey = null;
    if (contact?.contactid) {
        const lastOutbound = await prisma.message.findFirst({
            where: { contactid: contact.contactid, direction: "outbound" },
            orderBy: { timestamp: "desc" },
            select: { contentkeyid: true },
        });
        lastOutboundKey = lastOutbound?.contentkeyid || null;
    }

    const sysJump = await resolveSystemKeyword(normalizedLower);

    // Allowed-input guard
    const guardRes = sysJump
        ? null
        : await enforceAllowedInputIfNeeded(
            lastOutboundKey,
            normalizedLower,
            contact
        );
    if (guardRes) return guardRes;

    // Normal engine path
    try {
        const flow = await processIncomingMessage({
            from,
            text: normalizedOriginal,
        });

        if (!flow || !flow.action) {
            const { main, extras } = await buildGlobalFallbackBundle(contact);
            return makeResult({
                replyText: main.replyText,
                replyMessageObj: main.replyMessageObj,
                contentkeyid: main.contentkeyid || null,
                extraReplies: extras,
            });
        }

        if (flow.action === "no_campaign") {
            const { main, extras } = await buildGlobalFallbackBundle(contact);
            return makeResult({
                replyText: main.replyText,
                replyMessageObj: main.replyMessageObj,
                contentkeyid: main.contentkeyid || null,
                extraReplies: extras,
            });
        }

        if (flow.action === "paused" || flow.action === "completed") {
            let replyText = flow.reply;
            if (!replyText) {
                const gf = await loadGlobalFallbackMessage(contact);
                replyText = gf?.replyText || "Session state blocked.";
            }
            return makeResult({
                replyText,
                replyMessageObj: { type: "text", text: { body: replyText } },
                sessionid: flow.sessionid || null,
                campaignid: flow.campaignid || null,
            });
        }

        if (flow.action === "expired") {
            const replyText = flow.reply;
            return makeResult({
                replyText,
                replyMessageObj: { type: "text", text: { body: replyText } },
                sessionid: flow.sessionid,
                campaignid: flow.campaignid,
            });
        }

        if (flow.action === "moved") {
            const sessionid = flow.sessionid || null;
            const campaignid = flow.campaignid || null;
            const keysForReply = Array.isArray(flow.keysToSend) && flow.keysToSend.length
                ? flow.keysToSend
                : flow.nextKey
                    ? [flow.nextKey]
                    : [];

            if (keysForReply.length) {
                const seq = await buildContentSequence(
                    keysForReply,
                    contact,
                    flow.userflowid || null
                );

                if (seq.length) {
                    const [first, ...rest] = seq;
                    return makeResult({
                        replyText: first.replyText,
                        replyMessageObj: first.replyMessageObj,
                        sessionid,
                        campaignid,
                        contentkeyid: first.contentkeyid,
                        extraReplies: rest,
                    });
                }

                throw new Error(`Missing content for key=${keysForReply[0]}`);
            }

            const { main, extras } = await buildGlobalFallbackBundle(contact);
            return makeResult({
                replyText: main.replyText,
                replyMessageObj: main.replyMessageObj,
                contentkeyid: main.contentkeyid || null,
                extraReplies: extras,
                sessionid,
                campaignid,
            });
        }

        const { main, extras } = await buildGlobalFallbackBundle(contact);
        return makeResult({
            replyText: main.replyText,
            replyMessageObj: main.replyMessageObj,
            contentkeyid: main.contentkeyid || null,
            extraReplies: extras,
        });
    } catch (err) {
        error("Error in processIncomingMessage:", err);
        const { main, extras } = await buildGlobalFallbackBundle(contact);
        return makeResult({
            replyText: main.replyText,
            replyMessageObj: main.replyMessageObj,
            contentkeyid: main.contentkeyid || null,
            extraReplies: extras,
        });
    }
}

/**
 * Button reply handler:
 * Treat button id as normal input text.
 */
export async function handleButtonReply({ id, contact, from }) {
    const btnText = (id || "").trim();
    return handleFlowOrKeyword({
        from,
        text: btnText,
        contact,
    });
}

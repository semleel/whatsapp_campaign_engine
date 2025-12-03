// src/services/whatsappFallbackService.js
import { prisma } from "../config/prismaClient.js";
import { buildWhatsappMenuList } from "./whatsappMenuService.js";
import { loadContentByKey } from "./whatsappContentService.js";

/**
 * Resolve system flow ENTRY content by system_flow.code
 */
async function loadSystemFlowEntryContent(code, contact) {
    let sf = await prisma.system_flow.findFirst({
        where: { code, is_active: true },
        select: { userflowid: true },
    });
    if (!sf && code === "GLOBAL_FALLBACK") {
        sf = await prisma.system_flow.findFirst({
            where: { code: "START", is_active: true },
            select: { userflowid: true },
        });
    }
    if (!sf) throw new Error(`Missing active system_flow: ${code}`);

    const entryFb = await prisma.fallback.findFirst({
        where: {
            userflowid: sf.userflowid,
            scope: "FLOW",
            value: "ENTRY",
        },
        select: { contentkeyid: true },
    });
    if (!entryFb?.contentkeyid)
        throw new Error(`Missing ENTRY fallback for system_flow: ${code}`);

    return loadContentByKey(entryFb.contentkeyid, contact);
}

/**
 * Build Reset button based on system_keyword tied to RESET flow
 */
async function buildResetButton(contact) {
    const sf = await prisma.system_flow.findFirst({
        where: { code: "RESET", is_active: true },
        select: { systemflowid: true },
    });
    if (!sf) throw new Error("Missing system_flow RESET");

    const sk = await prisma.system_keyword.findFirst({
        where: { systemflowid: sf.systemflowid, is_active: true },
        select: { keyword: true },
    });
    if (!sk?.keyword) throw new Error("Missing system_keyword for RESET");

    const entryContent = await loadSystemFlowEntryContent("RESET", contact);

    const bodyText = entryContent.replyText || "Reset";
    const btnId = sk.keyword; // e.g. "/reset"

    return {
        replyText: bodyText,
        replyMessageObj: {
            type: "interactive",
            interactive: {
                type: "button",
                body: { text: bodyText },
                action: {
                    buttons: [
                        {
                            type: "reply",
                            reply: { id: btnId, title: "Reset" },
                        },
                    ],
                },
            },
        },
    };
}

/**
 * Global fallback bundle:
 * system_flow codes only.
 */
export async function buildGlobalFallbackBundle(contact) {
    const main = await loadSystemFlowEntryContent("GLOBAL_FALLBACK", contact);
    const joinHint = await loadSystemFlowEntryContent("JOIN_CAMPAIGN_HINT", contact);

    const menuMessage = await buildWhatsappMenuList();
    const menuReply = { replyText: null, replyMessageObj: menuMessage };

    const resetButton = await buildResetButton(contact);

    return {
        main,
        extras: [joinHint, menuReply, resetButton],
    };
}

export async function loadGlobalFallbackMessage(contact) {
    return loadSystemFlowEntryContent("GLOBAL_FALLBACK", contact);
}

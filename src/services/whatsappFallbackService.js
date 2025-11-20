// src/services/whatsappFallbackService.js

// Service to build global fallback WhatsApp messages
// Global fallback + join-campaign instruction.
import { buildWhatsappMenuList } from "./whatsappMenuService.js";
import {
    loadContentByKey,
} from "./whatsappContentService.js";

/**
 * JOIN_CAMPAIGN_INSTRUCTION from content table
 */
export async function buildKeywordHintText(contact = null) {
    const content = await loadContentByKey("JOIN_CAMPAIGN_INSTRUCTION", contact);

    if (!content) {
        throw new Error("Missing JOIN_CAMPAIGN_INSTRUCTION content in DB");
    }

    // shape: { replyText, replyMessageObj, contentkeyid }
    return content;
}

/**
 * Load GLOBAL_FALLBACK from DB (must exist)
 */
export async function loadGlobalFallbackMessage(contact) {
    const res = await loadContentByKey("GLOBAL_FALLBACK", contact); // throws if missing
    return res; // { replyText, replyMessageObj, contentkeyid }
}

/**
 * Global fallback bundle:
 *  - GLOBAL_FALLBACK
 *  - JOIN_CAMPAIGN_INSTRUCTION
 *  - Campaign menu list
 *  - Start over button
 */
export async function buildGlobalFallbackBundle(contact) {
    // Main GLOBAL_FALLBACK
    const main = await loadGlobalFallbackMessage(contact);

    // Join campaign instruction
    const joinInstruction = await buildKeywordHintText(contact);

    // Campaign menu
    const menuMessage = await buildWhatsappMenuList();
    const menuReply = {
        replyText: null,
        replyMessageObj: menuMessage,
        contentkeyid: null,
    };

    // Start over button
    const startOverText = "Or you can start a new conversation.";
    const startOverMessageObj = {
        type: "interactive",
        interactive: {
            type: "button",
            body: { text: startOverText },
            action: {
                buttons: [
                    {
                        type: "reply",
                        reply: {
                            id: "GLOBAL_START_OVER",
                            title: "Start Over",
                        },
                    },
                ],
            },
        },
    };

    const startOver = {
        replyText: startOverText,
        replyMessageObj: startOverMessageObj,
        contentkeyid: null,
    };

    return {
        main,
        extras: [joinInstruction, menuReply, startOver],
    };
}

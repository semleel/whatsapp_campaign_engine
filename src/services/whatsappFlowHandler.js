// src/services/whatsappFlowHandler.js

// Service to handle WhatsApp message flow + keyword commands
// All the text + button handling, built on top of flowEngine.
import prisma from "../config/prismaClient.js";
import { error } from "../utils/logger.js";
import { processIncomingMessage } from "./flowEngine.js";
import { buildWhatsappMenuList } from "./whatsappMenuService.js";
import {
    buildContentSequence,
    loadContentByKey,
    buildWhatsappMessageFromContent,
} from "./whatsappContentService.js";
import {
    buildGlobalFallbackBundle,
    loadGlobalFallbackMessage,
    buildKeywordHintText, // optional but available
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
 * Handle text commands + keyword flow
 */
export async function handleFlowOrKeyword({ from, text, contact }) {
    const normalizedOriginal = (text || "").trim();
    const normalizedLower = normalizedOriginal.toLowerCase();

    // --- Last outbound content key (to know if we are waiting for a button) ---
    let lastOutboundKey = null;
    if (contact?.contactid) {
        const lastOutbound = await prisma.message.findFirst({
            where: { contactid: contact.contactid, direction: "outbound" },
            orderBy: { timestamp: "desc" },
            select: { contentkeyid: true },
        });
        lastOutboundKey = lastOutbound?.contentkeyid || null;
    }

    const BUTTON_ONLY_KEYS = new Set([
        "ONBOARD_LANGUAGE",
        "ONBOARD_TOS_CONFIRM",
        "ONBOARD_MAIN_MENU",
    ]);

    // If we are expecting a button tap, do NOT accept random text
    if (
        BUTTON_ONLY_KEYS.has(lastOutboundKey) &&
        normalizedLower &&
        normalizedLower !== "/start-over"
    ) {
        const selectContent = await loadContentByKey(
            "ONBOARD_SELECT_OPTION",
            contact
        ); // throws if missing
        return makeResult({
            replyText: selectContent.replyText,
            replyMessageObj: selectContent.replyMessageObj,
            contentkeyid: selectContent.contentkeyid,
        });
    }

    // --- Admin reset: cancel sessions + reset TOS/lang, then show reminder only ---
    if (normalizedLower === "/start-over") {
        if (contact?.contactid) {
            await prisma.campaignsession.updateMany({
                where: { contactid: contact.contactid },
                data: { sessionstatus: "CANCELLED", checkpoint: null },
            });
            await prisma.contact.update({
                where: { contactid: contact.contactid },
                data: { tos_accepted: false, lang: null },
            });
            contact.tos_accepted = false;
            contact.lang = null;
        }

        const reminderText =
            "Session has been reset.\n\nPlease type any word to start.";
        return makeResult({
            replyText: reminderText,
            replyMessageObj: { type: "text", text: { body: reminderText } },
        });
    }

    // --- If TOS not accepted yet: ANY word starts onboarding (first-time or after reset) ---
    if (!contact?.tos_accepted) {
        const seq = await buildContentSequence(
            ["ONBOARD_WELCOME", "ONBOARD_LANGUAGE"],
            contact
        );
        if (seq.length) {
            const [first, ...rest] = seq;
            return makeResult({
                replyText: first.replyText,
                replyMessageObj: first.replyMessageObj,
                contentkeyid: first.contentkeyid,
                extraReplies: rest,
            });
        }
        throw new Error("Missing ONBOARD_WELCOME / ONBOARD_LANGUAGE content in DB");
    }

    // From here, TOS already accepted

    // "start" → go straight to main menu
    if (normalizedLower === "start") {
        const mainMenu = await loadContentByKey("ONBOARD_MAIN_MENU", contact);
        if (!mainMenu) {
            throw new Error("Missing ONBOARD_MAIN_MENU content in DB");
        }
        return makeResult({
            replyText: mainMenu.replyText,
            replyMessageObj: mainMenu.replyMessageObj,
            contentkeyid: mainMenu.contentkeyid,
        });
    }

    // MENU → list of active campaigns
    if (normalizedLower === "menu") {
        const menuMessage = await buildWhatsappMenuList();
        return makeResult({
            replyText: null,
            replyMessageObj: menuMessage,
        });
    }

    // JOIN → simple confirmation (placeholder for later flow)
    if (normalizedLower === "join") {
        const replyText =
            "You have successfully joined the campaign. Please wait for further updates.";
        return makeResult({
            replyText,
            replyMessageObj: { type: "text", text: { body: replyText } },
        });
    }

    // Keyword-driven campaign flow
    try {
        const flow = await processIncomingMessage({ from, text: normalizedOriginal });

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
                replyText = gf.replyText;
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
            const contentkeyid = flow.nextKey || null;

            if (flow.nextKey) {
                const km = await prisma.keymapping.findUnique({
                    where: { contentkeyid: flow.nextKey },
                    include: { content: true },
                });

                const content = km?.content || null;
                if (content) {
                    const ctx = {
                        contact_name: contact?.name || contact?.phonenum || "there",
                        phone: contact?.phonenum || "",
                    };
                    const built = buildWhatsappMessageFromContent(content, ctx);
                    return makeResult({
                        replyText: built.replyText,
                        replyMessageObj: built.message,
                        sessionid,
                        campaignid,
                        contentkeyid,
                    });
                }

                // Flow says "moved" but there is no content for this key → config error
                throw new Error(
                    `Missing content for flow.nextKey=${flow.nextKey} (campaignid=${campaignid || "null"
                    })`
                );
            }

            // flow.action === "moved" but no nextKey → should not happen in correct config
            if (campaignid) {
                throw new Error(
                    `Flow returned action="moved" with no nextKey for campaignid=${campaignid}`
                );
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
 * Handle onboarding + menu button replies
 */
export async function handleButtonReply({ id, contact }) {
    // Normalize ID just in case
    const btnId = (id || "").trim();

    // LANG_EN / LANG_MS → store language
    if (btnId === "LANG_EN" || btnId === "LANG_MS") {
        const langCode = btnId === "LANG_EN" ? "en" : "ms";

        if (contact?.contactid) {
            await prisma.contact.update({
                where: { contactid: contact.contactid },
                data: { lang: langCode },
            });
            contact.lang = langCode;
        }

        // If TOS *not* accepted yet → show TOS + confirm
        if (!contact?.tos_accepted) {
            const seq = await buildContentSequence(
                ["ONBOARD_TOS", "ONBOARD_TOS_CONFIRM"],
                contact
            );
            if (seq.length) {
                const [first, ...rest] = seq;
                return makeResult({
                    replyText: first.replyText,
                    replyMessageObj: first.replyMessageObj,
                    contentkeyid: first.contentkeyid,
                    extraReplies: rest,
                });
            }

            throw new Error("Missing ONBOARD_TOS / ONBOARD_TOS_CONFIRM content in DB");
        }

        // TOS already accepted → go straight back to main menu (no more TOS)
        const mainMenu = await loadContentByKey("ONBOARD_MAIN_MENU", contact);
        if (!mainMenu) {
            throw new Error("Missing ONBOARD_MAIN_MENU content in DB");
        }

        return makeResult({
            replyText: mainMenu.replyText,
            replyMessageObj: mainMenu.replyMessageObj,
            contentkeyid: mainMenu.contentkeyid,
        });
    }

    // TOS_YES → Thank you + Main Menu
    if (btnId === "TOS_YES") {
        if (contact?.contactid) {
            await prisma.contact.update({
                where: { contactid: contact.contactid },
                data: { tos_accepted: true },
            });
            contact.tos_accepted = true;
        }

        const seq = await buildContentSequence(
            ["ONBOARD_THANK_YOU", "ONBOARD_MAIN_MENU"],
            contact
        );
        if (seq.length) {
            const [first, ...rest] = seq;
            return makeResult({
                replyText: first.replyText,
                replyMessageObj: first.replyMessageObj,
                contentkeyid: first.contentkeyid,
                extraReplies: rest,
            });
        }

        throw new Error("Missing ONBOARD_THANK_YOU / ONBOARD_MAIN_MENU content in DB");
    }

    // TOS_NO → Abort message (ONBOARD_ABORT)
    if (btnId === "TOS_NO") {
        const abortContent = await loadContentByKey("ONBOARD_ABORT", contact);
        if (abortContent) {
            return makeResult({
                replyText: abortContent.replyText,
                replyMessageObj: abortContent.replyMessageObj,
                contentkeyid: abortContent.contentkeyid,
            });
        }

        throw new Error("Missing ONBOARD_ABORT content in DB");
    }

    // JOIN_CAMPAIGN (from ONBOARD_MAIN_MENU)
    // → show JOIN_CAMPAIGN_INSTRUCTION text + campaign LIST
    if (btnId === "JOIN_CAMPAIGN") {
        const intro = await buildKeywordHintText(contact); // content row
        const menuMessage = await buildWhatsappMenuList();

        return makeResult({
            replyText: intro.replyText,
            replyMessageObj: intro.replyMessageObj,
            contentkeyid: intro.contentkeyid,
            extraReplies: [
                {
                    replyText: null,
                    replyMessageObj: menuMessage,
                    contentkeyid: null,
                },
            ],
        });
    }

    // CHANGE_LANG → show language selection again (buttons)
    if (btnId === "CHANGE_LANG") {
        const langContent = await loadContentByKey("ONBOARD_LANGUAGE", contact);
        if (langContent) {
            return makeResult({
                replyText: langContent.replyText,
                replyMessageObj: langContent.replyMessageObj,
                contentkeyid: langContent.contentkeyid,
            });
        }
        throw new Error("Missing ONBOARD_LANGUAGE content in DB");
    }

    // GLOBAL_START_OVER → behave like "start" command (no TOS reset)
    if (btnId === "GLOBAL_START_OVER") {
        if (contact?.tos_accepted) {
            const mainMenu = await loadContentByKey("ONBOARD_MAIN_MENU", contact);
            if (!mainMenu) {
                throw new Error("Missing ONBOARD_MAIN_MENU content in DB");
            }
            return makeResult({
                replyText: mainMenu.replyText,
                replyMessageObj: mainMenu.replyMessageObj,
                contentkeyid: mainMenu.contentkeyid,
            });
        } else {
            const seq = await buildContentSequence(
                ["ONBOARD_WELCOME", "ONBOARD_LANGUAGE"],
                contact
            );
            if (seq.length) {
                const [first, ...rest] = seq;
                return makeResult({
                    replyText: first.replyText,
                    replyMessageObj: first.replyMessageObj,
                    contentkeyid: first.contentkeyid,
                    extraReplies: rest,
                });
            }
            throw new Error(
                "Missing ONBOARD_WELCOME / ONBOARD_LANGUAGE content in DB"
            );
        }
    }

    // From campaign detail card: JOIN button (for later real flow)
    if (btnId.startsWith("CAMPAIGN_JOIN_")) {
        const campaignIdStr = btnId.replace("CAMPAIGN_JOIN_", "");
        const campaignId = parseInt(campaignIdStr, 10);

        const replyText =
            "You have successfully joined this campaign. You will receive updates soon.";
        return makeResult({
            replyText,
            replyMessageObj: { type: "text", text: { body: replyText } },
            campaignid: Number.isNaN(campaignId) ? null : campaignId,
        });
    }

    // From campaign detail card: MENU button (list campaigns)
    if (btnId === "BACK_TO_MENU") {
        const menuMessage = await buildWhatsappMenuList();
        return makeResult({
            replyText: null,
            replyMessageObj: menuMessage,
        });
    }

    // Unknown button → GLOBAL fallback bundle
    const { main, extras } = await buildGlobalFallbackBundle(contact);
    return makeResult({
        replyText: main.replyText,
        replyMessageObj: main.replyMessageObj,
        contentkeyid: main.contentkeyid || null,
        extraReplies: extras,
    });
}

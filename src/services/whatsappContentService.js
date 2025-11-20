// src/services/whatsappContentService.js

// Service to build WhatsApp message objects from content stored in DB
// All the content rendering / templating helpers.
import prisma from "../config/prismaClient.js";

/**
 * Very small template renderer:
 *   - {{contact_name}}
 *   - {{phone}}
 */
export function renderTextTemplate(text, ctx = {}) {
    if (!text) return "";
    let out = text;

    if (ctx.contact_name != null) {
        out = out.replace(/{{\s*contact_name\s*}}/gi, ctx.contact_name);
    }
    if (ctx.phone != null) {
        out = out.replace(/{{\s*phone\s*}}/gi, ctx.phone);
    }

    return out.trim();
}

/**
 * Build a WhatsApp message object from a `content` row.
 * Supports text / image / video / document / interactive buttons / list.
 */
export function buildWhatsappMessageFromContent(content, templateCtx = {}) {
    const render = (s) => renderTextTemplate(s, templateCtx);

    const type = (content.type || "text").toLowerCase();
    const baseText =
        render(content.body) ||
        render(content.description) ||
        render(content.title) ||
        "Thank you, we have moved you to the next step of the campaign.";

    const asText = {
        replyText: baseText,
        message: { type: "text", text: { body: baseText } },
    };

    if (!type || type === "text") return asText;

    if (type === "image") {
        if (!content.mediaurl) return asText;
        return {
            replyText: baseText,
            message: {
                type: "image",
                image: { link: content.mediaurl, caption: baseText },
            },
        };
    }

    if (type === "video") {
        if (!content.mediaurl) return asText;
        return {
            replyText: baseText,
            message: {
                type: "video",
                video: { link: content.mediaurl, caption: baseText },
            },
        };
    }

    if (type === "document" || type === "file") {
        if (!content.mediaurl) return asText;
        return {
            replyText: baseText,
            message: {
                type: "document",
                document: { link: content.mediaurl, caption: baseText },
            },
        };
    }

    if (type === "interactive_buttons") {
        let buttons = [];
        try {
            const ph = content.placeholders;
            if (ph && typeof ph === "object" && Array.isArray(ph.buttons)) {
                buttons = ph.buttons;
            }
        } catch {
            // ignore
        }
        if (!buttons.length) return asText;

        return {
            replyText: baseText,
            message: {
                type: "interactive",
                interactive: {
                    type: "button",
                    body: { text: baseText },
                    action: {
                        buttons: buttons.slice(0, 3).map((b, idx) => ({
                            type: "reply",
                            reply: {
                                id: b.id || `btn_${idx + 1}`,
                                title: b.title || `Option ${idx + 1}`,
                            },
                        })),
                    },
                },
            },
        };
    }

    if (type === "interactive_list") {
        let sections = [];
        try {
            const ph = content.placeholders;
            if (ph && typeof ph === "object" && Array.isArray(ph.sections)) {
                sections = ph.sections;
            }
        } catch {
            // ignore
        }
        if (!sections.length) return asText;

        return {
            replyText: baseText,
            message: {
                type: "interactive",
                interactive: {
                    type: "list",
                    body: { text: baseText },
                    footer: { text: render(content.description || "") },
                    action: {
                        button: "Select",
                        sections,
                    },
                },
            },
        };
    }

    return asText;
}

/**
 * Load a content by contentkeyid and build WA message
 */
export async function loadContentByKey(contentKey, contact) {
    const km = await prisma.keymapping.findUnique({
        where: { contentkeyid: contentKey },
        include: { content: true },
    });

    if (!km?.content) {
        // Force misconfig to surface for special keys
        if (
            contentKey.startsWith("ONBOARD_") ||
            contentKey === "ONBOARD_SELECT_OPTION" ||
            contentKey === "JOIN_CAMPAIGN_INSTRUCTION" ||
            contentKey === "GLOBAL_FALLBACK"
        ) {
            throw new Error(`Missing ${contentKey} content in DB`);
        }
        return null;
    }

    const ctx = {
        contact_name: contact?.name || contact?.phonenum || "there",
        phone: contact?.phonenum || "",
    };

    const built = buildWhatsappMessageFromContent(km.content, ctx);
    return {
        replyText: built.replyText,
        replyMessageObj: built.message,
        contentkeyid: contentKey,
    };
}

/**
 * Helper: build a sequence of content messages by keys
 */
export async function buildContentSequence(contentKeys, contact) {
    const results = [];
    for (const key of contentKeys) {
        const res = await loadContentByKey(key, contact);
        if (res) results.push(res);
    }
    return results;
}

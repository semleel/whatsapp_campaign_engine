// src/services/whatsappContentService.js
import { prisma } from "../config/prismaClient.js";

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

  const placeholders =
    content.placeholders && typeof content.placeholders === "object"
      ? content.placeholders
      : {};

  const baseText =
    render(content.body) ||
    render(content.description) ||
    render(content.title) ||
    "..."

  // ---- helpers ----
  const asText = {
    replyText: baseText,
    message: { type: "text", text: { body: baseText } },
  };

  const attachmentType = (placeholders.attachmentType || "none").toLowerCase();
  const attachmentUrl =
    attachmentType !== "none" ? placeholders.attachmentUrl || content.mediaurl : null;

  const interactiveType = (placeholders.interactiveType || "none").toLowerCase();
  const buttons = Array.isArray(placeholders.buttons) ? placeholders.buttons : [];
  const listOptions = Array.isArray(placeholders.listOptions)
    ? placeholders.listOptions
    : [];

  // =========================================================
  // A) INTERACTIVE (buttons/list) optionally with media header
  // =========================================================
  if (interactiveType === "buttons" && buttons.length) {
    const sliced = buttons.slice(0, 3);

    const interactiveObj = {
      type: "button",
      body: { text: baseText },
      action: {
        buttons: sliced.map((title, idx) => ({
          type: "reply",
          reply: {
            id: String(title).slice(0, 200),      // safe id
            title: String(title).slice(0, 20),    // WA limit
          },
        })),
      },
    };

    // media header from placeholders (Callbell-like)
    if (attachmentUrl && ["image", "video", "document"].includes(attachmentType)) {
      if (attachmentType === "image") {
        interactiveObj.header = {
          type: "image",
          image: { link: attachmentUrl },
        };
      }
      if (attachmentType === "video") {
        interactiveObj.header = {
          type: "video",
          video: { link: attachmentUrl },
        };
      }
      if (attachmentType === "document") {
        interactiveObj.header = {
          type: "document",
          document: { link: attachmentUrl },
        };
      }
    }

    return {
      replyText: baseText,
      message: { type: "interactive", interactive: interactiveObj },
    };
  }

  if (interactiveType === "list" && listOptions.length) {
    const rows = listOptions.slice(0, 10).map((opt, idx) => ({
      id: String(opt).slice(0, 200),
      title: String(opt).slice(0, 24),
    }));

    const sectionTitle =
      placeholders.listSectionTitle ||
      content.description ||
      content.title ||
      "Options";

    const buttonText =
      placeholders.listButtonText ||
      content.title ||
      "Select";

    const interactiveObj = {
      type: "list",
      body: { text: baseText },
      footer: content.description ? { text: render(content.description) } : undefined,
      action: {
        button: String(buttonText).slice(0, 20),
        sections: [
          {
            title: String(sectionTitle).slice(0, 24),
            rows,
          },
        ],
      },
    };

    // media header if supported
    if (attachmentUrl && ["image", "video", "document"].includes(attachmentType)) {
      if (attachmentType === "image") {
        interactiveObj.header = {
          type: "image",
          image: { link: attachmentUrl },
        };
      }
      if (attachmentType === "video") {
        interactiveObj.header = {
          type: "video",
          video: { link: attachmentUrl },
        };
      }
      if (attachmentType === "document") {
        interactiveObj.header = {
          type: "document",
          document: { link: attachmentUrl },
        };
      }
    }

    return {
      replyText: baseText,
      message: { type: "interactive", interactive: interactiveObj },
    };
  }

  // =========================================================
  // B) MEDIA-ONLY from placeholders
  // =========================================================
  if (attachmentUrl && attachmentType !== "none") {
    if (attachmentType === "image") {
      return {
        replyText: baseText,
        message: {
          type: "image",
          image: { link: attachmentUrl, caption: baseText },
        },
      };
    }

    if (attachmentType === "video") {
      return {
        replyText: baseText,
        message: {
          type: "video",
          video: { link: attachmentUrl, caption: baseText },
        },
      };
    }

    if (attachmentType === "document") {
      return {
        replyText: baseText,
        message: {
          type: "document",
          document: { link: attachmentUrl, caption: baseText },
        },
      };
    }

    if (attachmentType === "audio") {
      return {
        replyText: baseText,
        message: {
          type: "audio",
          audio: { link: attachmentUrl },
        },
      };
    }
  }

  // =========================================================
  // C) LEGACY fallback (your old content.type based logic)
  // =========================================================
  const legacyType = (content.type || "text").toLowerCase();

  if (!legacyType || legacyType === "text") return asText;

  if (legacyType === "image" && content.mediaurl) {
    return {
      replyText: baseText,
      message: {
        type: "image",
        image: { link: content.mediaurl, caption: baseText },
      },
    };
  }

  if (legacyType === "video" && content.mediaurl) {
    return {
      replyText: baseText,
      message: {
        type: "video",
        video: { link: content.mediaurl, caption: baseText },
      },
    };
  }

  if ((legacyType === "document" || legacyType === "file") && content.mediaurl) {
    return {
      replyText: baseText,
      message: {
        type: "document",
        document: { link: content.mediaurl, caption: baseText },
      },
    };
  }

  return asText;
}

/**
 * Load a content by contentkeyid and build WA message.
 * No hardcode special keys anymore.
 */
export async function loadContentByKey(contentKey, contact, userflowid = null) {
  if (!contentKey) return null;

  const km = await prisma.keymapping.findFirst({
    where: {
      contentkeyid: contentKey,
      ...(userflowid ? { userflowid: Number(userflowid) } : {}),
    },
    include: { content: true },
  });

  if (!km?.content || km.content.isdeleted) return null;

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
export async function buildContentSequence(contentKeys, contact, userflowid = null) {
  const results = [];
  for (const key of contentKeys) {
    const res = await loadContentByKey(key, contact, userflowid);
    if (res) results.push(res);
  }
  return results;
}

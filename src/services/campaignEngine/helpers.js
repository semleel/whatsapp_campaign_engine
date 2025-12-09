export function inferMediaType(url, fallback = "image") {
  if (!url) return fallback;
  const lower = url.toLowerCase();
  if (/\.(mp4|mov|avi|mkv|webm)$/.test(lower)) return "video";
  if (/\.(mp3|wav|m4a|aac|ogg)$/.test(lower)) return "audio";
  if (/\.(pdf|docx?|xls|xlsx|ppt|pptx)$/.test(lower)) return "document";
  if (/\.(jpe?g|png|gif|webp|bmp|tiff?)$/.test(lower)) return "image";
  return fallback;
}

export function buildMediaWaPayload(step) {
  if (!step || !step.media_url) return null;
  const resolvedType = inferMediaType(step.media_url);
  const caption = step.prompt_text || undefined;

  if (resolvedType === "image") {
    return {
      type: "image",
      image: {
        link: step.media_url,
        ...(caption ? { caption } : {}),
      },
    };
  }
  if (resolvedType === "video") {
    return {
      type: "video",
      video: {
        link: step.media_url,
        ...(caption ? { caption } : {}),
      },
    };
  }
  if (resolvedType === "audio") {
    return {
      type: "audio",
      audio: {
        link: step.media_url,
      },
    };
  }
  if (resolvedType === "document") {
    return {
      type: "document",
      document: {
        link: step.media_url,
        ...(caption ? { caption } : {}),
      },
    };
  }
  return null;
}

export function deriveContentType(waPayload, step) {
  if (waPayload?.type) return waPayload.type;
  if (step?.media_url) {
    return inferMediaType(step.media_url);
  }
  return "text";
}

export function withStepContext({ base = {}, step, session, contact, contentContext = null }) {
  const waPayload = base.waPayload ?? (step?.media_url ? buildMediaWaPayload(step) : null);
  const contentValue = base.content ?? step?.prompt_text ?? "";

  return {
    ...base,
    to: base.to ?? contact?.phone_num,
    content: contentValue,
    waPayload: waPayload || undefined,
    contentType: base.contentType ?? deriveContentType(waPayload, step),
    stepContext: {
      campaign_id: session?.campaign_id ?? null,
      campaign_session_id: session?.campaign_session_id ?? null,
      contact_id: contact?.contact_id ?? null,
      step_id: step?.step_id ?? null,
      template_source_id: step?.template_source_id ?? null,
      content_id: contentContext?.contentId ?? null,
      content_lang: contentContext?.lang ?? null,
    },
  };
}

export function buildChoiceMessage(contact, prompt, choices) {
  const safePrompt = prompt || "Please choose an option:";
  const optionsText = choices
    .map((c, idx) => `${idx + 1}. ${c.label || c.choice_code || "Option"}`)
    .join("\n");
  const fallbackText = `${safePrompt}\n\n${optionsText}`;

  if (!choices || !choices.length) {
    return {
      to: contact.phone_num,
      content: fallbackText,
    };
  }

  let waPayload = null;

  if (choices.length <= 3) {
    const buttons = choices.slice(0, 3).map((c, idx) => ({
      type: "reply",
      reply: {
        id: c.choice_code || String(c.choice_id || idx + 1),
        title: c.label || c.choice_code || `Option ${idx + 1}`,
      },
    }));

    waPayload = {
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: safePrompt },
        action: { buttons },
      },
    };
  } else {
    const rows = choices.map((c, idx) => ({
      id: c.choice_code || String(c.choice_id || idx + 1),
      title: c.label || c.choice_code || `Option ${idx + 1}`,
    }));

    waPayload = {
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: safePrompt },
        action: {
          button: "View options",
          sections: [
            {
              title: "Options",
              rows,
            },
          ],
        },
      },
    };
  }

  return {
    to: contact.phone_num,
    content: fallbackText,
    waPayload,
  };
}

export function extractChoiceCodeFromPayload(payload) {
  try {
    const entry = payload?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const msg = value?.messages?.[0];
    if (!msg || msg.type !== "interactive") return null;
    const interactive = msg.interactive;
    if (interactive?.type === "button_reply") {
      return interactive.button_reply?.id || null;
    }
    if (interactive?.type === "list_reply") {
      return interactive.list_reply?.id || null;
    }
    return null;
  } catch (e) {
    console.error("[ENGINE] extractChoiceCodeFromPayload error", e);
    return null;
  }
}

export function extractLocationFromPayload(payload) {
  try {
    const entry = payload?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const msg = value?.messages?.[0];
    if (!msg || msg.type !== "location" || !msg.location) return null;
    const { latitude, longitude } = msg.location;
    if (typeof latitude !== "number" || typeof longitude !== "number") return null;
    return { latitude, longitude };
  } catch (e) {
    console.error("[ENGINE] extractLocationFromPayload error", e);
    return null;
  }
}

// src/services/contentLocalizationService.js
import { prisma } from "../config/prismaClient.js";

const SAFE_FALLBACK = {
  contentId: null,
  lang: "EN",
  title: "Fallback",
  body: "Sorry, this content is not available at the moment.",
  mediaUrl: null,
  placeholders: null,
};

/**
 * Resolve the localized content for the current campaign session step.
 * The base content is taken from campaign_step.template_source_id.
 * If a translation with the same content_key exists for contact.lang, it is used;
 * otherwise the base content row is returned.
 */
export async function getStepContentForSession(campaignSessionId) {
  const parsedId = Number(campaignSessionId);
  if (!parsedId || Number.isNaN(parsedId)) return SAFE_FALLBACK;

  try {
    const rows = await prisma.$queryRaw`
      WITH base AS (
        SELECT
          cs.campaign_session_id,
          cs.current_step_id,
          c.contact_id,
          UPPER(COALESCE(NULLIF(TRIM(c.lang), ''), 'EN')) AS contact_lang,
          s.step_id,
        base_content.content_id   AS base_content_id,
        base_content.content_key,
        UPPER(base_content.lang)  AS base_lang,
        base_content.title        AS base_title,
        base_content.body         AS base_body,
        base_content.media_url    AS base_media_url,
        base_content.placeholders AS base_placeholders
        FROM public.campaign_session cs
        JOIN public.contact c
          ON cs.contact_id = c.contact_id
        JOIN public.campaign_step s
          ON cs.current_step_id = s.step_id
        JOIN public.content base_content
          ON s.template_source_id = base_content.content_id
         AND base_content.is_deleted = false
        WHERE cs.campaign_session_id = ${parsedId}
      ),
      lang_match AS (
        SELECT
          b.*,
        lc.content_id       AS lang_content_id,
        lc.lang             AS lang_lang,
        lc.title            AS lang_title,
        lc.body             AS lang_body,
        lc.media_url        AS lang_media_url,
        lc.placeholders     AS lang_placeholders
        FROM base b
        LEFT JOIN public.content lc
    ON lc.content_key = b.content_key
   AND UPPER(lc.lang) = b.contact_lang
   AND lc.is_deleted = false
      )
      SELECT
        COALESCE(lang_content_id, base_content_id)   AS content_id,
        COALESCE(lang_lang,        base_lang)        AS lang,
        COALESCE(lang_title,       base_title)       AS title,
        COALESCE(lang_body,        base_body)        AS body,
        COALESCE(lang_media_url,   base_media_url)   AS media_url,
        COALESCE(lang_placeholders, base_placeholders) AS placeholders
      FROM lang_match
      LIMIT 1;
    `;

    const row = rows?.[0];
    if (!row) return SAFE_FALLBACK;

    const lang = (row.lang || "EN").toString().toUpperCase();
    return {
      contentId: row.content_id ?? null,
      lang,
      title: row.title ?? null,
      body: row.body ?? SAFE_FALLBACK.body,
      mediaUrl: row.media_url ?? null,
      placeholders: row.placeholders ?? null,
    };
  } catch (err) {
    console.error("[content] getStepContentForSession error", err);
    return SAFE_FALLBACK;
  }
}

export default {
  getStepContentForSession,
};

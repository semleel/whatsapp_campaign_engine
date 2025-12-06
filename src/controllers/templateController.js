// src/controllers/templateController.js
// CRUD + archive handlers for WhatsApp templates using the existing Postgres
// `content` table. The UI fields map 1:1 to DB columns (title, type, status/category,
// lang, body, media_url, placeholders jsonb, expires_at, is_deleted) so templates
// are persisted once and reused by campaign steps via template_source_id.
import { prisma } from "../config/prismaClient.js";

// Some environments may still be using an older Prisma client bundle that lacks the
// `content` delegate. To keep the API working, we fall back to raw queries when the
// delegate is missing (e.g., when prisma.content is undefined).
const getContentDelegate = () => prisma?.content;

const fallbackList = async ({ where }) => {
  const conditions = [];
  const params = [];

  if (where?.is_deleted === false) {
    conditions.push(`is_deleted = false`);
  }
  if (where?.status) {
    params.push(where.status);
    conditions.push(`status = $${params.length}`);
  }
  if (where?.type) {
    params.push(where.type);
    conditions.push(`type = $${params.length}`);
  }
  if (where?.title && where.title.contains) {
    params.push(where.title.contains);
    conditions.push(`title ILIKE '%' || $${params.length} || '%'`);
  }

  const whereSql = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const query = `
    SELECT content_id, title, type, status, lang, body, media_url, placeholders,
           created_at, updated_at, expires_at, is_deleted
    FROM content
    ${whereSql}
    ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
  `;

  // eslint-disable-next-line no-restricted-syntax
  return prisma.$queryRawUnsafe(query, ...params);
};

const fallbackGetById = async (id) => {
  // eslint-disable-next-line no-restricted-syntax
  const rows = await prisma.$queryRawUnsafe(
    `SELECT content_id, title, type, status, lang, body, media_url, placeholders,
            created_at, updated_at, expires_at, is_deleted
     FROM content WHERE content_id = $1 LIMIT 1`,
    id,
  );
  return rows?.[0] || null;
};

const normalizeForSql = (val) => {
  if (val === undefined) return null;
  if (val instanceof Date) return val;
  if (typeof val === "object" && val !== null) return JSON.stringify(val);
  return val;
};

const fallbackCreate = async (data) => {
  const cols = [];
  const placeholders = [];
  const values = [];
  Object.entries(data).forEach(([key, val], idx) => {
    cols.push(key);
    placeholders.push(`$${idx + 1}`);
    values.push(normalizeForSql(val));
  });
  // eslint-disable-next-line no-restricted-syntax
  const rows = await prisma.$queryRawUnsafe(
    `INSERT INTO content (${cols.join(",")})
     VALUES (${placeholders.join(",")})
     RETURNING content_id, title, type, status, lang, body, media_url, placeholders,
               created_at, updated_at, expires_at, is_deleted`,
    ...values,
  );
  return rows?.[0] || null;
};

const fallbackUpdate = async (id, data) => {
  const sets = [];
  const values = [];
  Object.entries(data).forEach(([key, val], idx) => {
    sets.push(`${key} = $${idx + 1}`);
    values.push(normalizeForSql(val));
  });
  values.push(id);

  // eslint-disable-next-line no-restricted-syntax
  const rows = await prisma.$queryRawUnsafe(
    `UPDATE content
     SET ${sets.join(", ")}
     WHERE content_id = $${values.length}
     RETURNING content_id, title, type, status, lang, body, media_url, placeholders,
               created_at, updated_at, expires_at, is_deleted`,
    ...values,
  );
  return rows?.[0] || null;
};

const ensureJsonOrNull = (value) => {
  if (value == null || value === "") return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const sanitizeString = (value) => {
  if (value == null) return "";
  return String(value).trim();
};

const parseBoolean = (value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    return ["true", "1", "yes", "on"].includes(value.toLowerCase());
  }
  return false;
};

const parseDateOrNull = (value) => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

// Normalize DB record shape for the frontend
export const mapContentToResponse = (content) => {
  if (!content) return null;

  const parsedPlaceholders =
    typeof content.placeholders === "string"
      ? (() => {
          try {
            return JSON.parse(content.placeholders);
          } catch {
            return content.placeholders;
          }
        })()
      : content.placeholders ?? null;

  return {
    content_id: content.content_id,
    contentid: content.content_id,
    title: content.title,
    type: content.type,
    status: content.status,
    category: content.status,
    lang: content.lang,
    defaultlang: content.lang,
    body: content.body,
    media_url: content.media_url,
    mediaurl: content.media_url,
    placeholders: parsedPlaceholders,
    created_at: content.created_at,
    createdat: content.created_at,
    updated_at: content.updated_at,
    updatedat: content.updated_at,
    expires_at: content.expires_at,
    expiresat: content.expires_at,
    is_deleted: content.is_deleted,
    isdeleted: content.is_deleted,
    currentversion: null,
    lastupdated: content.updated_at || content.created_at,
  };
};

const normalizeTemplatePayload = (body = {}) => {
  const title = sanitizeString(body.title);
  const type = sanitizeString(body.type);
  const lang = sanitizeString(body.lang || body.defaultLang);
  const status = sanitizeString(body.status || body.category);
  const mediaUrl = sanitizeString(body.media_url ?? body.mediaUrl);
  const textBody = typeof body.body === "string" ? body.body : "";
  const expiresRaw = body.expires_at ?? body.expiresAt ?? body.expiresat;

  return {
    title,
    type,
    status,
    lang,
    body: textBody,
    media_url: mediaUrl || null,
    placeholders:
      body.placeholders !== undefined ? ensureJsonOrNull(body.placeholders) : undefined,
    expires_at: parseDateOrNull(expiresRaw),
    is_deleted: body.is_deleted ?? body.isdeleted ?? undefined,
  };
};

const buildTemplateFilters = (query = {}) => {
  const includeDeleted =
    parseBoolean(query.includeDeleted) || parseBoolean(query.include_deleted);
  const statusFilter = sanitizeString(query.status);
  const typeFilter = sanitizeString(query.type);
  const search = sanitizeString(query.search || query.q);

  const where = includeDeleted ? {} : { is_deleted: false };
  if (statusFilter && statusFilter.toLowerCase() !== "all") {
    where.status = statusFilter;
  }
  if (typeFilter && typeFilter.toLowerCase() !== "all") {
    where.type = typeFilter;
  }
  if (search) {
    where.title = { contains: search, mode: "insensitive" };
  }
  return { where, includeDeleted };
};

const REQUIRED_FIELDS = ["title", "type", "status", "lang", "body"];

// -----------------------------
// BASIC CRUD
// -----------------------------

export async function createTemplate(req, res) {
  try {
    const payload = normalizeTemplatePayload(req.body);

    const missing = REQUIRED_FIELDS.filter((field) => !payload[field]);
    if (missing.length) {
      return res
        .status(400)
        .json({ error: `Missing required fields: ${missing.join(", ")}` });
    }

    const now = new Date();
    const data = {
      ...payload,
      created_at: now,
      updated_at: now,
      is_deleted: false,
      placeholders: payload.placeholders ?? null,
    };

    const contentDelegate = getContentDelegate();
    const content = contentDelegate?.create
      ? await contentDelegate.create({ data })
      : await fallbackCreate(data);
    return res.status(201).json({
      message: "Template created successfully",
      data: mapContentToResponse(content),
    });
  } catch (err) {
    console.error("Template create error:", err);
    return res.status(500).json({ error: err.message });
  }
}

export async function listTemplates(req, res) {
  try {
    const { where } = buildTemplateFilters(req.query);
    const contentDelegate = getContentDelegate();

    const templates = contentDelegate?.findMany
      ? await contentDelegate.findMany({
          where,
          orderBy: [
            { updated_at: "desc" },
            { created_at: "desc" },
          ],
        })
      : await fallbackList({ where });

    return res.status(200).json(templates.map(mapContentToResponse));
  } catch (err) {
    console.error("Template list error:", err);
    return res.status(500).json({ error: err.message });
  }
}

export async function getTemplate(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: "Invalid template id" });
    }

    const includeDeleted =
      parseBoolean(req.query.includeDeleted) || parseBoolean(req.query.include_deleted);

    const contentDelegate = getContentDelegate();
    const content = contentDelegate?.findUnique
      ? await contentDelegate.findUnique({
          where: { content_id: id },
        })
      : await fallbackGetById(id);

    if (!content || (!includeDeleted && content.is_deleted)) {
      return res.status(404).json({ error: "Template not found" });
    }

    return res.status(200).json(mapContentToResponse(content));
  } catch (err) {
    console.error("Template get error:", err);
    return res.status(500).json({ error: err.message });
  }
}

export async function updateTemplate(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: "Invalid template id" });
    }

    const normalized = normalizeTemplatePayload(req.body);
    const expiresProvided =
      "expires_at" in normalized || "expiresAt" in (req.body || {}) || "expiresat" in (req.body || {});

    const data = {
      title: normalized.title || undefined,
      type: normalized.type || undefined,
      status: normalized.status || undefined,
      lang: normalized.lang || undefined,
      body: normalized.body !== undefined ? normalized.body : undefined,
      media_url: normalized.media_url !== undefined ? normalized.media_url : undefined,
      placeholders:
        normalized.placeholders !== undefined ? normalized.placeholders : undefined,
      is_deleted: normalized.is_deleted,
      expires_at: expiresProvided ? normalized.expires_at : undefined,
      updated_at: new Date(),
    };

    const cleaned = Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== undefined),
    );

    const contentDelegate = getContentDelegate();
    const content = contentDelegate?.update
      ? await contentDelegate.update({
          where: { content_id: id },
          data: cleaned,
        })
      : await fallbackUpdate(id, cleaned);

    return res.status(200).json({
      message: "Template updated",
      data: mapContentToResponse(content),
    });
  } catch (err) {
    console.error("Template update error:", err);
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Template not found" });
    }
    return res.status(500).json({ error: err.message });
  }
}

export async function softDeleteTemplate(req, res) {
  try {
    const id = parseInt(req.params.id, 10);

    if (Number.isNaN(id)) {
      return res.status(400).json({ error: "Invalid template id" });
    }

    const contentDelegate = getContentDelegate();
    if (contentDelegate?.update) {
      await contentDelegate.update({
        where: { content_id: id },
        data: { is_deleted: true, updated_at: new Date() },
      });
    } else {
      await fallbackUpdate(id, { is_deleted: true, updated_at: new Date() });
    }

    return res.status(200).json({ message: "Template archived (soft deleted)" });
  } catch (err) {
    console.error("Soft delete error:", err);
    return res.status(500).json({ error: err.message });
  }
}

export async function deleteTemplate(req, res) {
  try {
    const id = parseInt(req.params.id, 10);

    if (Number.isNaN(id)) {
      return res.status(400).json({ error: "Invalid template id" });
    }

    const contentDelegate = getContentDelegate();
    if (contentDelegate?.delete) {
      await contentDelegate.delete({ where: { content_id: id } });
    } else {
      await prisma.$executeRawUnsafe(`DELETE FROM content WHERE content_id = $1`, id);
    }

    return res.status(200).json({ message: "Template deleted permanently" });
  } catch (err) {
    console.error("Hard delete error:", err);
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Template not found" });
    }
    if (err.code === "P2003") {
      return res.status(409).json({
        error:
          "Unable to delete template due to existing references. Please detach any linked records and try again.",
      });
    }
    return res.status(500).json({ error: err.message });
  }
}

// -----------------------------
// EXPIRY HELPER
// -----------------------------

// POST /api/templates/:id/expire
export async function setTemplateExpiry(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: "Invalid template id" });
    }

    const { expiresAt, expires_at } = req.body || {};
    const raw = expiresAt ?? expires_at;
    if (!raw) {
      return res.status(400).json({ error: "expiresAt is required" });
    }

    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) {
      return res.status(400).json({ error: "Invalid expiresAt datetime" });
    }

    const contentDelegate = getContentDelegate();
    const content = contentDelegate?.update
      ? await contentDelegate.update({
          where: { content_id: id },
          data: { expires_at: date, updated_at: new Date() },
        })
      : await fallbackUpdate(id, { expires_at: date, updated_at: new Date() });

    return res.status(200).json({
      message: "Template expiry updated",
      data: mapContentToResponse(content),
    });
  } catch (err) {
    console.error("setTemplateExpiry error:", err);
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Template not found" });
    }
    return res.status(500).json({ error: err.message });
  }
}

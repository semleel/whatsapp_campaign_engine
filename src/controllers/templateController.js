// src/controllers/templateController.js
// CRUD + archive handlers for WhatsApp templates using the existing Postgres
// `content` table. The UI fields map 1:1 to DB columns (title, type, status/category,
// lang, body, media_url, placeholders jsonb, expires_at, is_deleted) so templates
// are persisted once and reused by campaign steps via template_source_id.
import { prisma } from "../config/prismaClient.js";

// Some environments may still be using an older Prisma client bundle that lacks the
// `content` delegate. To keep the API working, we fall back to raw queries when the
// delegate is missing (e.g., when prisma.content is undefined).
// In some deployments the Prisma client may be out of sync with the DB schema
// (e.g., client expects a `category` column that does not exist). Default to raw
// SQL fallbacks unless explicitly enabled via env flag.
const getContentDelegate = () =>
  process.env.USE_PRISMA_CONTENT === "true" ? prisma?.content : null;

const fallbackList = async ({ where }) => {
  const conditions = [];
  const params = [];

  if (where?.lang) {
    params.push(where.lang);
    conditions.push(`UPPER(lang) = UPPER($${params.length})`);
  }
  if (where?.content_key) {
    params.push(where.content_key);
    conditions.push(`content_key = $${params.length}`);
  }
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
    SELECT content_id, title, type, status, lang, content_key, body, media_url, placeholders,
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
    `SELECT content_id, title, type, status, lang, content_key, body, media_url, placeholders,
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

    if (key === "placeholders") {
      placeholders.push(`$${idx + 1}::jsonb`);
      values.push(val === null ? null : JSON.stringify(val));
    } else {
      placeholders.push(`$${idx + 1}`);
      values.push(normalizeForSql(val));
    }
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
    if (key === "placeholders") {
      sets.push(`${key} = $${idx + 1}::jsonb`);
      values.push(val === null ? null : JSON.stringify(val));
    } else {
      sets.push(`${key} = $${idx + 1}`);
      values.push(normalizeForSql(val));
    }
  });

  values.push(id);

  return prisma.$queryRawUnsafe(
    `UPDATE content
     SET ${sets.join(", ")}
     WHERE content_id = $${values.length}
     RETURNING content_id, title, type, status, lang, body, media_url, placeholders,
               created_at, updated_at, expires_at, is_deleted`,
    ...values
  );
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

const parseDateSafe = (value) => {
  if (!value) return null;
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
    content_key: content.content_key,
    contentkey: content.content_key,
    title: content.title,
    type: content.type,
    status: content.status,
    category: content.status,
    lang: content.lang ? content.lang.toUpperCase() : content.lang,
    defaultlang: content.lang ? content.lang.toUpperCase() : content.lang,
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
  const langRaw = sanitizeString(body.lang || body.defaultLang);
  const lang = langRaw ? langRaw.toUpperCase() : langRaw;
  const status = sanitizeString(body.status || body.category);
  const contentKey = sanitizeString(body.content_key || body.contentKey);
  const mediaProvided = Object.prototype.hasOwnProperty.call(body, "media_url")
    || Object.prototype.hasOwnProperty.call(body, "mediaUrl");
  const mediaUrl = mediaProvided ? sanitizeString(body.media_url ?? body.mediaUrl) : undefined;
  const bodyProvided = Object.prototype.hasOwnProperty.call(body, "body");
  const textBody =
    bodyProvided && typeof body.body === "string"
      ? body.body
      : bodyProvided
        ? ""
        : undefined;
  const expiresRaw = body.expires_at ?? body.expiresAt ?? body.expiresat;

  return {
    title,
    type,
    status,
    lang,
    content_key: contentKey || null,
    body: textBody,
    media_url: mediaUrl === undefined ? undefined : mediaUrl || null,
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
  const langFilterRaw = sanitizeString(query.lang || query.language);
  const langFilter = langFilterRaw ? langFilterRaw.toUpperCase() : "";
  const search = sanitizeString(query.search || query.q);
  const contentKeyFilter = sanitizeString(query.contentKey || query.content_key);

  const where = includeDeleted ? {} : { is_deleted: false };
  if (statusFilter && statusFilter.toLowerCase() !== "all") {
    where.status = statusFilter;
  }
  if (typeFilter && typeFilter.toLowerCase() !== "all") {
    where.type = typeFilter;
  }
  if (langFilter && langFilter.toLowerCase() !== "all") {
    where.lang = langFilter;
  }
  if (contentKeyFilter) {
    where.content_key = contentKeyFilter;
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
    let content = null;
    if (contentDelegate?.create) {
      try {
        content = await contentDelegate.create({ data });
      } catch (err) {
        console.warn("Prisma content.create failed, falling back to raw insert:", err.message);
        content = await fallbackCreate(data);
      }
    } else {
      content = await fallbackCreate(data);
    }
    return res.status(201).json({
      message: "Template created successfully",
      data: mapContentToResponse(content),
    });
  } catch (err) {
    console.error("Template create error:", err);
    if (err.code === "P2002") {
      return res.status(409).json({
        error: "A template with this content key and language already exists.",
      });
    }
    return res.status(500).json({ error: err.message });
  }
}

export async function listTemplates(req, res) {
  try {
    const { where } = buildTemplateFilters(req.query);
    const contentDelegate = getContentDelegate();

    let templates = [];
    if (contentDelegate?.findMany) {
      try {
        templates = await contentDelegate.findMany({
          where,
          orderBy: [
            { updated_at: "desc" },
            { created_at: "desc" },
          ],
        });
      } catch (err) {
        console.warn("Prisma content.findMany failed, falling back to raw list:", err.message);
        templates = await fallbackList({ where });
      }
    } else {
      templates = await fallbackList({ where });
    }

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
    let content = null;
    if (contentDelegate?.findUnique) {
      try {
        content = await contentDelegate.findUnique({
          where: { content_id: id },
        });
      } catch (err) {
        console.warn("Prisma content.findUnique failed, falling back to raw get:", err.message);
        content = await fallbackGetById(id);
      }
    } else {
      content = await fallbackGetById(id);
    }

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
      content_key:
        normalized.content_key === null
          ? null
          : normalized.content_key || undefined,
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
    let content = null;
    if (contentDelegate?.update) {
      try {
        content = await contentDelegate.update({
          where: { content_id: id },
          data: cleaned,
        });
      } catch (err) {
        console.warn("Prisma content.update failed, falling back to raw update:", err.message);
        content = await fallbackUpdate(id, cleaned);
      }
    } else {
      content = await fallbackUpdate(id, cleaned);
    }

    return res.status(200).json({
      message: "Template updated",
      data: mapContentToResponse(content),
    });
  } catch (err) {
    console.error("Template update error:", err);
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Template not found" });
    }
    if (err.code === "P2002") {
      return res.status(409).json({
        error: "A template with this content key and language already exists.",
      });
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
      try {
        await contentDelegate.update({
          where: { content_id: id },
          data: { is_deleted: true, updated_at: new Date() },
        });
      } catch (err) {
        console.warn("Prisma content.update (soft delete) failed, falling back to raw:", err.message);
        await fallbackUpdate(id, { is_deleted: true, updated_at: new Date() });
      }
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
      try {
        await contentDelegate.delete({ where: { content_id: id } });
      } catch (err) {
        console.warn("Prisma content.delete failed, falling back to raw delete:", err.message);
        await prisma.$executeRawUnsafe(`DELETE FROM content WHERE content_id = $1`, id);
      }
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
// OVERVIEW / DASHBOARD
// -----------------------------

export async function getTemplatesOverview(_req, res) {
  try {
    const now = Date.now();
    const lookaheadMs = 30 * 24 * 60 * 60 * 1000;
    const contentDelegate = getContentDelegate();

    let templatesRaw = [];
    if (contentDelegate?.findMany) {
      try {
        templatesRaw = await contentDelegate.findMany({
          where: { is_deleted: false },
          orderBy: [{ updated_at: "desc" }, { created_at: "desc" }],
        });
      } catch (err) {
        console.warn("Prisma content.findMany (overview) failed, falling back to raw list:", err.message);
        templatesRaw = await fallbackList({ where: { is_deleted: false } });
      }
    } else {
      templatesRaw = await fallbackList({ where: { is_deleted: false } });
    }

    const templates = templatesRaw
      .map((t) => {
        const id = Number(t.content_id ?? t.contentid ?? t.id);
        if (Number.isNaN(id)) return null;
        return {
          id,
          title: t.title || `Template ${id}`,
          status: t.status || null,
          type: t.type || null,
          createdAt: t.created_at ?? t.createdat ?? null,
          updatedAt:
            t.updated_at ?? t.updatedat ?? t.lastupdated ?? t.created_at ?? t.createdat ?? null,
          expiresAt: t.expires_at ?? t.expiresat ?? null,
        };
      })
      .filter(Boolean);

    const counts = {
      total: templates.length,
      approved: 0,
      pendingMeta: 0,
      draft: 0,
      expired: 0,
      rejected: 0,
    };
    const pipeline = {
      draft: 0,
      pendingMeta: 0,
      approved: 0,
      rejected: 0,
      expired: 0,
    };

    const templateMap = new Map();

    templates.forEach((tpl) => {
      templateMap.set(tpl.id, tpl);
      const statusNorm = (tpl.status || "").trim().toLowerCase();
      const expiresAtDate = parseDateSafe(tpl.expiresAt);
      const expiresTs = expiresAtDate ? expiresAtDate.getTime() : null;
      const isExpired = expiresTs !== null && expiresTs < now;

      if (
        statusNorm === "approved" ||
        statusNorm === "active" ||
        statusNorm === "live" ||
        statusNorm === "published" ||
        statusNorm === ""
      ) {
        counts.approved += 1;
      }
      if (statusNorm.startsWith("pending")) counts.pendingMeta += 1;
      if (statusNorm.startsWith("draft")) counts.draft += 1;
      if (statusNorm.startsWith("reject")) counts.rejected += 1;
      if (isExpired || statusNorm === "expired") counts.expired += 1;

      const stage = (() => {
        if (isExpired || statusNorm === "expired") return "expired";
        if (statusNorm.startsWith("draft")) return "draft";
        if (statusNorm.startsWith("pending")) return "pendingMeta";
        if (statusNorm.startsWith("reject")) return "rejected";
        return "approved";
      })();
      pipeline[stage] += 1;
    });

    const recent = templates
      .map((tpl) => ({
        id: tpl.id,
        title: tpl.title,
        status: tpl.status,
        updatedAt:
          parseDateSafe(tpl.updatedAt)?.toISOString() ??
          parseDateSafe(tpl.createdAt)?.toISOString() ??
          new Date(now).toISOString(),
      }))
      .sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )
      .slice(0, 8);

    const upcomingExpiries = templates
      .map((tpl) => {
        const expiresDate = parseDateSafe(tpl.expiresAt);
        if (!expiresDate) return null;
        return { ...tpl, expiresDate };
      })
      .filter(Boolean)
      .filter((tpl) => {
        const expiresTs = tpl.expiresDate.getTime();
        return expiresTs >= now && expiresTs <= now + lookaheadMs;
      })
      .sort((a, b) => a.expiresDate.getTime() - b.expiresDate.getTime())
      .slice(0, 5)
      .map((tpl) => ({
        id: tpl.id,
        title: tpl.title,
        status: tpl.status,
        expiresAt: tpl.expiresDate.toISOString(),
      }));

    let usageRows = [];
    try {
      if (prisma?.campaign_step?.groupBy) {
        usageRows = await prisma.campaign_step.groupBy({
          by: ["template_source_id"],
          where: { template_source_id: { not: null } },
          _count: { _all: true },
        });
      } else {
        usageRows = await prisma.$queryRawUnsafe(
          `SELECT template_source_id, COUNT(*) AS usage_count
           FROM campaign_step
           WHERE template_source_id IS NOT NULL
           GROUP BY template_source_id`,
        );
      }
    } catch (err) {
      console.error("Failed to compute template usage:", err);
      usageRows = [];
    }

    const mostUsed = usageRows
      .map((row) => {
        const id = Number(row.template_source_id ?? row.template_sourceid ?? row.content_id);
        const usageCount = Number(
          row._count?._all ??
          row._count?.template_source_id ??
          row.usage_count ??
          row.count ??
          0,
        );
        if (Number.isNaN(id) || !templateMap.has(id)) return null;
        const tpl = templateMap.get(id);
        return {
          id,
          title: tpl.title,
          status: tpl.status,
          type: tpl.type,
          usageCount,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, 5);

    return res.status(200).json({
      counts,
      pipeline,
      recent,
      mostUsed,
      upcomingExpiries,
    });
  } catch (err) {
    console.error("getTemplatesOverview error:", err);
    return res
      .status(500)
      .json({ error: err.message || "Failed to load templates overview" });
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
    let content = null;
    if (contentDelegate?.update) {
      try {
        content = await contentDelegate.update({
          where: { content_id: id },
          data: { expires_at: date, updated_at: new Date() },
        });
      } catch (err) {
        console.warn("Prisma content.update (expiry) failed, falling back to raw update:", err.message);
        content = await fallbackUpdate(id, { expires_at: date, updated_at: new Date() });
      }
    } else {
      content = await fallbackUpdate(id, { expires_at: date, updated_at: new Date() });
    }

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

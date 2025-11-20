// src/controllers/templateController.js
import prisma from "../config/prismaClient.js";

const ensureArrayOrNull = (value) => {
  if (value == null || value === "") return null;
  if (Array.isArray(value)) return value;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const mapContentToResponse = (content) => ({
  ...content,
  defaultlang: content.lang,
  currentversion: null,
  lastupdated: content.updatedat || content.createdat,
});

// -----------------------------
// BASIC CRUD
// -----------------------------

export async function createTemplate(req, res) {
  try {
    const {
      title,
      type,
      category,
      status = "Draft",
      defaultLang = "en",
      lang,
      description = "",
      mediaUrl = null,
      body = "",
      placeholders = null,
    } = req.body || {};

    if (!title || !type) {
      return res.status(400).json({ error: "title and type are required" });
    }

    const now = new Date();
    const data = {
      title,
      type,
      category: category || null,
      status,
      lang: lang || defaultLang,
      description,
      mediaurl: mediaUrl,
      body,
      placeholders: ensureArrayOrNull(placeholders),
      createdat: now,
      updatedat: now,
      isdeleted: false,
    };

    const content = await prisma.content.create({ data });
    return res
      .status(201)
      .json({
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
    const includeDeleted = req.query.includeDeleted === "true";

    const where = includeDeleted
      ? {}
      : { OR: [{ isdeleted: false }, { isdeleted: null }] };

    const contents = await prisma.content.findMany({
      where,
      orderBy: { updatedat: "desc" },
    });

    return res.status(200).json(contents.map(mapContentToResponse));
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

    const content = await prisma.content.findUnique({
      where: { contentid: id },
    });
    if (!content) {
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

    const {
      title,
      type,
      category,
      status,
      defaultLang,
      lang,
      description,
      mediaUrl,
      body,
      placeholders,
      isdeleted,
    } = req.body || {};

    const data = {
      title,
      type,
      category,
      status,
      lang: lang || defaultLang,
      description,
      mediaurl: mediaUrl,
      body,
      placeholders:
        placeholders !== undefined
          ? ensureArrayOrNull(placeholders)
          : undefined,
      isdeleted,
      updatedat: new Date(),
    };

    const cleaned = Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== undefined),
    );

    const content = await prisma.content.update({
      where: { contentid: id },
      data: cleaned,
    });

    return res
      .status(200)
      .json({ message: "Template updated", data: mapContentToResponse(content) });
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

    await prisma.content.update({
      where: { contentid: id },
      data: { isdeleted: true, updatedat: new Date() },
    });

    return res.status(200).json({ message: "Template archived (soft deleted)" });
  } catch (err) {
    console.error("Soft delete error:", err);
    return res.status(500).json({ error: err.message });
  }
}

// -----------------------------
// TAGS & EXPIRY HELPERS
// -----------------------------

// helper: upsert tag names -> return tag IDs
async function upsertTagsByNames(tagNames = []) {
  const names = Array.from(
    new Set(
      tagNames
        .map((n) => (typeof n === "string" ? n.trim() : ""))
        .filter(Boolean),
    ),
  );

  if (!names.length) return [];

  const now = new Date();

  const tagRecords = await Promise.all(
    names.map((name) =>
      prisma.tag.upsert({
        where: { name },
        update: { updatedat: now, isdeleted: false },
        create: {
          name,
          isdeleted: false,
          createdat: now,
          updatedat: now,
        },
      }),
    ),
  );

  return tagRecords.map((t) => t.tagid);
}

// POST /api/template/:id/tags
export async function attachTagsToTemplate(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: "Invalid template id" });
    }

    const { tags } = req.body || {};
    if (!Array.isArray(tags)) {
      return res
        .status(400)
        .json({ error: "tags must be an array of strings" });
    }

    // ensure content exists
    const content = await prisma.content.findUnique({
      where: { contentid: id },
    });
    if (!content) {
      return res.status(404).json({ error: "Template not found" });
    }

    const tagIds = await upsertTagsByNames(tags);

    // remove existing tag links, then create new ones
    await prisma.contenttag.deleteMany({ where: { contentid: id } });

    if (tagIds.length) {
      await prisma.contenttag.createMany({
        data: tagIds.map((tagid) => ({ contentid: id, tagid })),
        skipDuplicates: true,
      });
    }

    return res
      .status(200)
      .json({ message: "Tags updated for template", tagIds });
  } catch (err) {
    console.error("attachTagsToTemplate error:", err);
    return res.status(500).json({ error: err.message });
  }
}

// POST /api/template/:id/expire
export async function setTemplateExpiry(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: "Invalid template id" });
    }

    const { expiresAt } = req.body || {};
    if (!expiresAt) {
      return res.status(400).json({ error: "expiresAt is required" });
    }

    const date = new Date(expiresAt);
    if (Number.isNaN(date.getTime())) {
      return res.status(400).json({ error: "Invalid expiresAt datetime" });
    }

    const content = await prisma.content.update({
      where: { contentid: id },
      data: { expiresat: date, updatedat: new Date() },
    });

    return res
      .status(200)
      .json({
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

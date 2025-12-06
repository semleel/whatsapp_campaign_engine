// src/controllers/templateController.js
import { prisma } from "../config/prismaClient.js";

const ensureJsonOrNull = (value) => {
  if (value == null || value === "") return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

// Normalize DB record shape for the frontend
const mapContentToResponse = (content) => {
  if (!content) return null;

  return {
    ...content,
    contentid: content.content_id,
    mediaurl: content.media_url,
    createdat: content.created_at,
    updatedat: content.updated_at,
    expiresat: content.expires_at,
    isdeleted: content.is_deleted,
    defaultlang: content.lang,
    currentversion: null,
    lastupdated: content.updated_at || content.created_at,
  };
};

// -----------------------------
// BASIC CRUD
// -----------------------------

export async function createTemplate(req, res) {
  try {
    const {
      title,
      type,
      status = "Draft",
      defaultLang = "en",
      lang,
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
      status,
      lang: lang || defaultLang,
      body,
      media_url: mediaUrl,
      placeholders: ensureJsonOrNull(placeholders),
      created_at: now,
      updated_at: now,
      is_deleted: false,
    };

    const content = await prisma.content.create({ data });
    return res.status(201).json({
      message: "Template created successfully",
      data: mapContentToResponse(content),
    });
  } catch (err) {
    console.error("Template create error:", err);
    return res.status(500).json({ error: err.message });
  }
}

export async function listTemplates(_req, res) {
  try {
    const templates = await prisma.content.findMany({
      where: { is_deleted: false },
      orderBy: { created_at: "desc" },
    });

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

    const content = await prisma.content.findUnique({
      where: { content_id: id },
    });

    if (!content || content.is_deleted) {
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
      status,
      defaultLang,
      lang,
      mediaUrl,
      body,
      placeholders,
      is_deleted,
      expiresat,
    } = req.body || {};

    const expiresAtDate =
      expiresat && !Number.isNaN(Date.parse(expiresat))
        ? new Date(expiresat)
        : undefined;

    const data = {
      title,
      type,
      status,
      lang: lang || defaultLang,
      body,
      media_url: mediaUrl,
      placeholders:
        placeholders !== undefined ? ensureJsonOrNull(placeholders) : undefined,
      is_deleted,
      updated_at: new Date(),
      expires_at: expiresAtDate,
    };

    const cleaned = Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== undefined),
    );

    const content = await prisma.content.update({
      where: { content_id: id },
      data: cleaned,
    });

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

    await prisma.content.update({
      where: { content_id: id },
      data: { is_deleted: true, updated_at: new Date() },
    });

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

    await prisma.content.delete({ where: { content_id: id } });

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
      where: { content_id: id },
      data: { expires_at: date, updated_at: new Date() },
    });

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

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
    return res.status(201).json({ message: "Template created successfully", data: mapContentToResponse(content) });
  } catch (err) {
    console.error("Template create error:", err);
    return res.status(500).json({ error: err.message });
  }
}

export async function listTemplates(_req, res) {
  try {
    const contents = await prisma.content.findMany({
      where: { OR: [{ isdeleted: false }, { isdeleted: null }] },
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

    const content = await prisma.content.findUnique({ where: { contentid: id } });
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
      placeholders: placeholders !== undefined ? ensureArrayOrNull(placeholders) : undefined,
      updatedat: new Date(),
    };

    const cleaned = Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== undefined)
    );

    const content = await prisma.content.update({
      where: { contentid: id },
      data: cleaned,
    });

    return res.status(200).json({ message: "Template updated", data: mapContentToResponse(content) });
  } catch (err) {
    console.error("Template update error:", err);
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Template not found" });
    }
    return res.status(500).json({ error: err.message });
  }
}

export async function deleteTemplate(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: "Invalid template id" });
    }

    await prisma.content.update({
      where: { contentid: id },
      data: {
        isdeleted: true,
      },
    });

    return res.status(200).json({ message: "Template deleted" });
  } catch (err) {
    console.error("Template delete error:", err);
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Template not found" });
    }
    return res.status(500).json({ error: err.message });
  }
}

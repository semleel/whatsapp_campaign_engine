import prisma from "../config/prismaClient.js";

// Small helper to parse :id
function parseId(param) {
  const id = parseInt(param, 10);
  if (Number.isNaN(id)) return null;
  return id;
}

/**
 * GET /api/tags
 * Optional: ?includeDeleted=true to also return archived tags
 */
export async function listTags(req, res) {
  try {
    const includeDeleted = req.query.includeDeleted === "true";

    const where = includeDeleted
      ? {}
      : {
          OR: [{ isdeleted: false }, { isdeleted: null }],
        };

    const tags = await prisma.tag.findMany({
      where,
      orderBy: { name: "asc" },
    });

    return res.status(200).json(tags);
  } catch (err) {
    console.error("listTags error:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}

/**
 * GET /api/tags/:id
 */
export async function getTag(req, res) {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: "Invalid tag id" });
    }

    const tag = await prisma.tag.findUnique({ where: { tagid: id } });
    if (!tag) {
      return res.status(404).json({ error: "Tag not found" });
    }

    return res.status(200).json(tag);
  } catch (err) {
    console.error("getTag error:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}

/**
 * POST /api/tags
 * body: { name: string }
 */
export async function createTag(req, res) {
  try {
    const rawName = (req.body?.name || "").trim();
    if (!rawName) {
      return res.status(400).json({ error: "Tag name is required" });
    }

    const tag = await prisma.tag.create({
      data: {
        name: rawName,
        isdeleted: false,
        createdat: new Date(),
        updatedat: new Date(),
      },
    });

    return res
      .status(201)
      .json({ message: "Tag created successfully", data: tag });
  } catch (err) {
    console.error("createTag error:", err);
    // unique constraint
    if (err.code === "P2002") {
      return res
        .status(409)
        .json({ error: "Tag name already exists, please choose another" });
    }
    return res.status(500).json({ error: err.message || "Server error" });
  }
}

/**
 * PUT /api/tags/:id
 * body: { name?: string, isdeleted?: boolean }
 */
export async function updateTag(req, res) {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: "Invalid tag id" });
    }

    const { name, isdeleted } = req.body || {};

    const data = {
      updatedat: new Date(),
    };

    if (typeof name === "string") {
      const trimmed = name.trim();
      if (!trimmed) {
        return res.status(400).json({ error: "Tag name cannot be empty" });
      }
      data.name = trimmed;
    }

    if (typeof isdeleted === "boolean") {
      data.isdeleted = isdeleted;
    }

    if (!data.name && typeof data.isdeleted === "undefined") {
      return res
        .status(400)
        .json({ error: "Nothing to update (name or isdeleted required)" });
    }

    const tag = await prisma.tag.update({
      where: { tagid: id },
      data,
    });

    return res
      .status(200)
      .json({ message: "Tag updated successfully", data: tag });
  } catch (err) {
    console.error("updateTag error:", err);
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Tag not found" });
    }
    if (err.code === "P2002") {
      return res
        .status(409)
        .json({ error: "Tag name already exists, please choose another" });
    }
    return res.status(500).json({ error: err.message || "Server error" });
  }
}

/**
 * POST /api/tags/:id/archive
 * Soft delete: set isdeleted = true
 */
export async function archiveTag(req, res) {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: "Invalid tag id" });
    }

    const tag = await prisma.tag.update({
      where: { tagid: id },
      data: {
        isdeleted: true,
        updatedat: new Date(),
      },
    });

    return res
      .status(200)
      .json({ message: "Tag archived successfully", data: tag });
  } catch (err) {
    console.error("archiveTag error:", err);
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Tag not found" });
    }
    return res.status(500).json({ error: err.message || "Server error" });
  }
}

/**
 * POST /api/tags/:id/recover
 * Undo soft delete: set isdeleted = false
 */
export async function recoverTag(req, res) {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: "Invalid tag id" });
    }

    const tag = await prisma.tag.update({
      where: { tagid: id },
      data: {
        isdeleted: false,
        updatedat: new Date(),
      },
    });

    return res
      .status(200)
      .json({ message: "Tag recovered successfully", data: tag });
  } catch (err) {
    console.error("recoverTag error:", err);
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Tag not found" });
    }
    return res.status(500).json({ error: err.message || "Server error" });
  }
}

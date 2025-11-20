import prisma from "../config/prismaClient.js";

// Helper: normalize and dedupe tag names
function normalizeTags(rawTags) {
  if (!rawTags) return [];
  if (!Array.isArray(rawTags)) return [];

  const cleaned = rawTags
    .map((t) => (typeof t === "string" ? t.trim() : ""))
    .filter((t) => t.length > 0);

  // de-duplicate (case-insensitive but keep original casing of first occurrence)
  const seen = new Set();
  const result = [];
  for (const t of cleaned) {
    const key = t.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(t);
    }
  }
  return result;
}

// POST /api/template/:id/tags
// body: { tags: string[] }
export async function upsertTemplateTags(req, res) {
  try {
    const contentId = parseInt(req.params.id, 10);
    if (Number.isNaN(contentId)) {
      return res.status(400).json({ error: "Invalid template id" });
    }

    const rawTags = (req.body && req.body.tags) || [];
    const tags = normalizeTags(rawTags);

    // If no tags, just clear mappings
    if (tags.length === 0) {
      await prisma.contenttag.deleteMany({
        where: { contentid: contentId },
      });
      return res.status(200).json({
        message: "Tags cleared for template",
        data: [],
      });
    }

    // Ensure the template exists
    const content = await prisma.content.findUnique({
      where: { contentid: contentId },
    });
    if (!content) {
      return res.status(404).json({ error: "Template not found" });
    }

    // Upsert tags in tag table
    const tagRecords = [];
    for (const name of tags) {
      const tag = await prisma.tag.upsert({
        where: { name },
        update: {},
        create: { name, isdeleted: false },
      });
      tagRecords.push(tag);
    }

    // Replace all mappings for this content
    await prisma.contenttag.deleteMany({
      where: { contentid: contentId },
    });

    await prisma.contenttag.createMany({
      data: tagRecords.map((t) => ({
        contentid: contentId,
        tagid: t.tagid,
      })),
      skipDuplicates: true,
    });

    return res.status(200).json({
      message: "Tags updated for template",
      data: tagRecords,
    });
  } catch (err) {
    console.error("Template tags upsert error:", err);
    return res.status(500).json({ error: err.message });
  }
}

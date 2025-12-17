import { prisma } from "../config/prismaClient.js";

function parseBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    return ["1", "true", "yes", "on"].includes(v);
  }
  return false;
}

export async function listFeedback(req, res) {
  try {
    const ratingRaw = req.query.rating;
    const hasComment = parseBoolean(req.query.hasComment ?? req.query.has_comment);

    const where = {};
    const allowedRatings = new Set(["good", "neutral", "bad"]);
    const normalizedRating = ratingRaw
      ? String(ratingRaw).trim().toLowerCase()
      : "";
    if (normalizedRating && allowedRatings.has(normalizedRating)) {
      where.rating = normalizedRating;
    }
    if (hasComment) {
      where.comment = { not: null };
    }

    const rows = await prisma.service_feedback.findMany({
      where,
      orderBy: [{ created_at: "desc" }],
      include: {
        contact: {
          select: {
            contact_id: true,
            name: true,
            phone_num: true,
          },
        },
      },
    });

    const data = rows.map((r) => ({
      feedback_id: r.feedback_id,
      contact_id: r.contact_id,
      campaign_session_id: r.campaign_session_id,
      rating: r.rating,
      comment: r.comment,
      created_at: r.created_at,
      contact_name: r.contact?.name || null,
      contact_phone: r.contact?.phone_num || null,
    }));

    return res.json({ items: data });
  } catch (err) {
    console.error("listFeedback error:", err);
    return res.status(500).json({ error: err.message || "Failed to load feedback" });
  }
}

export async function createFeedback(req, res) {
  try {
    const ratingRaw = req.body.rating;
    const rating = ratingRaw ? String(ratingRaw).trim().toLowerCase() : "";
    const comment = req.body.comment ? String(req.body.comment).trim() : null;
    const contactId = req.body.contact_id ? Number(req.body.contact_id) : null;
    const sessionId = req.body.campaign_session_id ? Number(req.body.campaign_session_id) : null;
    const allowedRatings = new Set(["good", "neutral", "bad"]);

    if (!allowedRatings.has(rating)) {
      return res.status(400).json({
        error: "rating must be one of: good, neutral, bad",
      });
    }

    const record = await prisma.service_feedback.create({
      data: {
        contact_id: contactId,
        campaign_session_id: sessionId,
        rating,
        comment,
      },
    });

    return res.status(201).json({
      message: "Feedback recorded",
      data: {
        feedback_id: record.feedback_id,
      },
    });
  } catch (err) {
    console.error("createFeedback error:", err);
    return res.status(500).json({ error: err.message || "Failed to save feedback" });
  }
}

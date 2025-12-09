import { prisma } from "../config/prismaClient.js";

// Return recent deliverylog entries (primary source), enriched with message/contact/campaign.
export async function listDeliveryReport(req, res) {
  try {
    const limit = Math.min(
      Math.max(parseInt(req.query.limit ?? "100", 10) || 100, 1),
      500
    );

    const rows = await prisma.delivery_log.findMany({
      orderBy: { created_at: "desc" },
      take: limit,
      include: {
        message: {
          select: {
            message_id: true,
            campaign_session: {
              select: { campaign: { select: { campaign_name: true } }, campaign_id: true },
            },
            contact: { select: { phone_num: true } },
            provider_msg_id: true,
            error_message: true,
          },
        },
      },
    });

    const data = rows.map((d) => ({
      messageid: d.message?.message_id ?? d.message_id,
      campaign:
        d.message?.campaign_session?.campaign?.campaign_name ??
        null,
      contact: d.message?.contact?.phone_num ?? null,
      status: d.delivery_status ?? "pending",
      retrycount: d.retry_count ?? 0,
      sentAt: d.last_attempt_at ?? d.created_at ?? null,
      provider_msg_id: d.provider_msg_id ?? d.message?.provider_msg_id ?? null,
      error_message: d.error_message ?? d.message?.error_message ?? null,
    }));

    return res.status(200).json(data);
  } catch (err) {
    console.error("listDeliveryReport error:", err);
    return res.status(500).json({ error: err.message || "Failed to load delivery report" });
  }
}

// Flow stats by campaign: total sessions and completion count
export async function listFlowStats(_req, res) {
  // Flow stats are not needed anymore; return empty dataset.
  return res.status(200).json([]);
}

// Summary across messages, delivery, and campaigns
export async function reportSummary(_req, res) {
  try {
    const now = new Date();
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [messagesLast24, messagesTotal, activeCampaigns, deliveries] = await Promise.all([
      prisma.message.count({ where: { created_at: { gte: since24h } } }),
      prisma.message.count(),
      prisma.campaign.count({
        where: {
          // Treat any non-archived campaign as "active" for summary purposes (cover case variants).
          status: { notIn: ["Archived", "archived"] },
        },
      }),
      prisma.delivery_log.findMany({
        where: { created_at: { gte: since7d } },
        select: {
          delivery_status: true,
          message: {
            select: {
              campaign_session: {
                select: { campaign_id: true, campaign: { select: { campaign_name: true } } },
              },
            },
          },
        },
      }),
    ]);

    const totalDeliveries = deliveries.length;
    const successDeliveries = deliveries.filter((d) => {
      const s = (d.delivery_status || "").toLowerCase();
      return s === "delivered" || s === "sent" || s === "read";
    }).length;
    const failedDeliveries = deliveries.filter((d) => {
      const s = (d.delivery_status || "").toLowerCase();
      return s === "failed" || s === "error";
    }).length;

    const deliveryRate =
      totalDeliveries > 0 ? Number(((successDeliveries / totalDeliveries) * 100).toFixed(1)) : 0;

    const trendingMap = new Map();
    for (const d of deliveries) {
      const key = d.message?.campaign_session?.campaign_id ?? 0;
      if (!trendingMap.has(key)) {
        trendingMap.set(key, {
          campaignid: d.message?.campaign_session?.campaign_id ?? null,
          name: d.message?.campaign_session?.campaign?.campaign_name || "Unknown campaign",
          sent: 0,
          delivered: 0,
        });
      }
      const entry = trendingMap.get(key);
      entry.sent += 1;
      const s = (d.delivery_status || "").toLowerCase();
      if (s === "delivered" || s === "sent" || s === "read") {
        entry.delivered += 1;
      }
    }

    const trending = Array.from(trendingMap.values())
      .map((row) => ({
        ...row,
        deliveredRate: row.sent > 0 ? Number(((row.delivered / row.sent) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.sent - a.sent)
      .slice(0, 5);

    return res.status(200).json({
      metrics: {
        messagesLast24,
        messagesTotal,
        deliveryRate,
        activeCampaigns,
        deliveries: totalDeliveries,
        deliveriesSuccess: successDeliveries,
        deliveriesFailed: failedDeliveries,
      },
      trending,
    });
  } catch (err) {
    console.error("reportSummary error:", err);
    return res.status(500).json({ error: err.message || "Failed to load report summary" });
  }
}

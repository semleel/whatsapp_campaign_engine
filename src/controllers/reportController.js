import prisma from "../config/prismaClient.js";

// Return recent deliverylog entries (primary source), enriched with message/contact/campaign.
export async function listDeliveryReport(req, res) {
  try {
    const limit = Math.min(
      Math.max(parseInt(req.query.limit ?? "100", 10) || 100, 1),
      500
    );

    const rows = await prisma.deliverlog.findMany({
      orderBy: { createdat: "desc" },
      take: limit,
      include: {
        message: {
          select: {
            messageid: true,
            campaign: { select: { campaignname: true } },
            contact: { select: { phonenum: true } },
            provider_msg_id: true,
            error_message: true,
          },
        },
      },
    });

    const data = rows.map((d) => ({
      messageid: d.message?.messageid ?? d.messageid,
      campaign: d.message?.campaign?.campaignname ?? null,
      contact: d.message?.contact?.phonenum ?? null,
      status: d.deliverstatus ?? "pending",
      retrycount: d.retrycount ?? 0,
      sentAt: d.lastattemptat ?? d.createdat ?? null,
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
  try {
    const sessions = await prisma.campaignsession.findMany({
      select: {
        campaignid: true,
        sessionstatus: true,
        campaign: { select: { campaignname: true } },
      },
    });

    const byCampaign = new Map();

    for (const s of sessions) {
      const key = s.campaignid ?? 0;
      if (!byCampaign.has(key)) {
        byCampaign.set(key, {
          campaignid: s.campaignid ?? null,
          name: s.campaign?.campaignname ?? "Unknown campaign",
          sessions: 0,
          completed: 0,
        });
      }
      const entry = byCampaign.get(key);
      entry.sessions += 1;
      if ((s.sessionstatus || "").toUpperCase() === "COMPLETED") {
        entry.completed += 1;
      }
    }

    const rows = Array.from(byCampaign.values()).map((row) => ({
      ...row,
      completionRate:
        row.sessions > 0 ? Number(((row.completed / row.sessions) * 100).toFixed(1)) : 0,
    }));

    rows.sort((a, b) => b.sessions - a.sessions);

    return res.status(200).json(rows);
  } catch (err) {
    console.error("listFlowStats error:", err);
    return res.status(500).json({ error: err.message || "Failed to load flow stats" });
  }
}

// Summary across messages, delivery, and campaigns
export async function reportSummary(_req, res) {
  try {
    const now = new Date();
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [messagesLast24, messagesTotal, activeCampaigns, deliveries] = await Promise.all([
      prisma.message.count({ where: { timestamp: { gte: since24h } } }),
      prisma.message.count(),
      prisma.campaign.count({ where: { status: { not: "Archived" } } }),
      prisma.deliverlog.findMany({
        where: { createdat: { gte: since7d } },
        select: {
          deliverstatus: true,
          message: {
            select: {
              campaignid: true,
              campaign: { select: { campaignname: true } },
            },
          },
        },
      }),
    ]);

    const totalDeliveries = deliveries.length;
    const successDeliveries = deliveries.filter((d) => {
      const s = (d.deliverstatus || "").toLowerCase();
      return s === "delivered" || s === "sent" || s === "read";
    }).length;
    const failedDeliveries = deliveries.filter((d) => {
      const s = (d.deliverstatus || "").toLowerCase();
      return s === "failed" || s === "error";
    }).length;

    const deliveryRate =
      totalDeliveries > 0 ? Number(((successDeliveries / totalDeliveries) * 100).toFixed(1)) : 0;

    const trendingMap = new Map();
    for (const d of deliveries) {
      const key = d.message?.campaignid ?? 0;
      if (!trendingMap.has(key)) {
        trendingMap.set(key, {
          campaignid: d.message?.campaignid ?? null,
          name: d.message?.campaign?.campaignname || "Unknown campaign",
          sent: 0,
          delivered: 0,
        });
      }
      const entry = trendingMap.get(key);
      entry.sent += 1;
      const s = (d.deliverstatus || "").toLowerCase();
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

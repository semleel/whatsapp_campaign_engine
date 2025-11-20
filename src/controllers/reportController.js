import prisma from "../config/prismaClient.js";

// Return recent outbound messages + latest delivery attempt.
export async function listDeliveryReport(req, res) {
  try {
    const limit = Math.min(
      Math.max(parseInt(req.query.limit ?? "100", 10) || 100, 1),
      500
    );

    const rows = await prisma.message.findMany({
      where: { direction: "outbound" },
      orderBy: { timestamp: "desc" },
      take: limit,
      include: {
        campaign: { select: { campaignname: true } },
        contact: { select: { phonenum: true } },
        deliverlog: {
          orderBy: { createdat: "desc" },
          take: 1,
        },
      },
    });

    const data = rows.map((m) => {
      const latest = (m.deliverlog || [])[0] || null;
      return {
        messageid: m.messageid,
        campaign: m.campaign?.campaignname ?? null,
        contact: m.contact?.phonenum ?? null,
        status: latest?.deliverstatus ?? m.message_status ?? "pending",
        retrycount: latest?.retrycount ?? 0,
        sentAt: m.timestamp,
        provider_msg_id: latest?.provider_msg_id ?? m.provider_msg_id ?? null,
        error_message: latest?.error_message ?? m.error_message ?? null,
      };
    });

    return res.status(200).json(data);
  } catch (err) {
    console.error("listDeliveryReport error:", err);
    return res.status(500).json({ error: err.message || "Failed to load delivery report" });
  }
}

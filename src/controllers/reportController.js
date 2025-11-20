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

import { prisma } from "../config/prismaClient.js";
import { sendWhatsAppMessage } from "../services/whatsappService.js";
import { log, error as logError } from "../utils/logger.js";

const SESSION_STATUS = {
  ACTIVE: "ACTIVE",
  PAUSED: "PAUSED",
  COMPLETED: "COMPLETED",
  EXPIRED: "EXPIRED",
  CANCELLED: "CANCELLED",
};

export async function listConversations(req, res) {
  try {
    const limit = Math.min(
      Math.max(parseInt(req.query.limit ?? "100", 10) || 100, 1),
      300
    );

    // Recent messages to build threads
    const recentMessages = await prisma.message.findMany({
      orderBy: { created_at: "desc" },
      take: limit * 10, // capture more messages than conversations
      include: {
        contact: { select: { contact_id: true, name: true, phone_num: true } },
        campaign_session: {
          select: {
            session_status: true,
            campaign: { select: { campaign_name: true } },
          },
        },
      },
    });

    // Recent sessions per contact to infer status/campaign
    const recentSessions = await prisma.campaign_session.findMany({
      orderBy: [{ last_active_at: "desc" }, { created_at: "desc" }],
      take: limit * 3,
      include: {
        campaign: { select: { campaign_name: true } },
      },
    });
    const sessionByContact = new Map();
    for (const s of recentSessions) {
      if (sessionByContact.has(s.contact_id)) continue;
      sessionByContact.set(s.contact_id, s);
    }

    const conversations = new Map();

    for (const msg of recentMessages) {
      const cid = msg.contact_id;
      if (!cid) continue;

      if (!conversations.has(cid)) {
        const session = sessionByContact.get(cid);
        conversations.set(cid, {
          contactId: cid,
          contactName: msg.contact?.name || msg.contact?.phone_num || "Unknown",
          phone: msg.contact?.phone_num || "Unknown",
          status:
            session?.session_status ||
            msg.campaign_session?.session_status ||
            SESSION_STATUS.ACTIVE,
          lastMessage: msg.message_content || "",
          updatedAt: msg.created_at || new Date(),
          campaign:
            session?.campaign?.campaign_name ||
            msg.campaign_session?.campaign?.campaign_name ||
            null,
          messages: [],
        });
      }

      const conv = conversations.get(cid);
      if (conv.messages.length < 50) {
        conv.messages.push({
          id: msg.message_id,
          author: msg.direction === "outbound" ? "agent" : "customer",
          text: msg.message_content || "",
          timestamp: msg.created_at || new Date(),
        });
      }
    }

    const list = Array.from(conversations.values())
      .slice(0, limit)
      .map((c) => ({
        ...c,
        messages: c.messages.sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        ),
      }))
      .sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );

    return res.status(200).json(list);
  } catch (err) {
    console.error("listConversations error:", err);
    return res.status(500).json({ error: err.message || "Failed to load conversations" });
  }
}

export async function sendConversationMessage(req, res) {
  const contactIdRaw = req.params.id || req.body?.contactId;
  const text = (req.body?.text || "").toString().trim();

  const contactId = parseInt(contactIdRaw, 10);

  if (!contactId || Number.isNaN(contactId)) {
    return res.status(400).json({ error: "Invalid contact id" });
  }

  if (!text) {
    return res.status(400).json({ error: "Message text is required" });
  }

  try {
    const contact = await prisma.contact.findUnique({
      where: { contact_id: contactId },
      select: { contact_id: true, phone_num: true, name: true },
    });

    if (!contact?.phone_num) {
      return res.status(404).json({ error: "Contact not found or missing phone number" });
    }

    const msgRecord = await prisma.message.create({
      data: {
        direction: "outbound",
        content_type: "text",
        message_content: text,
        sender_id: "agent-ui",
        receiver_id: contact.phone_num,
        provider_msg_id: null,
        message_status: "pending",
        payload_json: JSON.stringify({ type: "text", text: { body: text } }),
        contact_id: contact.contact_id,
      },
    });

    const response = await sendWhatsAppMessage(
      contact.phone_num,
      { type: "text", text: { body: text } },
      msgRecord
    );

    const providerId = response?.messages?.[0]?.id ?? null;
    if (providerId) {
      await prisma.message.update({
        where: { message_id: msgRecord.message_id },
        data: { provider_msg_id: providerId },
      });
    }

    log(`Conversation reply sent to ${contact.phone_num} | provider_id=${providerId}`);
    return res.status(200).json({
      success: true,
      provider_msg_id: providerId,
      contactId: contact.contact_id,
    });
  } catch (err) {
    const details = err?.response?.data ?? err?.message ?? err;
    logError("sendConversationMessage error:", details);
    return res.status(500).json({ error: "Failed to send message" });
  }
}

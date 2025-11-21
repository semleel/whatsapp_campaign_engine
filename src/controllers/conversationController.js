import prisma from "../config/prismaClient.js";
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
      orderBy: { timestamp: "desc" },
      take: limit * 10, // capture more messages than conversations
      include: {
        contact: { select: { contactid: true, name: true, phonenum: true } },
        campaign: { select: { campaignname: true } },
      },
    });

    // Recent sessions per contact to infer status/campaign
    const recentSessions = await prisma.campaignsession.findMany({
      orderBy: [{ lastactiveat: "desc" }, { createdat: "desc" }],
      take: limit * 3,
      include: {
        campaign: { select: { campaignname: true } },
      },
    });
    const sessionByContact = new Map();
    for (const s of recentSessions) {
      if (sessionByContact.has(s.contactid)) continue;
      sessionByContact.set(s.contactid, s);
    }

    const conversations = new Map();

    for (const msg of recentMessages) {
      const cid = msg.contactid;
      if (!cid) continue;

      if (!conversations.has(cid)) {
        const session = sessionByContact.get(cid);
        conversations.set(cid, {
          contactId: cid,
          contactName: msg.contact?.name || msg.contact?.phonenum || "Unknown",
          phone: msg.contact?.phonenum || "Unknown",
          status: session?.sessionstatus || SESSION_STATUS.ACTIVE,
          lastMessage: msg.message_content || "",
          updatedAt: msg.timestamp || msg.createdat || new Date(),
          campaign: session?.campaign?.campaignname || msg.campaign?.campaignname || null,
          messages: [],
        });
      }

      const conv = conversations.get(cid);
      if (conv.messages.length < 50) {
        conv.messages.push({
          id: msg.messageid,
          author: msg.direction === "outbound" ? "agent" : "customer",
          text: msg.message_content || "",
          timestamp: msg.timestamp || msg.createdat || new Date(),
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
      where: { contactid: contactId },
      select: { contactid: true, phonenum: true, name: true },
    });

    if (!contact?.phonenum) {
      return res.status(404).json({ error: "Contact not found or missing phone number" });
    }

    const msgRecord = await prisma.message.create({
      data: {
        direction: "outbound",
        content_type: "text",
        message_content: text,
        senderid: "agent-ui",
        receiverid: contact.phonenum,
        provider_msg_id: null,
        timestamp: new Date(),
        message_status: "pending",
        payload_json: JSON.stringify({ type: "text", text: { body: text } }),
        contactid: contact.contactid,
      },
    });

    const response = await sendWhatsAppMessage(
      contact.phonenum,
      { type: "text", text: { body: text } },
      msgRecord
    );

    const providerId = response?.messages?.[0]?.id ?? null;
    if (providerId) {
      await prisma.message.update({
        where: { messageid: msgRecord.messageid },
        data: { provider_msg_id: providerId },
      });
    }

    log(`Conversation reply sent to ${contact.phonenum} | provider_id=${providerId}`);
    return res.status(200).json({
      success: true,
      provider_msg_id: providerId,
      contactId: contact.contactid,
    });
  } catch (err) {
    const details = err?.response?.data ?? err?.message ?? err;
    logError("sendConversationMessage error:", details);
    return res.status(500).json({ error: "Failed to send message" });
  }
}

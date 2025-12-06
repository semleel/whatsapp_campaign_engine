// src/controllers/whatsappController.js
import { sendWhatsAppMessage } from "../services/whatsappService.js";
import { prisma } from "../config/prismaClient.js";
import { log, error as logError } from "../utils/logger.js";

const describeMessage = (message) => {
  const contentType = message.type;
  if (contentType === "text") return message?.text?.body ?? "";
  if (contentType === "image")
    return `[image] ${message?.image?.caption ?? ""}`.trim();
  if (contentType === "sticker") return "[sticker]";
  if (contentType === "interactive")
    return `[interactive:${message?.interactive?.type}]`;
  return `[${contentType}]`;
};

export async function sendMessage(req, res) {
  const { to, message } = req.body;

  if (!to || !message || !message.type) {
    return res
      .status(400)
      .json({ error: "Missing or invalid 'to' or 'message' field" });
  }

  try {
    // Ensure contact exists so conversations can link messages reliably
    const contact = await prisma.contact.upsert({
      where: { phone_num: to },
      update: {},
      create: { phone_num: to },
    });

    const msgRecord = await prisma.message.create({
      data: {
        direction: "outbound",
        content_type: message.type,
        message_content: describeMessage(message),
        sender_id: "server-api",
        receiver_id: to,
        provider_msg_id: null,
        created_at: new Date(),
        message_status: "pending",
        payload_json: JSON.stringify(message),
        contact_id: contact.contact_id,
      },
    });

    const response = await sendWhatsAppMessage(to, message, msgRecord);
    const providerId = response?.messages?.[0]?.id ?? null;
    if (providerId) {
      await prisma.message.update({
        where: { message_id: msgRecord.message_id },
        data: { provider_msg_id: providerId },
      });
    }

    log(`Sent ${message.type} to ${to} | provider_id=${providerId}`);
    return res.status(200).json({
      success: true,
      provider_msg_id: providerId,
      details: response,
    });
  } catch (err) {
    // Special case: account restricted
    if (err.name === "WhatsAppRestrictedError") {
      logError(
        "WhatsApp account is restricted, cannot send messages.",
        err.meta
      );
      return res.status(503).json({
        error: "whatsapp_account_restricted",
        message:
          "Your WhatsApp Business account is restricted by Meta. Please fix it in Meta Business / WhatsApp Manager before sending messages.",
        details: err.meta,
      });
    }

    const details = err?.response?.data ?? err?.message ?? err;
    logError("/api/wa/send failed:", details);
    return res.status(500).json({ error: "Failed to send message", details });
  }
}

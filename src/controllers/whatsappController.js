import { sendWhatsAppMessage } from "../services/whatsappService.js";
import { supabase } from "../services/supabaseService.js";
import { log, error as logError } from "../utils/logger.js";

export async function sendMessage(req, res) {
  const { to, message } = req.body;

  if (!to || !message || !message.type) {
    return res.status(400).json({ error: "Missing or invalid 'to' or 'message' field" });
  }

  try {
    const response = await sendWhatsAppMessage(to, message);
    const providerId = response?.messages?.[0]?.id ?? null;

    const contentType = message.type;
    const messagePreview =
      contentType === "text"
        ? message?.text?.body ?? ""
        : contentType === "image"
        ? `[image] ${message?.image?.caption ?? ""}`.trim()
        : contentType === "sticker"
        ? "[sticker]"
        : contentType === "interactive"
        ? `[interactive:${message?.interactive?.type}]`
        : `[${contentType}]`;

    const { error } = await supabase.from("message").insert([
      {
        content_type: contentType,
        message_content: messagePreview,
        senderid: "server-api",
        receiverid: to,
        provider_msg_id: providerId,
        timestamp: new Date().toISOString(),
        message_status: "sent",
        payload_json: JSON.stringify(message),
      },
    ]);

    if (error) {
      logError("Supabase insert error:", error);
      return res.status(500).json({ error: "DB insert failed", details: error.message ?? error });
    }

    log(`Sent ${contentType} to ${to} | provider_id=${providerId}`);
    return res.status(200).json({
      success: true,
      provider_msg_id: providerId,
      details: response,
    });
  } catch (err) {
    const details = err?.response?.data ?? err?.message ?? err;
    logError("/api/wa/send failed:", details);
    return res.status(500).json({ error: "Failed to send message", details });
  }
}

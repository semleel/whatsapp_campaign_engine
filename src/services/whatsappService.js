import axios from "axios";
import config from "../config/index.js";
import { log, error } from "../utils/logger.js";

export async function sendWhatsAppMessage(to, messageObj) {
  try {
    if (!to || !messageObj) throw new Error("Invalid message payload");

    // Allow plain string for convenience
    let normalized;
    if (typeof messageObj === "string") {
      normalized = { type: "text", text: { body: messageObj } };
    } else if (typeof messageObj === "object" && messageObj.type) {
      normalized = messageObj;
    } else {
      throw new Error("Invalid message payload");
    }

    const payload = {
      messaging_product: "whatsapp",
      to,
      ...normalized
    };

    const res = await axios.post(
      `https://graph.facebook.com/v19.0/${config.whatsapp.phoneNumberId}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${config.whatsapp.token}`,
          "Content-Type": "application/json"
        }
      }
    );

    log(`✅ Message sent to ${to} (${normalized.type})`);
    return res.data;
  } catch (err) {
    error("❌ WhatsApp send error:", err.response?.data || err.message);
    throw err;
  }
}

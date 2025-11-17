import axios from "axios";
import config from "../config/index.js";
import { log, error } from "../utils/logger.js";

export async function sendWhatsAppMessage(to, messageObj) {
  try {
    if (!to || !messageObj) throw new Error("Invalid message payload");

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
      ...normalized,
    };

    const res = await axios.post(
      `https://graph.facebook.com/v19.0/${config.whatsapp.phoneNumberId}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${config.whatsapp.token}`,
          "Content-Type": "application/json",
        },
      }
    );

    log(`✅ Message sent to ${to} (${normalized.type})`);
    return res.data;
  } catch (err) {
    const status = err.response?.status;
    const data = err.response?.data;
    const msg = data?.error?.message || err.message || "Unknown error";

    error("❌ WhatsApp send error:", status, data || err.message);

    // Detect “account restricted / suspended” style errors
    const text = msg.toLowerCase();
    const isRestricted =
      text.includes("restricted") ||
      text.includes("suspended") ||
      text.includes("violated") ||
      text.includes("blocked");

    if (isRestricted) {
      const restrictedErr = new Error("WhatsApp account is restricted");
      restrictedErr.name = "WhatsAppRestrictedError";
      restrictedErr.status = status;
      restrictedErr.meta = data;
      throw restrictedErr;
    }

    throw err;
  }
}

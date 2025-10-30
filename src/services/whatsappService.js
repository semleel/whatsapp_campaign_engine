import axios from "axios";
import config from "../config/index.js";
import { error } from "../utils/logger.js";

export async function sendWhatsAppMessage(to, text) {
  try {
    const res = await axios.post(
      `https://graph.facebook.com/v19.0/${config.whatsapp.phoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text }
      },
      {
        headers: {
          Authorization: `Bearer ${config.whatsapp.token}`,
          "Content-Type": "application/json"
        }
      }
    );
    return res.data;
  } catch (err) {
    error("WhatsApp send error:", err.response?.data || err.message);
    throw err;
  }
}

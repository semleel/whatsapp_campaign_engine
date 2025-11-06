// src/routes/whatsappRoutes.js
import express from "express";
import { sendWhatsAppMessage } from "../services/whatsappService.js";
import { supabase } from "../services/supabaseService.js";
import { log, error } from "../utils/logger.js";

const router = express.Router();

router.post("/send", async (req, res) => {
    const { to, message } = req.body;

    if (!to || !message || !message.type) {
        return res.status(400).json({ error: "Missing or invalid 'to' or 'message' field" });
    }

    try {
        // 1) Send to WhatsApp
        const response = await sendWhatsAppMessage(to, message);
        const providerId = response?.messages?.[0]?.id ?? null;

        // 2) Prepare safe values for DB
        const contentType = message.type; // "text" | "image" | "interactive" | "sticker" | "template" ...
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

        // 3) Insert into Supabase (stringify full payload to keep raw copy)
        const { error: insertErr } = await supabase.from("message").insert([
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

        if (insertErr) {
            error("❌ Supabase insert error:", insertErr);
            // surface some signal to the client
            return res.status(500).json({ error: "DB insert failed", details: insertErr.message ?? insertErr });
        }

        log(`✅ Sent ${contentType} to ${to} | provider_id=${providerId}`);
        return res.status(200).json({
            success: true,
            provider_msg_id: providerId,
            details: response,
        });
    } catch (err) {
        // Show more context so you can debug fast
        const details = err?.response?.data ?? err?.message ?? err;
        error("❌ /api/wa/send failed:", details);
        return res.status(500).json({ error: "Failed to send message", details });
    }
});

export default router;

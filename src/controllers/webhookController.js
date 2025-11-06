import { whatsappWebhookSchema } from "../validators/webhookValidator.js";
import { supabase } from "../services/supabaseService.js";
import { sendWhatsAppMessage } from "../services/whatsappService.js";
import { log, error } from "../utils/logger.js";

export async function verifyWebhook(req, res) {
  const mode = req.query["hub.mode"];
  const challenge = req.query["hub.challenge"];
  const token = req.query["hub.verify_token"];

  if (mode && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    log("Webhook verified successfully");
    return res.status(200).send(challenge);
  }
  error("Webhook verification failed");
  return res.sendStatus(403);
}

export async function webhookHandler(req, res) {
  // Validate incoming payload
  const parseResult = whatsappWebhookSchema.safeParse(req.body);
  if (!parseResult.success) {
    error("Invalid webhook payload:", parseResult.error.format());
    return res.status(400).json({ error: "Invalid payload structure" });
  }
  const validData = parseResult.data;

  try {
    const entry = validData.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    const waDisplayPhone = value?.metadata?.display_phone_number || null; // WA number (string)
    const waPhoneNumberId = value?.metadata?.phone_number_id || null;      // WA number ID (string)

    // --- Handle delivery/read status receipts (concise logs only)
    const statuses = value?.statuses || [];
    if (statuses.length) {
      for (const st of statuses) {
        const s = (st?.status || "").toLowerCase();
        if (s === "sent") log("Status: Sent");
        else if (s === "delivered") log("Status: Delivered");
        else if (s === "read") log("Status: Read");
        // Update DB status if you store provider_msg_id on send:
        const tsIso = st?.timestamp ? new Date(parseInt(st.timestamp, 10) * 1000).toISOString() : null;
        await supabase.from("message")
          .update({ message_status: s || "unknown", timestamp: tsIso })
          .eq("provider_msg_id", st?.id || "");
      }
      return res.sendStatus(200);
    }

    // --- Handle inbound messages
    const messages = value?.messages || [];
    if (!messages.length) {
      // Unknown event type; keep it short
      log("Webhook received non-message event (ignored).");
      return res.sendStatus(200);
    }

    for (const message of messages) {
      const from = message?.from; // end-user number
      if (!from) {
        error("Incoming message missing 'from':", JSON.stringify(message, null, 2));
        continue;
      }

      // IDP: Ignore duplicate inbound (Meta retry) by provider id
      if (message.id) {
        const { data: already, error: selErr } = await supabase
          .from("message")
          .select("messageid")
          .eq("provider_msg_id", message.id)
          .maybeSingle();
        if (selErr) error("Supabase select (idempotency) error:", selErr);
        if (already) {
          log(`Duplicate inbound (ignored): ${message.id}`);
          continue;
        }
      }

      // Build display text for storage/routing
      let rawText = "";
      switch (message.type) {
        case "text":
          rawText = message.text?.body?.trim() || "";
          break;
        case "image":
          rawText = `[Image received: ${message.image?.caption || "no caption"}]`;
          break;
        case "interactive":
          if (message.interactive?.type === "button_reply") {
            rawText = `[Button reply: ${message.interactive.button_reply?.title}]`;
          } else if (message.interactive?.type === "list_reply") {
            rawText = `[List reply: ${message.interactive.list_reply?.title}]`;
          } else {
            rawText = "[Interactive message]";
          }
          break;
        default:
          rawText = "[Unsupported message type]";
      }

      log(`Message received: "${rawText}"`);
      log(`From ${from} (to ${waDisplayPhone || "unknown"} [id ${waPhoneNumberId || "unknown"}])`);

      // INBOUND: sender = user, receiver = your business number
      const { error: recErr } = await supabase.from("message").insert([{
        message_content: rawText,
        senderid: from,
        receiverid: waDisplayPhone,               // business number
        provider_msg_id: message.id ?? null,      // provider id of inbound msg
        timestamp: new Date().toISOString(),
        message_status: "received"
      }]);
      if (recErr) error("Supabase insert (received) error:", recErr);

      // ROUTING (simple demo)
      const isText = message.type === "text";
      const text = (isText ? (message.text?.body || "") : "").trim().toLowerCase();

      let replyText;
      if (isText && text === "join") {
        replyText = "You have successfully joined the campaign. Please wait for further updates.";
      } else if (isText) {
        // keyword lookup only for text
        const { data: keywordMatch, error: kmErr } = await supabase
          .from("keyword")
          .select("campaignid, value")
          .eq("value", text)
          .maybeSingle();
        if (kmErr) error("Keyword lookup error:", kmErr);

        if (keywordMatch) {
          const { data: campaignData, error: campaignError } = await supabase
            .from("campaign")
            .select("campaignname, objective")
            .eq("campaignid", keywordMatch.campaignid)
            .maybeSingle();
          if (campaignError) error("Error fetching campaign:", campaignError);

          replyText = campaignData
            ? `Campaign: ${campaignData.campaignname}\n\nObjective: ${campaignData.objective}\n\nType 'JOIN' to participate or 'MENU' for other campaigns.`
            : `Campaign (ID: ${keywordMatch.campaignid}) found, but no detailed record available.`;
        } else {
          replyText = "Sorry, I didn’t recognize that keyword. Try another campaign keyword or type 'MENU'.";
        }
      } else if (message.type === "image") {
        replyText = "Nice image! For campaigns, please send a keyword (e.g. CNY) or type 'MENU'.";
      } else if (message.type === "interactive") {
        replyText = "Thanks for your selection! You can also type a campaign keyword or 'MENU'.";
      } else if (message.type === "sticker") {
        replyText = "Cute sticker! To join a campaign, send a keyword or type 'MENU'.";
      } else {
        replyText = "I received your message. Please send a campaign keyword or type 'MENU'.";
      }

      // SEND a proper WhatsApp message object (not a string)
      const replyMessageObj = { type: "text", text: { body: replyText } };

      let providerId = null;
      try {
        const sendRes = await sendWhatsAppMessage(from, replyMessageObj);
        providerId = sendRes?.messages?.[0]?.id ?? null;
        log(`Reply sent to: ${from}`);
      } catch (sendErr) {
        // Don't 500 to Meta; just log and continue
        error("❌ WhatsApp send error (webhook reply):", sendErr?.response?.data || sendErr?.message || sendErr);
      }

      // OUTBOUND log
      const { error: sendErr2 } = await supabase.from("message").insert([{
        message_content: replyText,
        senderid: waDisplayPhone,
        receiverid: from,
        provider_msg_id: providerId,
        timestamp: new Date().toISOString(),
        message_status: providerId ? "sent" : "error"
      }]);
      if (sendErr2) error("Supabase insert (sent) error:", sendErr2);

      // Exact log line you requested
      log(`Reply sent to: ${from}`);
    }

    return res.sendStatus(200);
  } catch (err) {
    error("Error in webhook handler:", err);
    return res.sendStatus(500);
  }
}

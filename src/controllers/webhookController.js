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
        receiverid: waDisplayPhone,               // your displayed business number
        provider_msg_id: message.id ?? null,      // provider id of inbound msg
        timestamp: new Date().toISOString(),
        message_status: "received"
      }]);
      if (recErr) error("Supabase insert (received) error:", recErr);

      // ROUTING (simplified keyword demo)
      const text = rawText.toLowerCase();
      let replyText = "Sorry, I did not recognize that keyword. Please try another campaign keyword.";

      if (text === "join") {
        replyText = "You have successfully joined the campaign. Please wait for further updates.";
      } else {
        const { data: keywordMatch } = await supabase
          .from("keyword")
          .select("campaignid, value")
          .eq("value", text)
          .maybeSingle();

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
        }
      }

      // Send to user (ONCE) and capture provider msg id
      const sendRes = await sendWhatsAppMessage(from, replyText);
      const providerId = sendRes?.messages?.[0]?.id ?? null;

      // OUTBOUND: sender = your business number, receiver = user
      const { error: sendErr } = await supabase.from("message").insert([{
        message_content: replyText,
        senderid: waDisplayPhone,     // your number
        receiverid: from,             // end-user
        provider_msg_id: providerId,  // provider id of outbound msg
        timestamp: new Date().toISOString(),
        message_status: "sent"
      }]);
      if (sendErr) error("Supabase insert (sent) error:", sendErr);

      // Exact log line you requested
      log(`Reply sent to: ${from}`);
    }

    return res.sendStatus(200);
  } catch (err) {
    error("Error in webhook handler:", err);
    return res.sendStatus(500);
  }
}

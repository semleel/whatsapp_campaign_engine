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
  const data = req.body;

  // Validate incoming payload
  const parseResult = whatsappWebhookSchema.safeParse(data);
  if (!parseResult.success) {
    error("Invalid webhook payload:", parseResult.error.format());
    return res.status(400).json({ error: "Invalid payload structure" });
  }

  // If valid, use parsed data
  const validData = parseResult.data;

  try {
    if (
      validData?.object &&
      validData.entry?.[0]?.changes?.[0]?.value?.messages?.length
    ) {
      const message = validData.entry[0].changes[0].value.messages[0];
      const from = message.from;

      let rawText = "";
      switch (message.type) {
        case "text":
          rawText = message.text?.body?.trim() || "";
          break;
        case "image":
          rawText = `[Image received: ${message.image?.caption || "no caption"}]`;
          break;
        case "interactive":
          if (message.interactive.type === "button_reply") {
            rawText = `[Button reply: ${message.interactive.button_reply.title}]`;
          } else if (message.interactive.type === "list_reply") {
            rawText = `[List reply: ${message.interactive.list_reply.title}]`;
          }
          break;
        default:
          rawText = "[Unsupported message type]";
      }

      const text = rawText.toLowerCase();

      log(`Received message from ${from}: "${rawText}"`);

      // save incoming message
      const { error: insertError } = await supabase.from("message").insert([
        {
          message_content: rawText,
          senderid: from,
          timestamp: new Date().toISOString(),
          message_status: "received"
        }
      ]);
      if (insertError) error("Supabase insert error:", insertError);

      // simple 'join' command
      if (text === "join") {
        const replyText =
          "You have successfully joined the campaign. Please wait for further updates.";
        await sendWhatsAppMessage(from, replyText);
        await supabase.from("message").insert([{
          message_content: replyText,
          receiverid: from,
          timestamp: new Date().toISOString(),
          message_status: "sent"
        }]);
        return res.sendStatus(200);
      }

      // keyword lookup
      const { data: keywordMatch } = await supabase
        .from("keyword")
        .select("campaignid, value")
        .eq("value", text)
        .maybeSingle();

      let replyText = "Sorry, I did not recognize that keyword. Please try another campaign keyword.";

      if (keywordMatch) {
        const { data: campaignData, error: campaignError } = await supabase
          .from("campaign")
          .select("campaignname, objective")
          .eq("campaignid", keywordMatch.campaignid)
          .maybeSingle();

        if (campaignError) error("Error fetching campaign:", campaignError);

        // attempt live API data (optional)
        const { data: apiData } = await supabase
          .from("api")
          .select("url, method")
          .eq("apiid", keywordMatch.campaignid)
          .maybeSingle();

        let apiResponseText = "";
        if (apiData?.url) {
          try {
            const apiRes = await fetch(apiData.url); // or axios
            const json = await apiRes.json();
            apiResponseText = JSON.stringify(json, null, 2).slice(0, 300);
          } catch (err) {
            apiResponseText = "Unable to fetch live data for this campaign.";
            error("API Fetch Error:", err.message);
          }
        }

        if (campaignData) {
          replyText = `Campaign: ${campaignData.campaignname}\n\nObjective: ${campaignData.objective}\n\nLive Data (if any):\n${apiResponseText}\n\nType 'JOIN' to participate or 'MENU' for other campaigns.`;
        } else {
          replyText = `Campaign (ID: ${keywordMatch.campaignid}) found, but no detailed record available.`;
        }
      }

      // log + send reply
      await supabase.from("message").insert([{
        message_content: replyText,
        receiverid: message.from,
        timestamp: new Date().toISOString(),
        message_status: "sent"
      }]);

      await sendWhatsAppMessage(message.from, replyText);
      log("Reply sent to:", message.from);
    }

    return res.sendStatus(200);
  } catch (err) {
    error("Error in webhook handler:", err);
    return res.sendStatus(500);
  }
}

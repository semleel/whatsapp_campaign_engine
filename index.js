import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import { supabase } from "./services/supabaseClient.js";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(bodyParser.json());

const token = process.env.WHATSAPP_TOKEN;
const phoneNumberId = process.env.PHONE_NUMBER_ID;

// Webhook verification (for Meta)
app.get("/webhook", (req, res) => {
  const verify_token = "your_verify_token";
  const mode = req.query["hub.mode"];
  const challenge = req.query["hub.challenge"];
  const token = req.query["hub.verify_token"];

  if (mode && token === verify_token) {
    console.log("Webhook verified");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Handle incoming WhatsApp messages
app.post("/webhook", async (req, res) => {
  const data = req.body;

  try {
    if (
      data.object &&
      data.entry &&
      data.entry[0].changes &&
      data.entry[0].changes[0].value.messages
    ) {
      const message = data.entry[0].changes[0].value.messages[0];
      const from = message.from;
      const text = message.text?.body?.trim().toLowerCase() || "";

      console.log("Received message:", text);

      // 1. Save message to Supabase
      const { error: insertError } = await supabase.from("message").insert([
        {
          message_content: text,
          senderid: from,
          timestamp: new Date().toISOString(),
          message_status: "received",
        },
      ]);
      if (insertError) console.error("Supabase insert error:", insertError);

      // 2. Check for join command
      if (text === "join") {
        const replyText =
          "You have successfully joined the campaign. Please wait for further updates.";
        await sendWhatsAppMessage(from, replyText);
        await logMessage(from, replyText, "sent");
        return res.sendStatus(200);
      }

      // 3. Check if message matches any keyword
      const { data: keywordMatch } = await supabase
        .from("keyword")
        .select("campaignid, value")
        .eq("value", text)
        .maybeSingle();

      let replyText = "";

      if (keywordMatch) {
        // 4. Retrieve campaign details
        const { data: campaignData, error: campaignError } = await supabase
          .from("campaign")
          .select("campaignname, objective")
          .eq("campaignid", keywordMatch.campaignid)
          .maybeSingle();

        if (campaignError)
          console.error("Error fetching campaign:", campaignError);

        // 5. Try to get live API data (if available)
        const { data: apiData } = await supabase
          .from("api")
          .select("url, method")
          .eq("apiid", keywordMatch.campaignid)
          .maybeSingle();

        let apiResponseText = "";

        if (apiData && apiData.url) {
          try {
            const apiResponse = await axios({
              method: apiData.method || "GET",
              url: apiData.url,
            });
            apiResponseText = JSON.stringify(apiResponse.data, null, 2).slice(
              0,
              300
            );
          } catch (err) {
            apiResponseText = "Unable to fetch live data for this campaign.";
            console.error("API Fetch Error:", err.message);
          }
        }

        // 6. Format reply message
        if (campaignData) {
          replyText = `Campaign: ${campaignData.campaignname}\n\nObjective: ${campaignData.objective}\n\nLive Data (if any):\n${apiResponseText}\n\nType 'JOIN' to participate or 'MENU' for other campaigns.`;
        } else {
          replyText = `Campaign (ID: ${keywordMatch.campaignid}) found, but no detailed record available.`;
        }
      } else {
        replyText =
          "Sorry, I did not recognize that keyword. Please try another campaign keyword.";
      }

      // 7. Log and send reply
      await logMessage(from, replyText, "sent");
      await sendWhatsAppMessage(from, replyText);
      console.log("Reply sent to:", from);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("Error in webhook handler:", error);
    res.sendStatus(500);
  }
});

// Log messages to Supabase
async function logMessage(receiver, content, status) {
  await supabase.from("message").insert([
    {
      message_content: content,
      receiverid: receiver,
      timestamp: new Date().toISOString(),
      message_status: status,
    },
  ]);
}

// Send WhatsApp message
async function sendWhatsAppMessage(to, text) {
  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("WhatsApp send error:", error.response?.data || error);
  }
}

// Start server
app.listen(process.env.PORT, () => {
  console.log(`Webhook running on port ${process.env.PORT}`);
});

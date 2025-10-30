import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import { supabase } from "./services/supabaseClient.js";

// Import your route modules
import campaignRoutes from "./src/routes/campaignRoutes.js";
import referenceRoutes from "./src/routes/referenceRoutes.js";

dotenv.config();

const app = express();

// ===== Middleware =====
app.use(bodyParser.json());
app.use(express.json());
app.use(
  cors({
    origin: "http://localhost:3001",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

// ===== Environment Variables =====
const PORT = process.env.PORT || 3000;
const token = process.env.WHATSAPP_TOKEN;
const phoneNumberId = process.env.PHONE_NUMBER_ID;

// ===== Your Campaign API Routes =====
app.use("/api/campaign", campaignRoutes);
app.use("/api/reference", referenceRoutes);

// Root endpoint
app.get("/", (req, res) => {
  res.send("🚀 Campaign API & WhatsApp Webhook are running...");
});

// ===== WhatsApp Webhook Verification (Meta) =====
app.get("/webhook", (req, res) => {
  const verify_token = "your_verify_token"; // change this to match your Meta App setting
  const mode = req.query["hub.mode"];
  const challenge = req.query["hub.challenge"];
  const token = req.query["hub.verify_token"];

  if (mode && token === verify_token) {
    console.log("✅ Webhook verified successfully");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ===== WhatsApp Message Handler =====
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

      console.log("📩 Received message:", text);

      // 1️⃣ Save incoming message
      const { error: insertError } = await supabase.from("message").insert([
        {
          message_content: text,
          senderid: from,
          timestamp: new Date().toISOString(),
          message_status: "received",
        },
      ]);
      if (insertError) console.error("Supabase insert error:", insertError);

      // 2️⃣ If user sends "join"
      if (text === "join") {
        const replyText =
          "✅ You have successfully joined the campaign. Please wait for further updates.";
        await sendWhatsAppMessage(from, replyText);
        await logMessage(from, replyText, "sent");
        return res.sendStatus(200);
      }

      // 3️⃣ Check if matches a campaign keyword
      const { data: keywordMatch } = await supabase
        .from("keyword")
        .select("campaignid, value")
        .eq("value", text)
        .maybeSingle();

      let replyText = "";

      if (keywordMatch) {
        // 4️⃣ Fetch campaign details
        const { data: campaignData, error: campaignError } = await supabase
          .from("campaign")
          .select("campaignname, objective")
          .eq("campaignid", keywordMatch.campaignid)
          .maybeSingle();

        if (campaignError)
          console.error("Error fetching campaign:", campaignError);

        // 5️⃣ Optional: Get API data linked to this campaign
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
            apiResponseText = "⚠️ Unable to fetch live data for this campaign.";
            console.error("API Fetch Error:", err.message);
          }
        }

        // 6️⃣ Build reply message
        if (campaignData) {
          replyText = `📢 Campaign: ${campaignData.campaignname}\n\n🎯 Objective: ${campaignData.objective}\n\n📡 Live Data (if any):\n${apiResponseText}\n\nReply 'JOIN' to participate or 'MENU' to see more campaigns.`;
        } else {
          replyText = `Campaign (ID: ${keywordMatch.campaignid}) found, but no details available.`;
        }
      } else {
        replyText =
          "❓ Sorry, I didn’t recognize that keyword. Try another campaign keyword or type 'MENU'.";
      }

      // 7️⃣ Log and send reply
      await logMessage(from, replyText, "sent");
      await sendWhatsAppMessage(from, replyText);
      console.log("✅ Reply sent to:", from);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("❌ Error in webhook handler:", error);
    res.sendStatus(500);
  }
});

// ===== Helper: Log outgoing message to Supabase =====
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

// ===== Helper: Send WhatsApp Message via Meta API =====
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

// ===== Global Error Handler =====
app.use((err, req, res, next) => {
  console.error("Global error:", err.stack);
  res.status(500).json({ message: "Server Error", error: err.message });
});

// ===== Start the Server =====
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
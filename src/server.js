import express from "express";
import helmet from "helmet";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import axios from "axios";
import { supabase } from "../services/supabaseClient.js";


// --- Routes ---
import campaignRoutes from "./routes/campaignRoutes.js";
import referenceRoutes from "./routes/referenceRoutes.js";
import webhookRoutes from "./routes/webhookRoutes.js";

// --- Middlewares ---
import verifyWebhook from "./middleware/verifyWebhook.js";
import errorHandler from "./middleware/errorHandler.js";

// --- Config & Logger ---
import config from "./config/index.js";
import { log, error } from "./utils/logger.js";

dotenv.config();

const app = express();

// --- Security & Middleware ---
app.use(helmet());
app.use(
  cors({
    origin: "http://localhost:3001",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);
app.use(bodyParser.json());
app.use(express.json());

// --- Health Check ---
app.get("/health", (req, res) => res.json({ status: "ok" }));

// --- Environment Variables ---
const PORT = config.server.port || process.env.PORT || 3000;
const token = process.env.WHATSAPP_TOKEN;
const phoneNumberId = process.env.PHONE_NUMBER_ID;

// --- Campaign & Reference APIs ---
app.use("/api/campaign", campaignRoutes);
app.use("/api/reference", referenceRoutes);

// --- WhatsApp Webhook Verification & Handling ---
app.use("/webhook", verifyWebhook, webhookRoutes);

// --- Root Endpoint ---
app.get("/", (req, res) => {
  res.send("🚀 Campaign API & WhatsApp Webhook are running...");
});

// --- WhatsApp Message Handler ---
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

      // 2️⃣ Handle keyword logic
      if (text === "join") {
        const replyText =
          "✅ You have successfully joined the campaign. Please wait for further updates.";
        await sendWhatsAppMessage(from, replyText);
        await logMessage(from, replyText, "sent");
        return res.sendStatus(200);
      }

      const { data: keywordMatch } = await supabase
        .from("keyword")
        .select("campaignid, value")
        .eq("value", text)
        .maybeSingle();

      let replyText = "";

      if (keywordMatch) {
        const { data: campaignData, error: campaignError } = await supabase
          .from("campaign")
          .select("campaignname, objective")
          .eq("campaignid", keywordMatch.campaignid)
          .maybeSingle();

        if (campaignError)
          console.error("Error fetching campaign:", campaignError);

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

        if (campaignData) {
          replyText = `📢 Campaign: ${campaignData.campaignname}\n\n🎯 Objective: ${campaignData.objective}\n\n📡 Live Data (if any):\n${apiResponseText}\n\nReply 'JOIN' to participate or 'MENU' to see more campaigns.`;
        } else {
          replyText = `Campaign (ID: ${keywordMatch.campaignid}) found, but no details available.`;
        }
      } else {
        replyText =
          "❓ Sorry, I didn’t recognize that keyword. Try another campaign keyword or type 'MENU'.";
      }

      await logMessage(from, replyText, "sent");
      await sendWhatsAppMessage(from, replyText);
      console.log("✅ Reply sent to:", from);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Webhook handler error:", err);
    res.sendStatus(500);
  }
});

// --- Helper: Log outgoing message ---
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

// --- Helper: Send WhatsApp Message via Meta API ---
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
  } catch (err) {
    console.error("WhatsApp send error:", err.response?.data || err);
  }
}

// --- Global Error Handler ---
app.use(errorHandler);

// --- Unhandled Errors ---
process.on("unhandledRejection", (reason) => {
  error("Unhandled Rejection:", reason);
});
process.on("uncaughtException", (err) => {
  error("Uncaught Exception:", err);
});

// --- Start Server ---
app.listen(PORT, () => {
  log(`✅ Server running on port ${PORT}`);
});

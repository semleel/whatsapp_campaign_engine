import express from "express";
import helmet from "helmet";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import cron from "node-cron";

// --- Routes ---
import campaignRoutes from "./routes/campaignRoutes.js";
import referenceRoutes from "./routes/referenceRoutes.js";
import campaignScheduleRoutes, { autoCheckCampaignStatuses } from "./routes/campaignScheduleRoutes.js";
import webhookRoutes from "./routes/webhookRoutes.js";
import whatsappRoutes from "./routes/whatsappRoutes.js";
import templateRoutes from "./routes/templateRoutes.js";
import integrationRoutes from "./routes/integrationRoutes.js";

// --- Middleware ---
import errorHandler from "./middleware/errorHandler.js";

// --- Config & Logger ---
import config from "./config/index.js";
import { log, error } from "./utils/logger.js";

dotenv.config();

// --- Initialize Express ---
const app = express();

// --- Security & Middleware ---
app.use(helmet());
app.use(
  cors({
    origin: "http://localhost:3001", // frontend origin
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

// --- API Routes ---
app.use("/api/campaign", campaignRoutes);
app.use("/api/campaignschedule", campaignScheduleRoutes);
app.use("/api/reference", referenceRoutes);
app.use("/api/wa", whatsappRoutes);
app.use("/api/template", templateRoutes);
app.use("/api/integration", integrationRoutes);

// --- WhatsApp Webhook Verification & Handling ---
app.use("/webhook", webhookRoutes);

// --- Root Endpoint ---
app.get("/", (req, res) => {
  res.send("🚀 Campaign API & WhatsApp Webhook are running...");
});

// --- Automatic Schedule Status Checker (runs every minute) ---
cron.schedule("* * * * *", async () => {
  log("⏰ [CRON] Checking campaign statuses...");
  await autoCheckCampaignStatuses();
});

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

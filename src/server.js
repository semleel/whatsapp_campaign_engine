import express from "express";
import helmet from "helmet";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";

// --- Routes ---
import apiRoutes from "./routes/index.js";
import webhookRoutes from "./routes/webhookRoutes.js";
import { startCampaignStatusJob } from "./jobs/campaignStatusJob.js";

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
app.use("/api", apiRoutes);

// --- WhatsApp Webhook Verification & Handling ---
app.use("/webhook", webhookRoutes);

// --- Root Endpoint ---
app.get("/", (req, res) => {
  res.send("🚀 Campaign API & WhatsApp Webhook are running...");
});

// --- Automatic Schedule Status Checker (runs every minute) ---
startCampaignStatusJob();

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

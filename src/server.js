import express from "express";
import helmet from "helmet";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";

// --- Routes ---
import apiRoutes from "./routes/index.js";
import webhookRoutes from "./routes/webhookRoutes.js";
import { startJobs } from "./jobs/index.js";
import systemCommandRoutes from "./routes/systemCommandRoutes.js";

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

// Allow localhost and LAN origins by default; override with CORS_ORIGINS (comma-separated)
const allowedOrigins =
  (process.env.CORS_ORIGINS || "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001,http://192.168.100.60:3001")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    // Allow PATCH so admins can toggle flow status from the UI
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
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
// Register independent routes first
app.use("/api/system/commands", systemCommandRoutes);

// Then mount the grouped /api routes
app.use("/api", apiRoutes);

// --- WhatsApp Webhook Verification & Handling ---
app.use("/webhook", webhookRoutes);

// --- Root Endpoint ---
app.get("/", (req, res) => {
  res.send("🚀 Campaign API & WhatsApp Webhook are running...");
});

// --- Automatic Schedule Status Checker (runs every minute) ---
startJobs();

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

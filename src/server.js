import express from "express";
import helmet from "helmet";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";

// --- Routes ---
import apiRoutes from "./routes/index.js";
import webhookRoutes from "./routes/webhookRoutes.js";
import { startJobs } from "./jobs/index.js";
import tagRoutes from "./routes/tagRoutes.js";

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
  (process.env.CORS_ORIGINS || "http://localhost:3001,http://127.0.0.1:3001")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const lanOrigin = /^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1]))/.test(origin);
      if (allowedOrigins.includes(origin) || lanOrigin) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"), false);
    },
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
// Register independent routes first
app.use("/api/tags", tagRoutes);

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

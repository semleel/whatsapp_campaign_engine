import express from "express";
import helmet from "helmet";
import cors from "cors";
import bodyParser from "body-parser";
import webhookRoutes from "./routes/webhookRoutes.js";
import verifyWebhook from "./middleware/verifyWebhook.js";
import errorHandler from "./middleware/errorHandler.js";
import config from "./config/index.js";
import { log, error } from "./utils/logger.js";

const app = express();

// --- Security & Middleware ---
app.use(helmet());
app.use(cors());
app.use(bodyParser.json()); // or app.use(express.json())

// --- Health Check Endpoint ---
app.get("/health", (req, res) => res.json({ status: "ok" }));

// --- WhatsApp Webhook Routes ---
// Apply verification middleware before webhookRoutes
app.use("/webhook", verifyWebhook, webhookRoutes);

// --- Global Error Handler ---
app.use(errorHandler);

process.on("unhandledRejection", (reason, p) => {
  error("Unhandled Rejection:", reason);
});

process.on("uncaughtException", (err) => {
  error("Uncaught Exception:", err);
});

// --- Start Server ---
const port = config.server.port || 3000;
app.listen(port, () => {
  log(`Backend server running on port ${port}`);
});
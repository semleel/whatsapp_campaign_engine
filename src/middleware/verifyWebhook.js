import config from "../config/index.js";
import { log, warn } from "../utils/logger.js";

export default function verifyWebhook(req, res, next) {
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode && token) {
      if (mode === "subscribe" && token === config.webhookVerifyToken) {
        log("Webhook verified successfully");
        return res.status(200).send(challenge);
      } else {
        warn("Webhook verification failed");
        return res.sendStatus(403);
      }
    }
  }

  next(); // move to next middleware (for POST requests)
}

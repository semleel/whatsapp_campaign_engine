import { error } from "../utils/logger.js";

export default function errorHandler(err, req, res, next) {
  error(
    `Error on ${req.method} ${req.originalUrl}:`,
    err.stack || err.message || err
  );
  res.status(500).json({ error: "Internal Server Error" });
}

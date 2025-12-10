// src/utils/logger.js
import winston from "winston";
import path from "path";
import fs from "fs";

// Ensure logs directory exists
const logDir = "logs";
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    return `[${timestamp}] ${level.toUpperCase()}: ${stack || message}`;
  })
);

// Create logger WITHOUT rotation
const logger = winston.createLogger({
  level: "info",
  format: logFormat,
  transports: [
    // Console output
    new winston.transports.Console({ handleExceptions: true }),

    // Append-only general app log
    new winston.transports.File({
      filename: path.join(logDir, "app.log"),
      level: "info"
    }),

    // Append-only error log
    new winston.transports.File({
      filename: path.join(logDir, "error.log"),
      level: "error"
    })
  ],
  exitOnError: false
});

// Export helper functions
export const log = (...args) => logger.info(args.join(" "));
export const warn = (...args) => logger.warn(args.join(" "));
export const error = (...args) => logger.error(args.join(" "));

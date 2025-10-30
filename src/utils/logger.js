// src/utils/logger.js
import winston from "winston";
import path from "path";
import fs from "fs";
import DailyRotateFile from "winston-daily-rotate-file";

// Ensure logs directory exists
const logDir = "logs";
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    return `[${timestamp}] ${level.toUpperCase()}: ${stack || message}`;
  })
);

// Create logger with rotation
const logger = winston.createLogger({
  level: "info",
  format: logFormat,
  transports: [
    new winston.transports.Console({ handleExceptions: true }),
    new DailyRotateFile({
      filename: path.join(logDir, "%DATE%-app.log"),
      datePattern: "YYYY-MM-DD",
      maxSize: "20m",
      maxFiles: "14d", // keep 14 days
      level: "info"
    }),
    new DailyRotateFile({
      filename: path.join(logDir, "%DATE%-error.log"),
      datePattern: "YYYY-MM-DD",
      maxSize: "10m",
      maxFiles: "14d",
      level: "error"
    })
  ],
  exitOnError: false
});

export const log = (...args) => logger.info(args.join(" "));
export const warn = (...args) => logger.warn(args.join(" "));
export const error = (...args) => logger.error(args.join(" "));

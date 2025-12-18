// src/fake-api/routes/time-slots.js

import express from "express";
import fs from "fs";
import path from "path";

const router = express.Router();

const timeSlotsFile = path.join(
  process.cwd(),
  "src",
  "fake-api",
  "data",
  "time-slots.json"
);

const timeSlots = JSON.parse(fs.readFileSync(timeSlotsFile, "utf-8"));

router.get("/", (_req, res) => {
  res.json({
    success: true,
    time_slots: timeSlots,
  });
});

export default router;

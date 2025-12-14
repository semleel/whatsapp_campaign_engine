// src/fake-api/routes/bookings.js

import express from "express";
import fs from "fs";
import path from "path";

const router = express.Router();

const facilitiesFile = path.join(
    process.cwd(),
    "src",
    "fake-api",
    "data",
    "facilities.json"
);

const facilities = JSON.parse(fs.readFileSync(facilitiesFile, "utf-8"));

const timeSlots = [
    "09:00 - 10:00",
    "10:00 - 11:00",
    "11:00 - 12:00",
    "12:00 - 13:00",
    "13:00 - 14:00",
    "14:00 - 15:00",
    "15:00 - 16:00",
    "16:00 - 17:00",
    "17:00 - 18:00",
    "18:00 - 19:00",
];

router.get("/options", (_req, res) => {
    res.json({
        success: true,
        facilities,
        time_slots: timeSlots,
    });
});

export default router;

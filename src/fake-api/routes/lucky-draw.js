// src/fake-api/routes/lucky-draw.js

import express from "express";
import fs from "fs";
import path from "path";

const router = express.Router();

const dataFile = path.join(
    process.cwd(),
    "src",
    "fake-api",
    "data",
    "lucky-draw.json"
);

function readEntries() {
    if (!fs.existsSync(dataFile)) return [];
    return JSON.parse(fs.readFileSync(dataFile, "utf-8"));
}

function saveEntries(entries) {
    fs.writeFileSync(dataFile, JSON.stringify(entries, null, 2));
}

router.post("/", (req, res) => {
    const { full_name, email } = req.body || {};

    if (!full_name || typeof full_name !== "string") {
        return res.status(400).json({
            success: false,
            message: "Full name is required.",
        });
    }

    if (!email || typeof email !== "string" || !email.includes("@")) {
        return res.status(400).json({
            success: false,
            message: "Valid email is required.",
        });
    }

    const entries = readEntries();

    const luckyNumber = Math.floor(100000 + Math.random() * 900000);

    const record = {
        full_name,
        email,
        lucky_draw_number: luckyNumber,
        created_at: new Date().toISOString(),
    };

    entries.push(record);
    saveEntries(entries);

    return res.json({
        success: true,
        ...record,
        message: `🎉 Congratulations ${full_name}! Your lucky draw number is ${luckyNumber}.`,
    });
});

export default router;

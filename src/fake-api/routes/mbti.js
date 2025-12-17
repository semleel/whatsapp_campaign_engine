// src/fake-api/routes/mbti.js

import express from "express";
import fs from "fs";
import path from "path";

const router = express.Router();

const mbtiFile = path.join(process.cwd(), "src", "fake-api", "data", "mbti.json");
const mbtiData = JSON.parse(fs.readFileSync(mbtiFile, "utf-8"));

router.get("/", (req, res) => {
    const type = req.query.type?.toUpperCase();

    if (!type || !mbtiData[type]) {
        return res.status(400).json({
            success: false,
            message: "Invalid or missing MBTI type. Example: /fake/mbti?type=INTJ",
            available_types: Object.keys(mbtiData)
        });
    }

    return res.json({
        success: true,
        mbti: type,
        details: mbtiData[type]
    });
});

export default router;

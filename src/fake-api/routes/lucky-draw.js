// src/fake-api/routes/lucky-draw.js

import express from "express";

const router = express.Router();

/**
 * POST /lucky-draw
 * Body:
 * {
 *   "full_name": "John Doe",
 *   "email": "john@example.com"
 * }
 */
router.post("/", (req, res) => {
    const { full_name, email } = req.body || {};

    // Basic validation (simple & realistic)
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

    // Generate lucky draw number
    const luckyNumber = Math.floor(100000 + Math.random() * 900000);

    return res.json({
        success: true,
        full_name,
        email,
        lucky_draw_number: luckyNumber,
        message: `🎉 Congratulations ${full_name}! Your lucky draw number is ${luckyNumber}.`,
    });
});

export default router;

// src/fake-api/routes/bookings.js

import express from "express";
import fs from "fs";
import path from "path";

const router = express.Router();

const students = JSON.parse(
    fs.readFileSync(
        path.join(process.cwd(), "src", "fake-api", "data", "students.json"),
        "utf-8"
    )
);

router.post("/", (req, res) => {
    const { student_id, facility, time_slot } = req.body || {};

    if (!student_id || !facility || !time_slot) {
        return res.status(400).json({
            success: false,
            message: "Missing booking fields",
        });
    }

    const studentName = students[student_id];
    if (!studentName) {
        return res.status(400).json({
            success: false,
            message: "Invalid student ID",
        });
    }

    const bookingId = `BK-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    res.json({
        success: true,
        booking: {
            booking_id: bookingId,
            student_id,
            name: studentName,
            facility,
            time_slot,
            status: "CONFIRMED",
        },
    });
});

export default router;

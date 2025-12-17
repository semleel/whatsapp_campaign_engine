// src/fake-api/routes/bookings.js

import express from "express";
import fs from "fs";
import path from "path";

const router = express.Router();

const dataDir = path.join(process.cwd(), "src", "fake-api", "data");

const bookingsFile = path.join(dataDir, "bookings.json");
const studentsFile = path.join(dataDir, "students.json");

// Ensure bookings.json exists
if (!fs.existsSync(bookingsFile)) {
    fs.writeFileSync(bookingsFile, JSON.stringify([], null, 2));
}

// Load students once (static data)
const students = JSON.parse(fs.readFileSync(studentsFile, "utf-8"));

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

    const newBooking = {
        booking_id: bookingId,
        student_id,
        name: studentName,
        facility,
        time_slot,
        status: "CONFIRMED",
        created_at: new Date().toISOString(),
    };

    // Read → push → write (per request)
    const bookings = JSON.parse(fs.readFileSync(bookingsFile, "utf-8"));
    bookings.push(newBooking);
    fs.writeFileSync(bookingsFile, JSON.stringify(bookings, null, 2));

    return res.json({
        success: true,
        booking: newBooking,
    });
});

export default router;

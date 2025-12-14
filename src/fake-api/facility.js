import express from "express";
import fs from "fs";
import path from "path";

const router = express.Router();

const studentsFile = path.join(process.cwd(), "src", "fake-api", "data", "students.json");
const facilitiesFile = path.join(process.cwd(), "src", "fake-api", "data", "facilities.json");

const students = JSON.parse(fs.readFileSync(studentsFile, "utf-8"));
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
    "18:00 - 19:00"
];


// --------------------------------------------------
// GET: Validate Student
// --------------------------------------------------
router.get("/students/:id", (req, res) => {
    const studentId = req.params.id;
    const name = students[studentId];

    if (!name) {
        return res.status(404).json({
            success: false,
            message: "Student ID not found"
        });
    }

    return res.json({
        success: true,
        student_id: studentId,
        name
    });
});


// --------------------------------------------------
// GET: Facility Options (for WhatsApp list)
// --------------------------------------------------
router.get("/options", (req, res) => {
    return res.json({
        success: true,
        facilities,
        time_slots: timeSlots
    });
});


// --------------------------------------------------
// POST: Submit Booking
// --------------------------------------------------
router.post("/book", (req, res) => {
    const { student_id, facility, time_slot } = req.body || {};

    if (!student_id || !facility || !time_slot) {
        return res.status(400).json({
            success: false,
            message: "Missing booking fields"
        });
    }

    const studentName = students[student_id];
    if (!studentName) {
        return res.status(400).json({
            success: false,
            message: "Invalid student ID"
        });
    }

    const bookingId = `BK-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    return res.json({
        success: true,
        booking: {
            booking_id: bookingId,
            student_id,
            name: studentName,
            facility,
            time_slot,
            status: "CONFIRMED"
        }
    });
});

export default router;

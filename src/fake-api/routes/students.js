// src/fake-api/routes/students.js

import express from "express";
import fs from "fs";
import path from "path";

const router = express.Router();

const studentsFile = path.join(
    process.cwd(),
    "src",
    "fake-api",
    "data",
    "students.json"
);

const students = JSON.parse(fs.readFileSync(studentsFile, "utf-8"));

router.get("/:id", (req, res) => {
    const studentId = req.params.id;
    const name = students[studentId];

    if (!name) {
        return res.status(404).json({
            success: false,
            message: "Student ID not found",
        });
    }

    return res.json({
        success: true,
        student_id: studentId,
        name,
    });
});

export default router;

// src/fake-api/routes/index.js

import express from "express";

import studentRoutes from "./students.js";
import facilityRoutes from "./facilities.js";
import bookingRoutes from "./bookings.js";
import mbtiRoutes from "./mbti.js";

const router = express.Router();

router.use("/students", studentRoutes);
router.use("/facilities", facilityRoutes);
router.use("/bookings", bookingRoutes);
router.use("/mbti", mbtiRoutes);

export default router;

// src/fake-api/routes/index.js

import express from "express";

import studentRoutes from "./students.js";
import facilityRoutes from "./facilities.js";
import timeSlotsRoute from "./time-slots.js";
import bookingRoutes from "./bookings.js";
import mbtiRoutes from "./mbti.js";
import luckyDrawRoute from "./lucky-draw.js";

const router = express.Router();

router.use("/students", studentRoutes);
router.use("/facilities", facilityRoutes);
router.use("/time-slots", timeSlotsRoute);
router.use("/bookings", bookingRoutes);
router.use("/mbti", mbtiRoutes);
router.use("/lucky-draw", luckyDrawRoute);

export default router;

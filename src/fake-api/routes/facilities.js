// src/fake-api/routes/facilities.js

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

router.get("/", (_req, res) => {
    res.json({
        success: true,
        facilities,
    });
});

export default router;

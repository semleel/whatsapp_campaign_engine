import express from "express";
import prisma from "../config/prismaClient.js";

const router = express.Router();

router.get("/prisma-test", async (_req, res, next) => {
  try {
    const rows = await prisma.campaign.findMany({ take: 1 });
    res.json({ ok: true, rows });
  } catch (e) {
    next(e);
  }
});

export default router;

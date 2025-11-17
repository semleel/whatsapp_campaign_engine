import cron from "node-cron";
import prisma from "../config/prismaClient.js";
import { log } from "../utils/logger.js";

export function startSessionExpiryJob() {
    cron.schedule("*/10 * * * *", async () => {
        log("[CRON] Checking expired sessions...");

        const EXPIRY_MS = 2 * 60 * 60 * 1000;
        const cutoff = new Date(Date.now() - EXPIRY_MS);

        await prisma.campaignsession.updateMany({
            where: {
                sessionstatus: "ACTIVE",
                lastactiveat: { lt: cutoff },
            },
            data: { sessionstatus: "EXPIRED" },
        });
    });

    log("[CRON] Session auto-expiry job initialized (every 10 min)");
}

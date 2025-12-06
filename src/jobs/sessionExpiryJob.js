import cron from "node-cron";
import { prisma } from "../config/prismaClient.js";
import { log } from "../utils/logger.js";
import { SESSION_EXPIRY_MINUTES } from "../config/index.js";

const SESSION_STATUS = {
    ACTIVE: "ACTIVE",
    EXPIRED: "EXPIRED",
};

export function startSessionExpiryJob() {
    cron.schedule("*/10 * * * *", async () => {
        log("[CRON] Checking expired sessions...");

        const now = new Date();
        const cutoff = new Date(now.getTime() - SESSION_EXPIRY_MINUTES * 60 * 1000);

        await prisma.campaign_session.updateMany({
            where: {
                session_status: SESSION_STATUS.ACTIVE,
                OR: [
                    { last_active_at: { lt: cutoff } },
                    {
                        last_active_at: null,
                        created_at: { lt: cutoff },
                    },
                ],
            },
            data: { session_status: SESSION_STATUS.EXPIRED },
        });
    });

    log("[CRON] Session auto-expiry job initialized (every 10 min)");
}

import cron from "node-cron";
import { prisma } from "../config/prismaClient.js";
import { log } from "../utils/logger.js";
import { SESSION_STATUS } from "../services/flowEngine.js";
import { SESSION_EXPIRY_MINUTES } from "../config/index.js";

export function startSessionExpiryJob() {
    cron.schedule("*/10 * * * *", async () => {
        log("[CRON] Checking expired sessions...");

        const now = new Date();
        const cutoff = new Date(now.getTime() - SESSION_EXPIRY_MINUTES * 60 * 1000);

        await prisma.campaignsession.updateMany({
            where: {
                sessionstatus: SESSION_STATUS.ACTIVE,
                OR: [
                    { lastactiveat: { lt: cutoff } },
                    {
                        lastactiveat: null,
                        createdat: { lt: cutoff },
                    },
                ],
            },
            data: { sessionstatus: SESSION_STATUS.EXPIRED },
        });
    });

    log("[CRON] Session auto-expiry job initialized (every 10 min)");
}

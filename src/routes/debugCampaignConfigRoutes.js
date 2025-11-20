// src/routes/debugCampaignConfigRoutes.js
import express from "express";
import prisma from "../config/prismaClient.js";

const router = express.Router();

/**
 * GET /api/debug/campaign-config
 * Lists campaigns and whether they are launchable vs misconfigured.
 */
router.get("/campaign-config", async (req, res) => {
    try {
        const campaigns = await prisma.campaign.findMany({
            select: {
                campaignid: true,
                campaignname: true,
                status: true,
                contentkeyid: true,
                keyword: {
                    select: { keywordid: true },
                },
                keymapping: {
                    select: {
                        contentkeyid: true,
                        content: {
                            select: {
                                contentid: true,
                                title: true,
                                status: true,
                                isdeleted: true,
                            },
                        },
                    },
                },
            },
            orderBy: { campaignid: "asc" },
        });

        const result = campaigns.map((c) => {
            const hasKeyword = (c.keyword || []).length > 0;
            const hasEntryKey = !!c.contentkeyid;
            const hasEntryContent =
                !!c.keymapping?.content && !c.keymapping.content.isdeleted;

            const issues = [];

            if (!hasKeyword) {
                issues.push("No keyword configured");
            }
            if (!hasEntryKey) {
                issues.push("Missing campaign.contentkeyid");
            }
            if (hasEntryKey && !hasEntryContent) {
                issues.push("No entry content for campaign.contentkeyid");
            }

            return {
                campaignid: c.campaignid,
                campaignname: c.campaignname,
                status: c.status,
                hasKeyword,
                hasEntryKey,
                hasEntryContent,
                entryContentKey: c.contentkeyid,
                entryContentTitle: c.keymapping?.content?.title ?? null,
                issues,
            };
        });

        return res.json(result);
    } catch (err) {
        console.error("Error in /api/debug/campaign-config:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

export default router;

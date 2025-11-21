// src/controllers/debugCampaignController.js

// Controller to provide debug info about campaign configurations
// Move debug endpoint out of webhook controller.
import prisma from "../config/prismaClient.js";
import { error } from "../utils/logger.js";

export async function debugCampaignConfig(req, res) {
    try {
        const campaigns = await prisma.campaign.findMany({
            select: {
                campaignid: true,
                campaignname: true,
                status: true,
                contentkeyid: true,
                userflowid: true,
                keyword: {
                    select: { value: true },
                },
                keymapping: {
                    select: {
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
            const content = c.keymapping?.content || null;
            const issues = [];

            if (!c.keyword || c.keyword.length === 0) {
                issues.push("MISSING_KEYWORD");
            }
            if (!c.contentkeyid) {
                issues.push("MISSING_ENTRY_KEY");
            }
            if (!content) {
                issues.push("MISSING_ENTRY_CONTENT");
            }
            if (content?.isdeleted) {
                issues.push("ENTRY_CONTENT_DELETED");
            }

            const contentStatus = (content?.status || "").toLowerCase();
            if (contentStatus === "draft") {
                issues.push("ENTRY_CONTENT_DRAFT");
            }

            const isLaunchable =
                c.status === "Active" &&
                !issues.includes("MISSING_KEYWORD") &&
                !issues.includes("MISSING_ENTRY_KEY") &&
                !issues.includes("MISSING_ENTRY_CONTENT") &&
                !issues.includes("ENTRY_CONTENT_DELETED");

            return {
                id: c.campaignid,
                name: c.campaignname,
                status: c.status,
                userflowid: c.userflowid,
                contentkeyid: c.contentkeyid,
                keywords: c.keyword.map((k) => k.value),
                entryContent: content
                    ? {
                        contentid: content.contentid,
                        title: content.title,
                        status: content.status,
                        isdeleted: content.isdeleted,
                    }
                    : null,
                launchable: isLaunchable,
                issues,
            };
        });

        const summary = {
            total: result.length,
            active: result.filter((c) => c.status === "Active").length,
            launchable: result.filter((c) => c.launchable).length,
            misconfigured: result.filter((c) => !c.launchable).length,
        };

        return res.status(200).json({ summary, campaigns: result });
    } catch (err) {
        error("debugCampaignConfig error:", err);
        return res
            .status(500)
            .json({ error: "Failed to load campaign config for debug" });
    }
}

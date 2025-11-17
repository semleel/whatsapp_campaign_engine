import prisma from "../config/prismaClient.js";

// Helper to parse integer safely
const parseIntSafe = (value) => {
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
};

/**
 * GET /api/keyword/by-campaign/:campaignId
 * Return all keywords belonging to a specific campaign.
 */
export async function listKeywordsByCampaign(req, res) {
    try {
        const campaignId = parseIntSafe(req.params.campaignId);
        if (!campaignId) {
            return res.status(400).json({ error: "Invalid campaign id" });
        }

        const keywords = await prisma.keyword.findMany({
            where: { campaignid: campaignId },
            orderBy: { keywordid: "desc" },
            select: {
                keywordid: true,
                value: true,
                campaignid: true,
            },
        });

        return res.status(200).json(keywords);
    } catch (err) {
        console.error("List keywords by campaign error:", err);
        return res.status(500).json({ error: err.message });
    }
}

/**
 * GET /api/keyword/list
 * (Optional) Global list of all keywords across campaigns.
 */
export async function listAllKeywords(_req, res) {
    try {
        const keywords = await prisma.keyword.findMany({
            orderBy: { keywordid: "desc" },
            select: {
                keywordid: true,
                value: true,
                campaignid: true,
                campaign: { select: { campaignname: true } },
            },
        });

        const formatted = keywords.map((k) => ({
            keywordid: k.keywordid,
            value: k.value,
            campaignid: k.campaignid,
            campaignname: k.campaign?.campaignname ?? "Unknown",
        }));

        return res.status(200).json(formatted);
    } catch (err) {
        console.error("List all keywords error:", err);
        return res.status(500).json({ error: err.message });
    }
}

/**
 * POST /api/keyword/create
 * body: { value: string, campaignid: number }
 */
export async function createKeyword(req, res) {
    try {
        let { value, campaignid } = req.body;

        if (!value || typeof value !== "string") {
            return res.status(400).json({ error: "Keyword value is required" });
        }

        const parsedCampaignId = parseInt(campaignid, 10);
        if (!parsedCampaignId || Number.isNaN(parsedCampaignId)) {
            return res.status(400).json({ error: "Valid campaignid is required" });
        }

        // Normalize keyword (lowercase, trimmed)
        value = value.trim().toLowerCase();
        if (!value) {
            return res.status(400).json({ error: "Keyword cannot be empty" });
        }

        // Ensure campaign exists
        const campaign = await prisma.campaign.findUnique({
            where: { campaignid: parsedCampaignId },
        });
        if (!campaign) {
            return res.status(404).json({ error: "Campaign not found" });
        }

        // 🔴 NEW: check global uniqueness (any campaign)
        const existing = await prisma.keyword.findFirst({
            where: { value }, // no campaignid filter → global
            select: { keywordid: true, campaignid: true },
        });

        if (existing) {
            if (existing.campaignid === parsedCampaignId) {
                // Same campaign, same keyword
                return res
                    .status(409)
                    .json({ error: "Keyword already exists for this campaign" });
            } else {
                // Different campaign already owns this keyword
                return res.status(409).json({
                    error: "Keyword is already mapped to another campaign",
                });
            }
        }

        const keyword = await prisma.keyword.create({
            data: {
                value,
                campaignid: parsedCampaignId,
            },
        });

        return res
            .status(201)
            .json({ message: "Keyword created successfully!", keyword });
    } catch (err) {
        console.error("Create keyword error:", err);
        return res.status(500).json({ error: err.message });
    }
}

/**
 * DELETE /api/keyword/:id
 */
export async function deleteKeyword(req, res) {
    try {
        const keywordId = parseIntSafe(req.params.id);
        if (!keywordId) {
            return res.status(400).json({ error: "Invalid keyword id" });
        }

        await prisma.keyword.delete({
            where: { keywordid: keywordId },
        });

        return res.status(200).json({ message: "Keyword deleted successfully!" });
    } catch (err) {
        console.error("Delete keyword error:", err);
        if (err.code === "P2025") {
            return res.status(404).json({ error: "Keyword not found" });
        }
        return res.status(500).json({ error: err.message });
    }
}

/**
 * GET /api/keyword/check?value=promo
 * Check if a keyword is already used globally.
 */
export async function checkKeywordAvailability(req, res) {
    try {
        let { value } = req.query;

        if (!value || typeof value !== "string") {
            return res.status(400).json({ error: "Keyword value is required" });
        }

        value = value.trim().toLowerCase();
        if (!value) {
            return res.status(400).json({ error: "Keyword cannot be empty" });
        }

        const existing = await prisma.keyword.findFirst({
            where: { value },
            select: {
                keywordid: true,
                campaignid: true,
                campaign: { select: { campaignname: true } },
            },
        });

        if (!existing) {
            return res.status(200).json({ available: true });
        }

        return res.status(409).json({
            available: false,
            error: "Keyword is already mapped to another campaign",
            keywordid: existing.keywordid,
            campaignid: existing.campaignid,
            campaignname: existing.campaign?.campaignname ?? null,
        });
    } catch (err) {
        console.error("Check keyword availability error:", err);
        return res.status(500).json({ error: err.message });
    }
}
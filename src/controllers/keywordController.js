import { prisma } from "../config/prismaClient.js";

const normalizeKeyword = (value) => (value || "").trim().toLowerCase();

const mapKeywordRow = (row) => ({
  keywordid: row.keyword_id,
  value: row.value,
  campaignid: row.campaign_id,
  campaignname: row.campaign?.campaign_name || null,
  campaignstatus: row.campaign?.status || null,
});

export async function listAllKeywords(req, res) {
  try {
    const rows = await prisma.campaign_keyword.findMany({
      include: { campaign: true },
      orderBy: { keyword_id: "desc" },
    });

    return res.json(rows.map(mapKeywordRow));
  } catch (err) {
    console.error("Error listing keywords:", err);
    return res.status(500).json({ error: "Failed to list keywords" });
  }
}

export async function listKeywordsByCampaign(req, res) {
  const campaignId = Number(req.params.campaignId);
  if (!campaignId || Number.isNaN(campaignId)) {
    return res.status(400).json({ error: "campaignId is required" });
  }

  try {
    const rows = await prisma.campaign_keyword.findMany({
      where: { campaign_id: campaignId },
      orderBy: { keyword_id: "desc" },
    });

    return res.json(rows.map(mapKeywordRow));
  } catch (err) {
    console.error("Error listing keywords by campaign:", err);
    return res.status(500).json({ error: "Failed to list keywords for campaign" });
  }
}

export async function checkKeywordAvailability(req, res) {
  const rawValue = req.query.value;
  const value = normalizeKeyword(rawValue);

  if (!value) {
    return res.status(400).json({ error: "value is required" });
  }

  try {
    const existing = await prisma.campaign_keyword.findFirst({
      where: { value },
      include: { campaign: true },
    });

    if (!existing) {
      return res.json({ available: true });
    }

    return res.json({
      available: false,
      keywordid: existing.keyword_id,
      campaignid: existing.campaign_id,
      campaignname: existing.campaign?.campaign_name || null,
    });
  } catch (err) {
    console.error("Check keyword availability error:", err);
    return res.status(500).json({ error: "Failed to check keyword availability" });
  }
}

export async function createKeyword(req, res) {
  const { value: rawValue, campaignid } = req.body || {};
  const value = normalizeKeyword(rawValue);
  const campaignId = Number(campaignid);

  if (!value) {
    return res.status(400).json({ error: "Keyword value is required" });
  }
  if (!campaignId || Number.isNaN(campaignId)) {
    return res.status(400).json({ error: "campaignid is required" });
  }

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { campaign_id: campaignId },
    });
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    const existing = await prisma.campaign_keyword.findFirst({
      where: { value },
    });
    if (existing) {
      return res.status(409).json({
        error: "Keyword already in use",
        keywordid: existing.keyword_id,
        campaignid: existing.campaign_id,
      });
    }

    const keyword = await prisma.campaign_keyword.create({
      data: {
        value,
        campaign_id: campaignId,
      },
      include: { campaign: true },
    });

    return res
      .status(201)
      .json({ message: "Keyword created", keyword: mapKeywordRow(keyword) });
  } catch (err) {
    console.error("Create keyword error:", err);
    return res.status(500).json({ error: "Failed to create keyword" });
  }
}

export async function deleteKeyword(req, res) {
  const keywordId = Number(req.params.id);
  if (!keywordId || Number.isNaN(keywordId)) {
    return res.status(400).json({ error: "Keyword id is required" });
  }

  try {
    await prisma.campaign_keyword.delete({
      where: { keyword_id: keywordId },
    });

    return res.json({ message: "Keyword deleted" });
  } catch (err) {
    console.error("Delete keyword error:", err);
    return res.status(500).json({ error: "Failed to delete keyword" });
  }
}

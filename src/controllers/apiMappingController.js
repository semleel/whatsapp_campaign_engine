// src/controllers/apiMappingController.js

import prisma from "../config/prismaClient.js";

export async function listApiMappings(req, res) {
  try {
    const steps = await prisma.campaign_step.findMany({
      where: { action_type: "api" },
      orderBy: [
        { campaign_id: "asc" },
        { step_number: "asc" },
      ],
      select: {
        step_id: true,
        campaign_id: true,
        step_number: true,
        step_code: true,
        api_id: true,
      },
    });

    if (!steps.length) {
      return res.json([]);
    }

    const campaignIds = Array.from(new Set(steps.map((s) => s.campaign_id).filter(Boolean)));
    const apiIds = Array.from(new Set(steps.map((s) => s.api_id).filter(Boolean)));

    const [campaigns, apis] = await Promise.all([
      prisma.campaign.findMany({
        where: { campaignid: { in: campaignIds } },
        select: {
          campaignid: true,
          campaignname: true,
          status: true,
        },
      }),
      prisma.api.findMany({
        where: { api_id: { in: apiIds } },
        select: {
          api_id: true,
          name: true,
        },
      }),
    ]);

    const campaignMap = new Map(campaigns.map((c) => [c.campaignid, c]));
    const apiMap = new Map(apis.map((a) => [a.api_id, a]));

    const payload = steps.map((step) => {
      const campaign = campaignMap.get(step.campaign_id) || null;
      const api = step.api_id ? apiMap.get(step.api_id) || null : null;
      const isActive =
        campaign && campaign.status
          ? ["ACTIVE", "Active"].includes(campaign.status)
          : true;

      return {
        step_id: step.step_id,
        campaignid: step.campaign_id,
        campaignname: campaign?.campaignname || null,
        step_number: step.step_number,
        step_code: step.step_code,
        apiid: step.api_id,
        api_name: api?.name || null,
        is_active: isActive,
      };
    });

    return res.json(payload);
  } catch (err) {
    console.error("[integration:mappings] list error:", err);
    return res.status(500).json({ error: err.message || "Failed to load API mappings" });
  }
}

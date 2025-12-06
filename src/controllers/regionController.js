// src/controllers/regionController.js

import { prisma } from "../config/prismaClient.js";
import { statusListWithIds } from "../constants/campaignStatus.js";

export async function getRegions(_req, res) {
  try {
    const regions =
      (await prisma?.target_region?.findMany?.({
        select: { region_id: true, region_name: true, region_code: true },
        orderBy: { region_name: "asc" },
      })) || [];
    return res.status(200).json(
      regions.map((r) => ({
        regionid: r.region_id,
        regionname: r.region_name,
        regioncode: r.region_code,
      }))
    );
  } catch (err) {
    console.error("Error fetching regions:", err);
    return res.status(500).json({ error: err.message });
  }
}

export async function getUserFlows(_req, res) {
  try {
    // User flows table is not present in the current schema; return empty set to keep UI stable.
    return res.status(200).json([]);
  } catch (err) {
    console.error("Error fetching user flows:", err);
    return res.status(500).json({ error: err.message });
  }
}

export async function getCampaignStatuses(_req, res) {
  try {
    return res.status(200).json(statusListWithIds());
  } catch (err) {
    console.error("Error fetching campaign statuses:", err);
    return res.status(500).json({ error: err.message });
  }
}

export async function createRegion(req, res) {
  try {
    const { regionName, regionCode } = req.body || {};
    const name = (regionName || "").trim();
    const code = (regionCode || "").trim();
    if (!name) {
      return res.status(400).json({ error: "regionName is required" });
    }
    if (!code) {
      return res.status(400).json({ error: "regionCode is required" });
    }

    const region = await prisma.target_region.create({
      data: { region_name: name, region_code: code },
      select: { region_id: true, region_name: true, region_code: true },
    });
    return res.status(201).json({
      message: "Region created",
      region: {
        regionid: region.region_id,
        regionname: region.region_name,
        regioncode: region.region_code,
      },
    });
  } catch (err) {
    console.error("Create region error:", err);
    return res.status(500).json({ error: err.message });
  }
}

export async function createUserFlow(req, res) {
  try {
    return res.status(501).json({ error: "User flows are not supported in this schema." });
  } catch (err) {
    console.error("Create user flow error:", err);
    return res.status(500).json({ error: err.message });
  }
}

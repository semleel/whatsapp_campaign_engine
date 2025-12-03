// src/controllers/referenceController.js

import prisma from "../config/prismaClient.js";
import { statusListWithIds } from "../constants/campaignStatus.js";

export async function getRegions(_req, res) {
  try {
    const regions = await prisma.targetregion.findMany({
      select: { regionid: true, regionname: true, regioncode: true },
      orderBy: { regionname: "asc" },
    });
    return res.status(200).json(regions);
  } catch (err) {
    console.error("Error fetching regions:", err);
    return res.status(500).json({ error: err.message });
  }
}

export async function getUserFlows(_req, res) {
  try {
    const flows = await prisma.userflow.findMany({
      select: { userflowid: true, userflowname: true },
      orderBy: { userflowname: "asc" },
    });
    return res.status(200).json(flows);
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

    const region = await prisma.targetregion.create({
      data: { regionname: name, regioncode: code },
      select: { regionid: true, regionname: true, regioncode: true },
    });
    return res.status(201).json({ message: "Region created", region });
  } catch (err) {
    console.error("Create region error:", err);
    return res.status(500).json({ error: err.message });
  }
}

export async function createUserFlow(req, res) {
  try {
    const { userFlowName } = req.body || {};
    const name = (userFlowName || "").trim();
    if (!name) {
      return res.status(400).json({ error: "userFlowName is required" });
    }

    const userflow = await prisma.userflow.create({
      data: { userflowname: name },
      select: { userflowid: true, userflowname: true },
    });
    return res.status(201).json({ message: "User flow created", userflow });
  } catch (err) {
    console.error("Create user flow error:", err);
    return res.status(500).json({ error: err.message });
  }
}

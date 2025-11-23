import prisma from "../config/prismaClient.js";
import { normalizeCampaignStatus, statusFromId, statusToId } from "../constants/campaignStatus.js";

const DEFAULT_STATUS = "New";
const STATUS_ACTIVE = "Active";
const STATUS_ON_HOLD = "On Hold";
const STATUS_INACTIVE = "Inactive";

const parseNullableDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const parseNullableInt = (value) => {
  if (value == null || value === "") return null;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

export async function createCampaign(req, res) {
  try {
    const { campaignName, objective, targetRegionID, status, startAt, endAt } = req.body;

    if (!campaignName) {
      return res.status(400).json({ error: "campaignName is required" });
    }

    const data = {
      campaignname: campaignName,
      objective: objective || null,
      targetregionid: parseNullableInt(targetRegionID),
      status: normalizeCampaignStatus(status, DEFAULT_STATUS),
      start_at: parseNullableDate(startAt),
      end_at: parseNullableDate(endAt),
      createdby_adminid: req.adminId || null,
    };

    const campaign = await prisma.campaign.create({ data });
    return res.status(201).json({ message: "Campaign created successfully!", data: campaign });
  } catch (err) {
    console.error("Create campaign error:", err);
    return res.status(500).json({ error: err.message });
  }
}

export async function listCampaigns(_req, res) {
  try {
    const campaigns = await prisma.campaign.findMany({
      where: { status: { not: "Archived" } },
      include: {
        targetregion: { select: { regionname: true } },
        keyword: { select: { keywordid: true } },
        keymapping: {
          select: {
            content: { select: { contentid: true, isdeleted: true } },
          },
        },
      },
      orderBy: { campaignid: "desc" },
    });

    const formatted = campaigns.map((campaign) => ({
      campaignid: campaign.campaignid,
      campaignname: campaign.campaignname,
      objective: campaign.objective,
      regionname: campaign.targetregion?.regionname ?? "N/A",
      currentstatus: campaign.status ?? "Unknown",
      status: campaign.status ?? "Unknown",
      camstatusid: statusToId(campaign.status),
      start_at: campaign.start_at,
      end_at: campaign.end_at,
      hasKeyword: (campaign.keyword?.length ?? 0) > 0,
      hasTemplate:
        Boolean(campaign.contentkeyid) &&
        Boolean(campaign.keymapping?.content?.contentid) &&
        !campaign.keymapping?.content?.isdeleted,
    }));

    return res.status(200).json(formatted);
  } catch (err) {
    console.error("List campaigns error:", err);
    return res.status(500).json({ error: err.message });
  }
}

export async function listArchivedCampaigns(_req, res) {
  try {
    const campaigns = await prisma.campaign.findMany({
      where: { status: "Archived" },
      include: {
        targetregion: { select: { regionname: true } },
      },
      orderBy: { campaignid: "desc" },
    });

    const formatted = campaigns.map((campaign) => ({
      campaignid: campaign.campaignid,
      campaignname: campaign.campaignname,
      objective: campaign.objective,
      regionname: campaign.targetregion?.regionname ?? "N/A",
      currentstatus: campaign.status ?? "Archived",
      camstatusid: statusToId(campaign.status),
      start_at: campaign.start_at,
      end_at: campaign.end_at,
    }));

    return res.status(200).json(formatted);
  } catch (err) {
    console.error("List archived campaigns error:", err);
    return res.status(500).json({ error: err.message });
  }
}

export async function getCampaignById(req, res) {
  try {
    const campaignID = parseInt(req.params.id, 10);
    if (Number.isNaN(campaignID)) {
      return res.status(400).json({ error: "Invalid campaign id" });
    }

    const campaign = await prisma.campaign.findUnique({
      where: { campaignid: campaignID },
      include: {
        targetregion: true,
      },
    });

    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    return res.status(200).json({
      ...campaign,
      camstatusid: statusToId(campaign.status),
    });
  } catch (err) {
    console.error("Fetch single campaign error:", err);
    return res.status(500).json({ error: err.message });
  }
}

export async function updateCampaign(req, res) {
  try {
    const campaignID = parseInt(req.params.id, 10);
    if (Number.isNaN(campaignID)) {
      return res.status(400).json({ error: "Invalid campaign id" });
    }

    const {
      campaignName,
      objective,
      targetRegionID,
      camStatusID,
      status,
      startAt,
      endAt,
    } = req.body;

    const existing = await prisma.campaign.findUnique({
      where: { campaignid: campaignID },
      select: {
        status: true,
        start_at: true,
        end_at: true,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    const currentStatus = existing.status || "Unknown";

    const wantsScheduleChange =
      typeof startAt !== "undefined" || typeof endAt !== "undefined";

    if (wantsScheduleChange && currentStatus === "Active") {
      return res.status(400).json({
        error:
          "You cannot edit the campaign schedule while it is Active. Pause it first, then update the schedule.",
      });
    }

   
    const requestedStatus =
      statusFromId(camStatusID) || normalizeCampaignStatus(status, null);

    const data = {};

    if (typeof campaignName === "string" && campaignName.trim()) {
      data.campaignname = campaignName;
    }
    if (typeof objective !== "undefined") {
      data.objective = objective || null;
    }
    if (typeof targetRegionID !== "undefined") {
      data.targetregionid = parseNullableInt(targetRegionID);
    }
    if (typeof startAt !== "undefined") {
      data.start_at = parseNullableDate(startAt);
    }
    if (typeof endAt !== "undefined") {
      data.end_at = parseNullableDate(endAt);
    }

    if (wantsScheduleChange && currentStatus !== "Active") {
      const now = new Date();

      const newStart =
        typeof data.start_at !== "undefined" ? data.start_at : existing.start_at;
      const newEnd =
        typeof data.end_at !== "undefined" ? data.end_at : existing.end_at;

      let nextStatus = null;

      if (newStart && now < newStart) {
        nextStatus = STATUS_ON_HOLD;
      } else if (newStart && now >= newStart && (!newEnd || now <= newEnd)) {
        nextStatus = STATUS_ACTIVE; 
      } else if (newEnd && now > newEnd) {
        nextStatus = STATUS_INACTIVE;
      }

      if (nextStatus) {
        data.status = nextStatus;
      }
    } else if (requestedStatus) {
      data.status = requestedStatus;
    }

    await prisma.campaign.update({
      where: { campaignid: campaignID },
      data,
    });

    return res.status(200).json({ message: "Campaign updated successfully!" });
  } catch (err) {
    console.error("Update campaign error:", err);
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Campaign not found" });
    }
    return res.status(500).json({ error: err.message });
  }
}


export async function archiveCampaign(req, res) {
  try {
    const campaignID = parseInt(req.params.id, 10);
    if (Number.isNaN(campaignID)) {
      return res.status(400).json({ error: "Invalid campaign id" });
    }

    await prisma.campaign.update({
      where: { campaignid: campaignID },
      data: { status: "Archived" },
    });

    return res.status(200).json({ message: "Campaign archived successfully!" });
  } catch (err) {
    console.error("Archive campaign error:", err);
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Campaign not found" });
    }
    return res.status(500).json({ error: err.message });
  }
}

export async function restoreCampaign(req, res) {
  try {
    const campaignID = parseInt(req.params.id, 10);
    if (Number.isNaN(campaignID)) {
      return res.status(400).json({ error: "Invalid campaign id" });
    }

    await prisma.campaign.update({
      where: { campaignid: campaignID },
      data: { status: "Inactive" },
    });

    return res.status(200).json({ message: "Campaign restored to Inactive!" });
  } catch (err) {
    console.error("Restore campaign error:", err);
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Campaign not found" });
    }
    return res.status(500).json({ error: err.message });
  }
}

export async function hardDeleteArchivedCampaign(req, res) {
  try {
    const campaignID = parseInt(req.params.id, 10);
    if (Number.isNaN(campaignID)) {
      return res.status(400).json({ error: "Invalid campaign id" });
    }

    const campaign = await prisma.campaign.findUnique({
      where: { campaignid: campaignID },
      select: { status: true },
    });

    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    if (campaign.status !== "Archived") {
      return res
        .status(400)
        .json({ error: "Only archived campaigns can be permanently deleted." });
    }

    await prisma.campaign.delete({ where: { campaignid: campaignID } });

    return res
      .status(200)
      .json({ message: "Campaign permanently deleted." });
  } catch (err) {
    console.error("Hard delete campaign error:", err);
    return res.status(500).json({ error: err.message });
  }
}

export async function hardDeleteArchivedCampaigns(req, res) {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const parsedIds = ids
      .map((id) => parseInt(id, 10))
      .filter((id) => !Number.isNaN(id));

    if (!parsedIds.length) {
      return res.status(400).json({ error: "No campaign ids provided." });
    }

    const result = await prisma.campaign.deleteMany({
      where: { campaignid: { in: parsedIds }, status: "Archived" },
    });

    return res.status(200).json({
      message: "Archived campaigns permanently deleted.",
      deleted: result.count,
    });
  } catch (err) {
    console.error("Bulk hard delete campaign error:", err);
    return res.status(500).json({ error: err.message });
  }
}

export async function autoCheckCampaignStatuses() {
  try {
    const now = new Date();

    const campaigns = await prisma.campaign.findMany({
      where: {
        status: {
          in: [STATUS_ON_HOLD, STATUS_ACTIVE], 
        },
      },
      select: {
        campaignid: true,
        status: true,
        start_at: true,
        end_at: true,
      },
    });

    for (const campaign of campaigns) {
      const currentStatus = campaign.status;
      const startWindow = campaign.start_at
        ? new Date(campaign.start_at)
        : null;
      const endWindow = campaign.end_at ? new Date(campaign.end_at) : null;

      let nextStatus = null;

      if (currentStatus === STATUS_ON_HOLD) {
        if (startWindow && now >= startWindow) {
          nextStatus = STATUS_ACTIVE;

          if (endWindow && now > endWindow) {
            nextStatus = STATUS_INACTIVE;
          }
        }
      }

      if (currentStatus === STATUS_ACTIVE) {
        if (endWindow && now > endWindow) {
          nextStatus = STATUS_INACTIVE;
        }
      }

      if (nextStatus && nextStatus !== currentStatus) {
        await prisma.campaign.update({
          where: { campaignid: campaign.campaignid },
          data: { status: nextStatus },
        });
      }
    }
  } catch (err) {
    console.error("[CampaignStatusJob] error:", err);
  }
}


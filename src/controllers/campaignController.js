// src/controllers/campaignController.js

import { prisma } from "../config/prismaClient.js";
import { mapContentToResponse } from "./templateController.js";
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

    const startDate = parseNullableDate(startAt);
    const endDate = parseNullableDate(endAt);
    const now = new Date();

    if (startDate && endDate && startDate > endDate) {
      return res
        .status(400)
        .json({ error: "startAt must be before endAt." });
    }

    const scheduleAlreadyEnded =
      endDate && endDate < now && (!startDate || startDate <= endDate);
    if (scheduleAlreadyEnded) {
      return res.status(400).json({
        error: "The campaign schedule is already in the past. Please choose a future start/end date.",
      });
    }

    const normalizedStatus = normalizeCampaignStatus(status, DEFAULT_STATUS);

    let derivedStatus = null;
    if (startDate && now < startDate) {
      derivedStatus = STATUS_ON_HOLD;
    } else if (startDate && now >= startDate && (!endDate || now <= endDate)) {
      derivedStatus = STATUS_ACTIVE;
    } else if (endDate && now > endDate) {
      derivedStatus = STATUS_INACTIVE;
    }

    const data = {
      campaign_name: campaignName,
      objective: objective || null,
      target_region_id: parseNullableInt(targetRegionID),
      status: derivedStatus || normalizedStatus,
      start_at: startDate,
      end_at: endDate,
      created_by_admin_id: req.adminId || null,
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
    const deriveWindowStatus = (startAt, endAt) => {
      const now = new Date();
      const start = startAt ? new Date(startAt) : null;
      const end = endAt ? new Date(endAt) : null;

      // Upcoming if there is no schedule at all, or start is in the future.
      if (!start && !end) return "Upcoming";
      if (start && now < start) return "Upcoming";

      // Expired if an end date exists and has passed.
      if (end && now > end) return "Expired";

      // Otherwise we are within the active window (start reached, not past end).
      return "On Going";
    };

    const campaigns = await prisma.campaign.findMany({
      where: {
        status: { not: "Archived" },
        OR: [{ is_deleted: false }, { is_deleted: null }],
      },
      include: {
        target_region: { select: { region_name: true } },
        campaign_keyword: { select: { keyword_id: true } },
        _count: { select: { campaign_step: true } },
      },
      orderBy: { campaign_id: "desc" },
    });

    const formatted = campaigns.map((campaign) => ({
      campaignid: campaign.campaign_id,
      campaignname: campaign.campaign_name,
      objective: campaign.objective,
      regionname: campaign.target_region?.region_name ?? "N/A",
      currentstatus: deriveWindowStatus(campaign.start_at, campaign.end_at),
      status: deriveWindowStatus(campaign.start_at, campaign.end_at),
      is_active: campaign.is_active ?? null, // surface null explicitly if not set
      camstatusid: statusToId(campaign.status),
      start_at: campaign.start_at,
      end_at: campaign.end_at,
      hasKeyword: (campaign.campaign_keyword?.length ?? 0) > 0,
      hasSteps: (campaign._count?.campaign_step ?? 0) > 0,
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
      where: {
        OR: [{ status: "Archived" }, { is_deleted: true }],
      },
      include: {
        target_region: { select: { region_name: true } },
      },
      orderBy: { campaign_id: "desc" },
    });

    const formatted = campaigns.map((campaign) => ({
      campaignid: campaign.campaign_id,
      campaignname: campaign.campaign_name,
      objective: campaign.objective,
      regionname: campaign.target_region?.region_name ?? "N/A",
      currentstatus: campaign.is_deleted ? "Archived" : campaign.status ?? "Archived",
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
      where: { campaign_id: campaignID },
      include: {
        target_region: true,
      },
    });

    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    return res.status(200).json({
      campaignid: campaign.campaign_id,
      campaignname: campaign.campaign_name,
      objective: campaign.objective,
      targetregionid: campaign.target_region_id,
      status: campaign.status,
      start_at: campaign.start_at,
      end_at: campaign.end_at,
      createdat: campaign.created_at,
      updatedat: campaign.updated_at,
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
      is_active,
    } = req.body;

    const existing = await prisma.campaign.findUnique({
      where: { campaign_id: campaignID },
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
      data.campaign_name = campaignName;
    }
    if (typeof objective !== "undefined") {
      data.objective = objective || null;
    }
    if (typeof targetRegionID !== "undefined") {
      data.target_region_id = parseNullableInt(targetRegionID);
    }
    if (typeof startAt !== "undefined") {
      data.start_at = parseNullableDate(startAt);
    }
    if (typeof endAt !== "undefined") {
      data.end_at = parseNullableDate(endAt);
    }
    if (typeof is_active === "boolean") {
      data.is_active = is_active;
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

    // Keep is_deleted in sync when status is explicitly set
    if (typeof data.status !== "undefined") {
      if (data.status === "Archived") {
        data.is_deleted = true;
        data.is_active = false;
      } else {
        data.is_deleted = false;
        data.is_active = true;
      }
    }

    await prisma.campaign.update({
      where: { campaign_id: campaignID },
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


const parseStepPayload = (body = {}) => {
  const toNullableInt = (val) => {
    if (val === null || typeof val === "undefined" || val === "") return null;
    const parsed = parseInt(val, 10);
    return Number.isNaN(parsed) ? null : parsed;
  };

  return {
    step_number: toNullableInt(body.step_number),
    step_code: typeof body.step_code === "string" ? body.step_code : null,
    prompt_text: body.prompt_text ?? "",
    error_message: typeof body.error_message === "string" ? body.error_message : null,
    expected_input: body.expected_input || "none",
    action_type: body.action_type || "message",
    api_id: toNullableInt(body.api_id),
    next_step_id: toNullableInt(body.next_step_id),
    failure_step_id: toNullableInt(body.failure_step_id),
    is_end_step: !!body.is_end_step,
    template_source_id: toNullableInt(body.template_source_id),

    // Media field (optional)
    media_url:
      typeof body.media_url === "string" && body.media_url.length ? body.media_url : null,
  };
};

const mapStepResponse = (step) => {
  let inputType = null;
  let expectedInput = step.expected_input;
  if (step.action_type === "input") {
    if (step.expected_input === "number" || step.expected_input === "email") {
      inputType = step.expected_input;
    } else {
      inputType = "text";
    }
    expectedInput = inputType;
  } else if (step.action_type === "choice") {
    expectedInput = "choice";
  } else {
    expectedInput = "none";
  }

  const template = step.content ? mapContentToResponse(step.content) : null;

  return {
    step_id: step.step_id,
    client_id: step.step_id,
    campaign_id: step.campaign_id,
    step_number: step.step_number,
    step_code: step.step_code,
    prompt_text: step.prompt_text,
    error_message: step.error_message,
    expected_input: expectedInput,
    input_type: inputType,
    action_type: step.action_type,
    api_id: step.api_id,
    next_step_id: step.next_step_id,
    failure_step_id: step.failure_step_id,
    is_end_step: step.is_end_step,
    template_source_id: step.template_source_id,
    template,
    media_url: step.media_url,
    campaign_step_choice: (
      step.campaign_step_choice_campaign_step_choice_step_idTocampaign_step || []
    ).map((c) => ({
      choice_id: c.choice_id,
      campaign_id: c.campaign_id,
      step_id: c.step_id,
      choice_code: c.choice_code,
      label: c.label,
      next_step_id: c.next_step_id,
      is_correct: c.is_correct,
    })),
  };
};

export async function getCampaignWithSteps(req, res) {
  try {
    const campaignID = parseInt(req.params.id, 10);
    if (Number.isNaN(campaignID)) {
      return res.status(400).json({ error: "Invalid campaign id" });
    }

    const campaign = await prisma.campaign.findUnique({
      where: { campaign_id: campaignID },
      include: {
        target_region: true,
        campaign_step: {
          orderBy: { step_number: "asc" },
          include: {
            content: true,
            campaign_step_choice_campaign_step_choice_step_idTocampaign_step: {
              orderBy: { choice_id: "asc" },
            },
          },
        },
      },
    });

    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    const mappedCampaign = {
      campaignid: campaign.campaign_id,
      campaignname: campaign.campaign_name,
      objective: campaign.objective,
      targetregionid: campaign.target_region_id,
      status: campaign.status,
      start_at: campaign.start_at,
      end_at: campaign.end_at,
    };

    const mappedSteps = (campaign.campaign_step || []).map((step) => mapStepResponse(step));

    return res.status(200).json({
      campaign: mappedCampaign,
      steps: mappedSteps,
    });
  } catch (err) {
    console.error("Fetch campaign steps error:", err);
    return res.status(500).json({ error: err.message });
  }
}

export async function upsertCampaignStep(req, res) {
  try {
    const campaignID = parseInt(req.params.id, 10);
    if (Number.isNaN(campaignID)) {
      return res.status(400).json({ error: "Invalid campaign id" });
    }

    const {
      step_id: incomingStepId,
      stepId,
      step_number,
      step_code,
      prompt_text,
      expected_input,
      action_type,
      api_id,
      next_step_id,
      failure_step_id,
      is_end_step,
    } = req.body || {};

    const stepIdValue = parseNullableInt(incomingStepId ?? stepId);
    const payload = parseStepPayload({
      step_number,
      step_code,
      prompt_text,
      expected_input,
      action_type,
      api_id,
      next_step_id,
      failure_step_id,
      is_end_step,
    });

    if (!payload.step_number) {
      return res.status(400).json({ error: "step_number is required" });
    }

    const steps = await prisma.campaign_step.findMany({
      where: { campaign_id: campaignID },
      select: { step_id: true },
    });
    const validIds = new Set(steps.map((s) => s.step_id));

    if (payload.action_type === "choice") {
      payload.next_step_id = null;
      payload.is_end_step = false;
    } else if (payload.is_end_step) {
      payload.next_step_id = null;
    }

    if (payload.action_type !== "choice" && !payload.is_end_step && !payload.next_step_id) {
      return res
        .status(400)
        .json({ error: "next_step_id is required for non-choice steps unless is_end_step is true" });
    }

    if (payload.next_step_id && !validIds.has(payload.next_step_id)) {
      return res.status(400).json({ error: "next_step_id must reference a step in this campaign" });
    }

    if (payload.failure_step_id && !validIds.has(payload.failure_step_id)) {
      payload.failure_step_id = null;
    }

    let result = null;
    if (stepIdValue) {
      const existing = await prisma.campaign_step.findUnique({
        where: { step_id: stepIdValue },
        select: { campaign_id: true },
      });
      if (!existing || existing.campaign_id !== campaignID) {
        return res.status(404).json({ error: "Step not found for this campaign" });
      }

      result = await prisma.campaign_step.update({
        where: { step_id: stepIdValue },
        data: payload,
      });
    } else {
      result = await prisma.campaign_step.create({
        data: { ...payload, campaign_id: campaignID },
      });
    }

    return res.status(200).json({ message: "Step saved", step: result });
  } catch (err) {
    console.error("Upsert step error:", err);
    return res.status(500).json({ error: err.message });
  }
}

export async function deleteCampaignStep(req, res) {
  try {
    const campaignID = parseInt(req.params.id, 10);
    const stepId = parseInt(req.params.stepId, 10);
    if (Number.isNaN(campaignID) || Number.isNaN(stepId)) {
      return res.status(400).json({ error: "Invalid campaign/step id" });
    }

    const existing = await prisma.campaign_step.findUnique({
      where: { step_id: stepId },
      select: { campaign_id: true },
    });
    if (!existing || existing.campaign_id !== campaignID) {
      return res.status(404).json({ error: "Step not found for this campaign" });
    }

    await prisma.$transaction([
      prisma.campaign_response.deleteMany({ where: { step_id: stepId } }),
      prisma.campaign_step_choice.deleteMany({ where: { step_id: stepId } }),
      prisma.campaign_session.updateMany({
        where: { current_step_id: stepId },
        data: { current_step_id: null },
      }),
      prisma.campaign_step.delete({ where: { step_id: stepId } }),
    ]);

    return res.status(200).json({ message: "Step deleted" });
  } catch (err) {
    console.error("Delete step error:", err);
    return res.status(500).json({ error: err.message });
  }
}

export async function saveStepChoices(req, res) {
  try {
    const campaignID = parseInt(req.params.id, 10);
    const stepId = parseInt(req.params.stepId, 10);
    const choices = Array.isArray(req.body?.choices) ? req.body.choices : [];

    if (Number.isNaN(campaignID) || Number.isNaN(stepId)) {
      return res.status(400).json({ error: "Invalid campaign/step id" });
    }

    const step = await prisma.campaign_step.findUnique({
      where: { step_id: stepId },
      select: { campaign_id: true },
    });
    if (!step || step.campaign_id !== campaignID) {
      return res.status(404).json({ error: "Step not found for this campaign" });
    }

    // Debug once to confirm payload shape
    console.log("[DEBUG saveStepChoices] choices payload:", JSON.stringify(choices, null, 2));

    await prisma.$transaction(async (tx) => {
      // 1) Load all steps in this campaign so we can validate next_step_id references
      const stepsForCampaign = await tx.campaign_step.findMany({
        where: { campaign_id: campaignID },
        select: { step_id: true },
      });
      const validStepIds = new Set(stepsForCampaign.map((s) => s.step_id));

      // 2) Existing choices for delete detection
      const existing = await tx.campaign_step_choice.findMany({
        where: { step_id: stepId },
        select: { choice_id: true },
      });
      const existingIds = existing.map((c) => c.choice_id);

      const incomingIds = choices
        .map((c) => ("choice_id" in c ? parseInt(c.choice_id, 10) : parseInt(c.choiceid, 10)))
        .filter((id) => !Number.isNaN(id));

      // 3) Delete removed choices
      const toDelete = existingIds.filter((id) => !incomingIds.includes(id));
      if (toDelete.length) {
        await tx.campaign_step_choice.deleteMany({
          where: { choice_id: { in: toDelete } },
        });
      }

      // 4) Upsert all incoming choices
      for (const c of choices) {
        const choiceId = ("choice_id" in c ? c.choice_id : c.choiceid) || null;

        const rawNext = c.next_step_id ?? c.nextStepId ?? null;
        const parsedNext =
          rawNext == null || rawNext === "" ? null : Number(rawNext);
        const resolvedNextStepId =
          parsedNext && !Number.isNaN(parsedNext) && validStepIds.has(parsedNext)
            ? parsedNext
            : null;

        const data = {
          campaign_id: campaignID,
          step_id: stepId,
          choice_code: c.choice_code || c.choicecode || "",
          label: c.label || "",
          next_step_id: resolvedNextStepId,
          is_correct:
            typeof c.is_correct === "boolean" ? c.is_correct : !!c.isCorrect,
        };

        if (choiceId) {
          await tx.campaign_step_choice.update({
            where: { choice_id: Number(choiceId) },
            data,
          });
        } else {
          await tx.campaign_step_choice.create({ data });
        }
      }
    });

    return res.status(200).json({ message: "Choices saved" });
  } catch (err) {
    console.error("Save step choices error:", err);
    return res.status(500).json({ error: err.message });
  }
}

export async function saveCampaignStepsBulk(req, res) {
  try {
    const campaignID = parseInt(req.params.id, 10);
    if (Number.isNaN(campaignID)) {
      return res.status(400).json({ error: "Invalid campaign id" });
    }

    const incomingSteps = Array.isArray(req.body?.steps) ? req.body.steps : [];
    const normalizedSteps = incomingSteps.map((s, idx) => ({
      ...s,
      step_number: idx + 1,
      step_code: (s.step_code || `STEP_${idx + 1}`).trim(),
      client_id: s.client_id ?? s.step_id ?? (s.stepId ? Number(s.stepId) : null),
    }));

    // Validate unique step_code (non-empty) per campaign
    const seenCodes = new Set();
    for (const s of normalizedSteps) {
      const code = (s.step_code || "").trim().toLowerCase();
      if (!code) continue;
      if (seenCodes.has(code)) {
        return res.status(400).json({ error: "Duplicate step_code detected" });
      }
      seenCodes.add(code);
    }

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.campaign_step.findMany({
        where: { campaign_id: campaignID },
        select: { step_id: true },
      });
      const existingIds = existing.map((s) => s.step_id);
      const incomingIds = normalizedSteps
        .map((s) => Number(s.step_id))
        .filter((v) => v && !Number.isNaN(v));

      const toDelete = existingIds.filter((id) => !incomingIds.includes(id));
      if (toDelete.length) {
        await tx.campaign_response.deleteMany({ where: { step_id: { in: toDelete } } });
        await tx.campaign_step_choice.deleteMany({ where: { step_id: { in: toDelete } } });
        await tx.campaign_session.updateMany({
          where: { current_step_id: { in: toDelete } },
          data: { current_step_id: null },
        });
        await tx.campaign_step.deleteMany({ where: { step_id: { in: toDelete } } });
      }

      // Temporarily move existing step_numbers out of the way to avoid unique constraint clashes
      await tx.campaign_step.updateMany({
        where: { campaign_id: campaignID },
        data: { step_number: { increment: 100000 } },
      });

      const savedSteps = [];
      for (const step of normalizedSteps) {
        const isChoiceStep = (step.action_type || "message") === "choice";
        const computedExpected = (() => {
          if (step.action_type === "message" || step.action_type === "api") return "none";
          if (step.action_type === "choice") return "choice";
          if (step.action_type === "input") {
            if (step.input_type === "number" || step.input_type === "email") return step.input_type;
            return "text";
          }
          return "none";
        })();

        const data = {
          campaign_id: campaignID,
          step_number: step.step_number,
          step_code: step.step_code || null,
          prompt_text: step.prompt_text || "",
          error_message: step.error_message || null,
          expected_input: computedExpected,
          action_type: step.action_type || "message",
          api_id: step.api_id ?? null,
          template_source_id:
            step.template_source_id == null || step.template_source_id === ""
              ? null
              : Number.isNaN(Number(step.template_source_id))
              ? null
              : Number(step.template_source_id),
          failure_step_id: null,
          next_step_id: null,
          is_end_step: isChoiceStep ? false : !!step.is_end_step,
          media_url:
            typeof step.media_url === "string" && step.media_url.length ? step.media_url : null,
        };

        let saved;
        if (step.step_id && !Number.isNaN(step.step_id)) {
          saved = await tx.campaign_step.update({
            where: { step_id: step.step_id },
            data,
          });
        } else {
          saved = await tx.campaign_step.create({
            data,
          });
        }
        const clientId = step.client_id ?? step.step_id ?? saved.step_id;
        savedSteps.push({
          saved,
          source: {
            ...step,
            action_type: step.action_type || "message",
            is_end_step: isChoiceStep ? false : !!step.is_end_step,
          },
          sourceChoices: step.campaign_step_choice || [],
          clientId,
        });
      }

      // Build mapping: client_id/step_id -> saved step_id
      const clientIdToSavedId = new Map();
      savedSteps.forEach(({ saved, clientId }) => {
        clientIdToSavedId.set(saved.step_id, saved.step_id);
        if (clientId != null) {
          const normalizedClientId = Number(clientId);
          if (!Number.isNaN(normalizedClientId)) {
            clientIdToSavedId.set(normalizedClientId, saved.step_id);
          }
        }
      });
      const resolveRef = (raw) => {
        if (raw == null || raw === "") return null;
        const num = Number(raw);
        if (Number.isNaN(num)) return null;
        return clientIdToSavedId.get(num) ?? null;
      };

      // Apply routing using explicit next_step_id values only
      for (const { saved, source } of savedSteps) {
        const dbNextStepId =
          source.action_type === "choice" ? null : source.is_end_step ? null : resolveRef(source.next_step_id);
        const dbFailureStepId = resolveRef(source.failure_step_id);

        if (source.action_type !== "choice" && !source.is_end_step && !dbNextStepId) {
          throw Object.assign(
            new Error(`Invalid next_step_id for step ${source.step_code || source.step_number}`),
            { statusCode: 400 }
          );
        }

        await tx.campaign_step.update({
          where: { step_id: saved.step_id },
          data: {
            next_step_id: dbNextStepId,
            is_end_step: !!source.is_end_step,
            failure_step_id: dbFailureStepId,
          },
        });
      }

      // Choices: replace per step, and map choice.next_step_id (ID-based)
      for (const { saved, sourceChoices } of savedSteps) {
        const stepId = saved.step_id;
        const existingChoices = await tx.campaign_step_choice.findMany({
          where: { step_id: stepId },
          select: { choice_id: true },
        });
        const choiceIds = existingChoices.map((c) => c.choice_id);
        if (choiceIds.length) {
          await tx.campaign_response.deleteMany({
            where: { choice_id: { in: choiceIds } },
          });
        }
        // Delete removed
        await tx.campaign_step_choice.deleteMany({
          where: {
            step_id: stepId,
            choice_id: {
              notIn: (Array.isArray(sourceChoices) ? sourceChoices : [])
                .map((c) => Number(c.choice_id) || 0)
                .filter((id) => id > 0),
            },
          },
        });

        const payloadChoices = Array.isArray(sourceChoices) ? sourceChoices : [];
        for (const c of payloadChoices) {
          const choiceId = Number(c.choice_id);
          const data = {
            campaign_id: campaignID,
            step_id: stepId,
            choice_code: c.choice_code || "",
            label: c.label || "",
            next_step_id: resolveRef(c.next_step_id),
            is_correct: typeof c.is_correct === "boolean" ? c.is_correct : !!c.isCorrect,
          };
          if (choiceId > 0) {
            await tx.campaign_step_choice.update({
              where: { choice_id: choiceId },
              data,
            });
          } else {
            await tx.campaign_step_choice.create({ data });
          }
        }
      }

      // Return refreshed data
      const refreshed = await tx.campaign.findUnique({
        where: { campaign_id: campaignID },
        include: {
          campaign_step: {
            orderBy: { step_number: "asc" },
            include: {
              content: true,
              campaign_step_choice_campaign_step_choice_step_idTocampaign_step: {
                orderBy: { choice_id: "asc" },
              },
            },
          },
        },
      });

      return refreshed;
    });

    if (!result) return res.status(404).json({ error: "Campaign not found" });

    const mappedCampaign = {
      campaignid: result.campaign_id,
      campaignname: result.campaign_name,
      objective: result.objective,
      targetregionid: result.target_region_id,
      status: result.status,
      start_at: result.start_at,
      end_at: result.end_at,
    };

    const mappedSteps = (result.campaign_step || []).map((step) => mapStepResponse(step));

    return res.status(200).json({ campaign: mappedCampaign, steps: mappedSteps });
  } catch (err) {
    console.error("Save campaign steps (bulk) error:", err);
    if (err?.statusCode === 400) {
      return res.status(400).json({ error: err.message });
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
      where: { campaign_id: campaignID },
      data: { status: "Archived", is_deleted: true, is_active: false },
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
      where: { campaign_id: campaignID },
      data: { status: "Inactive", is_deleted: false, is_active: true },
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
      where: { campaign_id: campaignID },
      select: { status: true },
    });

    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    if (campaign.status !== "Archived" && !campaign.is_deleted) {
      return res
        .status(400)
        .json({ error: "Only archived campaigns can be permanently deleted." });
    }

    await prisma.campaign.delete({ where: { campaign_id: campaignID } });

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
      where: {
        campaign_id: { in: parsedIds },
        OR: [{ status: "Archived" }, { is_deleted: true }],
      },
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

    const deriveWindowStatus = (startAt, endAt) => {
      const start = startAt ? new Date(startAt) : null;
      const end = endAt ? new Date(endAt) : null;

      if (!start && !end) return "Upcoming";
      if (start && now < start) return "Upcoming";
      if (end && now > end) return "Expired";
      return "On Going";
    };

    const campaigns = await prisma.campaign.findMany({
      where: {
        status: { not: "Archived" },
        OR: [{ is_deleted: false }, { is_deleted: null }],
      },
      select: {
        campaign_id: true,
        status: true,
        start_at: true,
        end_at: true,
      },
    });

    for (const campaign of campaigns) {
      const currentStatus = campaign.status;
      const nextStatus = deriveWindowStatus(campaign.start_at, campaign.end_at);

      if (nextStatus !== currentStatus) {
        await prisma.campaign.update({
          where: { campaign_id: campaign.campaign_id },
          data: { status: nextStatus },
        });
      }
    }
  } catch (err) {
    console.error("[CampaignStatusJob] error:", err);
  }
}



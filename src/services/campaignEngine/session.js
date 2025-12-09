import prisma from "../../config/prismaClient.js";
import { getStepContentForSession } from "../contentLocalizationService.js";
import { GENERIC_CONTENT_FALLBACK, SESSION_EXPIRY_MINUTES, SUPPORTED_LANG_CODES } from "./constants.js";

export const ensureSessionStep = async (session, stepId) => {
  if (!session?.campaign_session_id || session.current_step_id === stepId) return;
  try {
    await prisma.campaign_session.update({
      where: { campaign_session_id: session.campaign_session_id },
      data: { current_step_id: stepId, last_active_at: new Date() },
    });
    session.current_step_id = stepId;
  } catch (err) {
    console.error("[ENGINE] Failed to sync current_step_id", err);
  }
};

export const resolveStepContent = async (session, step) => {
  if (!step?.template_source_id) return null;
  if (!session?.campaign_session_id) return null;
  const localized = await getStepContentForSession(session.campaign_session_id);
  return localized || GENERIC_CONTENT_FALLBACK;
};

export const isLanguageSelectorStep = (step, choices = []) => {
  if (!step) return false;
  const stepCode = (step.step_code || "").toString().toUpperCase();
  if (stepCode === "LANG_SELECTOR" && step.action_type === "choice") return true;

  if (!choices.length) return false;
  const codes = choices
    .map((c) => (c.choice_code || "").trim().toUpperCase())
    .filter(Boolean);
  if (!codes.length) return false;
  const allLangChoices = codes.every((c) => SUPPORTED_LANG_CODES.includes(c));
  return step.action_type === "choice" && allLangChoices;
};

export const updateContactLanguageForSession = async (sessionId, langCode) => {
  const code = (langCode || "").trim();
  if (!sessionId || !code) return;
  try {
    await prisma.campaign_session.update({
      where: { campaign_session_id: sessionId },
      data: { contact: { update: { lang: code } } },
    });
  } catch (err) {
    console.error("[ENGINE] Failed to update contact language", { sessionId, langCode: code }, err);
  }
};

export async function findOrCreateContact(phone) {
  let contact = await prisma.contact.findUnique({
    where: { phone_num: phone },
  });

  if (!contact) {
    contact = await prisma.contact.create({
      data: { phone_num: phone },
    });
  }

  return contact;
}

export async function findActiveSession(contactId, campaignId) {
  const cutoff = new Date(Date.now() - SESSION_EXPIRY_MINUTES * 60_000);

  return prisma.campaign_session.findFirst({
    where: {
      contact_id: contactId,
      ...(campaignId ? { campaign_id: campaignId } : {}),
      session_status: "ACTIVE",
      last_active_at: { gte: cutoff },
    },
    include: { campaign: true },
  });
}

export async function findExpiredSession(contactId, campaignId) {
  return prisma.campaign_session.findFirst({
    where: {
      contact_id: contactId,
      ...(campaignId ? { campaign_id: campaignId } : {}),
      session_status: "EXPIRED",
    },
    orderBy: [{ last_active_at: "desc" }, { created_at: "desc" }],
    include: { campaign: true },
  });
}

export async function markExpiredSessions() {
  const cutoff = new Date(Date.now() - SESSION_EXPIRY_MINUTES * 60_000);
  await prisma.campaign_session.updateMany({
    where: {
      session_status: "ACTIVE",
      last_active_at: { lt: cutoff },
    },
    data: { session_status: "EXPIRED" },
  });
}

export async function createSessionForCampaign(contactId, campaignId, keywordMeta) {
  const baseData = {
    contact_id: contactId,
    campaign_id: campaignId,
    session_status: "ACTIVE",
    created_at: new Date(),
    last_active_at: new Date(),
  };

  const data =
    keywordMeta && Object.keys(keywordMeta).length > 0
      ? {
          ...baseData,
          last_payload_json: keywordMeta,
          last_payload_type: "keyword_start",
        }
      : baseData;

  const session = await prisma.campaign_session.create({ data });
  return session;
}

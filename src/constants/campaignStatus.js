export const CAMPAIGN_STATUSES = ["Active", "Inactive", "Archived", "New", "On Hold", "Paused"];

export function normalizeCampaignStatus(value, fallback = "Inactive") {
  if (!value) return fallback;
  const match = CAMPAIGN_STATUSES.find(
    (status) => status.toLowerCase() === String(value).trim().toLowerCase()
  );
  return match || fallback;
}

export function statusFromId(id) {
  if (id == null) return null;
  const index = Number(id) - 1;
  if (Number.isNaN(index) || index < 0 || index >= CAMPAIGN_STATUSES.length) return null;
  return CAMPAIGN_STATUSES[index];
}

export function statusListWithIds() {
  return CAMPAIGN_STATUSES.map((status, index) => ({
    camstatusid: index + 1,
    currentstatus: status,
  }));
}

export function statusToId(value) {
  const normalized = normalizeCampaignStatus(value, null);
  if (!normalized) return null;
  const index = CAMPAIGN_STATUSES.findIndex((status) => status === normalized);
  return index === -1 ? null : index + 1;
}

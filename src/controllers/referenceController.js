import { supabase } from "../services/supabaseService.js";

export async function getRegions(_req, res) {
  try {
    const { data, error } = await supabase.from("targetregion").select("regionid, regionname");
    if (error) throw error;
    res.status(200).json(data);
  } catch (err) {
    console.error("Error fetching regions:", err);
    res.status(500).json({ error: err.message });
  }
}

export async function getUserFlows(_req, res) {
  try {
    const { data, error } = await supabase.from("userflow").select("userflowid, userflowname");
    if (error) throw error;
    res.status(200).json(data);
  } catch (err) {
    console.error("Error fetching user flows:", err);
    res.status(500).json({ error: err.message });
  }
}

export async function getCampaignStatuses(_req, res) {
  try {
    const { data, error } = await supabase.from("campaignstatus").select("camstatusid, currentstatus");
    if (error) throw error;
    res.status(200).json(data);
  } catch (err) {
    console.error("Error fetching campaign statuses:", err);
    res.status(500).json({ error: err.message });
  }
}

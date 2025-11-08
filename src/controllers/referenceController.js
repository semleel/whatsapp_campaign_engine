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

export async function createRegion(req, res) {
  try {
    const { regionName } = req.body || {};
    const name = (regionName || "").trim();
    if (!name) return res.status(400).json({ error: "regionName is required" });

    const { data, error } = await supabase
      .from("targetregion")
      .insert([{ regionname: name }])
      .select("regionid, regionname")
      .single();
    if (error) throw error;
    res.status(201).json({ message: "Region created", region: data });
  } catch (err) {
    console.error("Create region error:", err);
    res.status(500).json({ error: err.message });
  }
}

export async function createUserFlow(req, res) {
  try {
    const { userFlowName } = req.body || {};
    const name = (userFlowName || "").trim();
    if (!name) return res.status(400).json({ error: "userFlowName is required" });

    const { data, error } = await supabase
      .from("userflow")
      .insert([{ userflowname: name }])
      .select("userflowid, userflowname")
      .single();
    if (error) throw error;
    res.status(201).json({ message: "User flow created", userflow: data });
  } catch (err) {
    console.error("Create user flow error:", err);
    res.status(500).json({ error: err.message });
  }
}

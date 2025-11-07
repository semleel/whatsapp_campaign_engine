import { supabase } from "../services/supabaseService.js";

export async function createCampaign(req, res) {
  try {
    const { campaignName, objective, targetRegionID, userFlowID, campaignScheduleID } = req.body;

    const insertData = {
      campaignname: campaignName,
      objective,
      targetregionid: targetRegionID ? parseInt(targetRegionID, 10) : null,
      userflowid: userFlowID ? parseInt(userFlowID, 10) : null,
      campaignscheduleid: campaignScheduleID ? parseInt(campaignScheduleID, 10) : null,
    };

    const { data, error } = await supabase.from("campaign").insert([insertData]).select();
    if (error) throw error;

    res.status(201).json({ message: "Campaign created successfully!", data });
  } catch (err) {
    console.error("Create error:", err);
    res.status(500).json({ error: err.message });
  }
}

export async function listCampaigns(_req, res) {
  try {
    const { data, error } = await supabase
      .from("campaign")
      .select(`
        campaignid,
        campaignname,
        objective,
        targetregion:targetregionid (regionname),
        userflow:userflowid (userflowname),
        campaignstatus:camstatusid (currentstatus),
        camstatusid
      `)
      .neq("camstatusid", 3);

    if (error) throw error;

    const formatted = data.map((c) => ({
      campaignid: c.campaignid,
      campaignname: c.campaignname,
      objective: c.objective,
      regionname: c.targetregion?.regionname || "N/A",
      userflowname: c.userflow?.userflowname || "N/A",
      currentstatus: c.campaignstatus?.currentstatus || "N/A",
      camstatusid: c.camstatusid,
    }));

    res.status(200).json(formatted);
  } catch (err) {
    console.error("Fetch campaign list error:", err);
    res.status(500).json({ error: err.message });
  }
}

export async function listArchivedCampaigns(_req, res) {
  try {
    const { data, error } = await supabase
      .from("campaign")
      .select(`
        campaignid,
        campaignname,
        objective,
        targetregion:targetregionid (regionname),
        userflow:userflowid (userflowname),
        campaignstatus:camstatusid (currentstatus)
      `)
      .eq("camstatusid", 3);

    if (error) throw error;

    const formatted = data.map((c) => ({
      campaignid: c.campaignid,
      campaignname: c.campaignname,
      objective: c.objective,
      regionname: c.targetregion?.regionname || "N/A",
      userflowname: c.userflow?.userflowname || "N/A",
      currentstatus: c.campaignstatus?.currentstatus || "Archived",
    }));

    res.status(200).json(formatted);
  } catch (err) {
    console.error("Fetch archived campaigns error:", err);
    res.status(500).json({ error: err.message });
  }
}

export async function getCampaignById(req, res) {
  try {
    const campaignID = parseInt(req.params.id, 10);
    const { data, error } = await supabase.from("campaign").select("*").eq("campaignid", campaignID).single();
    if (error) throw error;

    res.status(200).json(data);
  } catch (err) {
    console.error("Fetch single campaign error:", err);
    res.status(500).json({ error: err.message });
  }
}

export async function updateCampaign(req, res) {
  try {
    const campaignID = parseInt(req.params.id, 10);
    const { campaignName, objective, targetRegionID, userFlowID, camStatusID, campaignScheduleID } = req.body;

    const updateData = {
      campaignname: campaignName,
      objective,
      targetregionid: targetRegionID ? parseInt(targetRegionID, 10) : null,
      userflowid: userFlowID ? parseInt(userFlowID, 10) : null,
      camstatusid: camStatusID ? parseInt(camStatusID, 10) : null,
      campaignscheduleid: campaignScheduleID ? parseInt(campaignScheduleID, 10) : null,
    };

    const { error } = await supabase.from("campaign").update(updateData).eq("campaignid", campaignID);
    if (error) throw error;

    res.status(200).json({ message: "Campaign updated successfully!" });
  } catch (err) {
    console.error("Update campaign error:", err);
    res.status(500).json({ error: err.message });
  }
}

export async function archiveCampaign(req, res) {
  try {
    const campaignID = parseInt(req.params.id, 10);
    const { error } = await supabase.from("campaign").update({ camstatusid: 3 }).eq("campaignid", campaignID);
    if (error) throw error;

    res.status(200).json({ message: "Campaign archived successfully!" });
  } catch (err) {
    console.error("Archive campaign error:", err);
    res.status(500).json({ error: err.message });
  }
}

export async function restoreCampaign(req, res) {
  try {
    const campaignID = parseInt(req.params.id, 10);

    const { data: inactiveStatus, error: statusError } = await supabase
      .from("campaignstatus")
      .select("camstatusid")
      .eq("currentstatus", "Inactive")
      .single();
    if (statusError) throw statusError;

    const { error } = await supabase
      .from("campaign")
      .update({ camstatusid: inactiveStatus.camstatusid })
      .eq("campaignid", campaignID);
    if (error) throw error;

    res.status(200).json({ message: "Campaign restored to Inactive!" });
  } catch (err) {
    console.error("Restore campaign error:", err);
    res.status(500).json({ error: err.message });
  }
}

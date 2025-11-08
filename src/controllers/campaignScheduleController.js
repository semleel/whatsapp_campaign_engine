import { supabase } from "../services/supabaseService.js";

export async function autoCheckCampaignStatuses() {
  try {
    const now = new Date();

    const { data: statuses } = await supabase.from("campaignstatus").select("camstatusid, currentstatus");
    const getStatusId = (name) =>
      statuses?.find((s) => s.currentstatus.toLowerCase() === name.toLowerCase())?.camstatusid;

    const activeID = getStatusId("Active");
    const inactiveID = getStatusId("Inactive");
    const onHoldID = getStatusId("On Hold");

    const { data: campaigns, error } = await supabase
      .from("campaign")
      .select(
        `
        campaignid,
        campaignschedule:campaignscheduleid (
          startdate,
          starttime,
          enddate,
          endtime
        ),
        camstatusid
      `,
      )
      .in("camstatusid", [activeID, onHoldID]);

    if (error) throw error;

    for (const c of campaigns || []) {
      if (!c.campaignschedule) continue;

      const start = new Date(`${c.campaignschedule.startdate}T${c.campaignschedule.starttime || "00:00"}+08:00`);
      const end = new Date(`${c.campaignschedule.enddate}T${c.campaignschedule.endtime || "23:59"}+08:00`);

      let newStatus = null;
      if (c.camstatusid === activeID) {
        // Active: when end passed -> Inactive
        if (now > end) newStatus = inactiveID;
      } else if (c.camstatusid === onHoldID) {
        // On Hold: when start reached -> Active; if already past end -> Inactive
        if (now >= start && now <= end) newStatus = activeID;
        else if (now > end) newStatus = inactiveID;
      }

      if (newStatus && newStatus !== c.camstatusid) {
        await supabase.from("campaign").update({ camstatusid: newStatus }).eq("campaignid", c.campaignid);
      }
    }

    console.log("[AutoCheck] Checked Active (to Inactive after end) and On Hold (to Active at start).");
  } catch (err) {
    console.error("[AutoCheck] Error:", err.message);
  }
}

export async function getSchedules(_req, res) {
  try {
    const { data, error } = await supabase
      .from("campaign")
      .select(
        `
        campaignid,
        campaignname,
        objective,
        campaignstatus:camstatusid ( currentstatus ),
        campaignschedule:campaignscheduleid (
          campaignscheduleid,
          startdate,
          starttime,
          enddate,
          endtime,
          timemessage
        )
      `,
      );

    if (error) throw error;

    // Hide archived campaigns from schedule view
    const filtered = (data || []).filter(
      (c) => (c.campaignstatus?.currentstatus || "").toLowerCase() !== "archived"
    );

    const formatted = filtered.map((c) => ({
      campaignid: c.campaignid,
      campaignname: c.campaignname,
      objective: c.objective,
      status: c.campaignstatus?.currentstatus || "Unknown",
      schedule: c.campaignschedule
        ? {
            id: c.campaignschedule.campaignscheduleid,
            startDate: c.campaignschedule.startdate,
            startTime: c.campaignschedule.starttime,
            endDate: c.campaignschedule.enddate,
            endTime: c.campaignschedule.endtime,
            timeMessage: c.campaignschedule.timemessage,
          }
        : null,
    }));

    res.status(200).json(formatted);
  } catch (err) {
    console.error("Fetch schedules error:", err);
    res.status(500).json({ error: err.message });
  }
}

export async function addSchedule(req, res) {
  try {
    const { campaignID, startDate, startTime, endDate, endTime, timeMessage } = req.body;

    if (!campaignID || !startDate || !endDate) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Guard: ensure campaign exists, is not archived, and has no schedule yet
    const { data: campaign, error: campaignError } = await supabase
      .from("campaign")
      .select("campaignid, campaignscheduleid, campaignstatus:camstatusid(currentstatus)")
      .eq("campaignid", campaignID)
      .single();
    if (campaignError) throw campaignError;

    const statusName = (campaign?.campaignstatus?.currentstatus || "").toLowerCase();
    if (statusName === "archived") {
      return res.status(400).json({ error: "Archived campaigns cannot be scheduled." });
    }
    if (campaign?.campaignscheduleid) {
      return res.status(400).json({ error: "Campaign already has a schedule." });
    }

    const { data: scheduleData, error: scheduleError } = await supabase
      .from("campaignschedule")
      .insert([
        {
          startdate: startDate,
          starttime: startTime,
          enddate: endDate,
          endtime: endTime,
          timemessage: timeMessage,
        },
      ])
      .select("campaignscheduleid")
      .single();

    if (scheduleError) throw scheduleError;

    const { data: onHoldStatus } = await supabase
      .from("campaignstatus")
      .select("camstatusid")
      .eq("currentstatus", "On Hold")
      .single();

    await supabase
      .from("campaign")
      .update({
        campaignscheduleid: scheduleData.campaignscheduleid,
        camstatusid: onHoldStatus?.camstatusid || null,
      })
      .eq("campaignid", campaignID);

    res.status(201).json({
      message: "Schedule added successfully and campaign set to On Hold!",
      scheduleId: scheduleData.campaignscheduleid,
    });
  } catch (err) {
    console.error("Add schedule error:", err);
    res.status(500).json({ error: err.message });
  }
}

export async function updateSchedule(req, res) {
  try {
    const scheduleID = parseInt(req.params.id, 10);
    const { startDate, startTime, endDate, endTime, timeMessage } = req.body;

    // Get the owning campaign and its current status
    const { data: campaign, error: campaignError } = await supabase
      .from("campaign")
      .select("campaignid, camstatusid, campaignstatus:camstatusid(currentstatus)")
      .eq("campaignscheduleid", scheduleID)
      .single();
    if (campaignError) throw campaignError;

    const statusName = (campaign?.campaignstatus?.currentstatus || "").toLowerCase();
    if (statusName === "active") {
      return res.status(400).json({ error: "Pause the campaign before editing the schedule." });
    }
    if (statusName === "archived") {
      return res.status(400).json({ error: "Archived campaigns cannot be edited." });
    }

    const updateData = {
      startdate: startDate,
      starttime: startTime,
      enddate: endDate,
      endtime: endTime,
      timemessage: timeMessage,
    };

    const { error } = await supabase
      .from("campaignschedule")
      .update(updateData)
      .eq("campaignscheduleid", scheduleID);
    if (error) throw error;

    // Recalculate status based on new window, regardless of previous (incl. Paused)
    if (campaign) {
      const now = new Date();
      const start = new Date(`${startDate}T${startTime || "00:00"}+08:00`);
      const end = new Date(`${endDate}T${endTime || "23:59"}+08:00`);

      const { data: statuses } = await supabase
        .from("campaignstatus")
        .select("camstatusid, currentstatus");
      const getStatusId = (name) =>
        statuses?.find((s) => s.currentstatus.toLowerCase() === name.toLowerCase())?.camstatusid;

      const activeID = getStatusId("Active");
      const onHoldID = getStatusId("On Hold");
      const inactiveID = getStatusId("Inactive");

      let newStatus = null;
      if (now < start) newStatus = onHoldID;
      else if (now >= start && now <= end) newStatus = activeID;
      else newStatus = inactiveID;

      if (newStatus && newStatus !== campaign.camstatusid) {
        await supabase
          .from("campaign")
          .update({ camstatusid: newStatus })
          .eq("campaignid", campaign.campaignid);
      }
    }

    res.status(200).json({ message: "Schedule updated & status checked!" });
  } catch (err) {
    console.error("Update schedule error:", err);
    res.status(500).json({ error: err.message });
  }
}

export async function pauseCampaign(req, res) {
  try {
    const campaignID = parseInt(req.params.id, 10);

    const { data: pausedStatus } = await supabase
      .from("campaignstatus")
      .select("camstatusid")
      .eq("currentstatus", "Paused")
      .single();

    await supabase.from("campaign").update({ camstatusid: pausedStatus.camstatusid }).eq("campaignid", campaignID);

    res.json({ message: "Campaign paused successfully." });
  } catch (err) {
    console.error("Pause campaign error:", err);
    res.status(500).json({ error: err.message });
  }
}

import express from "express";
import { supabase } from "../../services/supabaseClient.js";

const router = express.Router();

/* ----------------------------------------------
   🟢 AUTO CHECK - Only On Hold campaigns
---------------------------------------------- */
export async function autoCheckCampaignStatuses() {
  try {
    const now = new Date();

    // 1️⃣ Get "On Hold" status ID
    const { data: statuses } = await supabase
      .from("campaignstatus")
      .select("camstatusid, currentstatus");
    const getStatusId = (name) =>
      statuses.find((s) => s.currentstatus.toLowerCase() === name.toLowerCase())?.camstatusid;

    const activeID = getStatusId("Active");
    const inactiveID = getStatusId("Inactive");
    const onHoldID = getStatusId("On Hold");

    // 2️⃣ Only fetch On Hold campaigns
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
      `
      )
      .eq("camstatusid", onHoldID);

    if (error) throw error;

    // 3️⃣ Check and update each campaign
    for (const c of campaigns) {
      if (!c.campaignschedule) continue;

      const start = new Date(`${c.campaignschedule.startdate}T${c.campaignschedule.starttime || "00:00"}+08:00`);
      const end = new Date(`${c.campaignschedule.enddate}T${c.campaignschedule.endtime || "23:59"}+08:00`);

      let newStatus = null;
      if (now >= start && now <= end) newStatus = activeID;
      else if (now > end) newStatus = inactiveID;

      if (newStatus && newStatus !== c.camstatusid) {
        await supabase
          .from("campaign")
          .update({ camstatusid: newStatus })
          .eq("campaignid", c.campaignid);
      }
    }

    console.log("✅ [AutoCheck] Only On Hold campaigns checked successfully.");
  } catch (err) {
    console.error("❌ [AutoCheck] Error:", err.message);
  }
}

/* ----------------------------------------------
   🟢 GET all campaign schedules
---------------------------------------------- */
router.get("/schedules", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("campaign")
      .select(`
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
      `);

    if (error) throw error;

    const formatted = data.map((c) => ({
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
});

/* ----------------------------------------------
   🟢 ADD a new campaign schedule
---------------------------------------------- */
router.post("/add", async (req, res) => {
  try {
    const { campaignID, startDate, startTime, endDate, endTime, timeMessage } = req.body;

    if (!campaignID || !startDate || !endDate)
      return res.status(400).json({ error: "Missing required fields" });

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
      message: "✅ Schedule added successfully and campaign set to On Hold!",
      scheduleId: scheduleData.campaignscheduleid,
    });
  } catch (err) {
    console.error("Add schedule error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ----------------------------------------------
   🟡 UPDATE campaign schedule — also recheck status
---------------------------------------------- */
router.put("/update/:id", async (req, res) => {
  try {
    const scheduleID = parseInt(req.params.id);
    const { startDate, startTime, endDate, endTime, timeMessage } = req.body;

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

    // 🔹 Get campaign linked to this schedule
    const { data: campaign } = await supabase
      .from("campaign")
      .select("campaignid, camstatusid")
      .eq("campaignscheduleid", scheduleID)
      .single();

    if (campaign) {
      // Check what status should be now
      const now = new Date();
      const start = new Date(`${startDate}T${startTime || "00:00"}+08:00`);
      const end = new Date(`${endDate}T${endTime || "23:59"}+08:00`);

      const { data: statuses } = await supabase
        .from("campaignstatus")
        .select("camstatusid, currentstatus");

      const getStatusId = (name) =>
        statuses.find((s) => s.currentstatus.toLowerCase() === name.toLowerCase())?.camstatusid;

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

    res.status(200).json({ message: "✅ Schedule updated & status checked!" });
  } catch (err) {
    console.error("Update schedule error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ----------------------------------------------
   🟠 PAUSE campaign manually
---------------------------------------------- */
router.put("/pause/:id", async (req, res) => {
  try {
    const campaignID = parseInt(req.params.id);

    const { data: pausedStatus } = await supabase
      .from("campaignstatus")
      .select("camstatusid")
      .eq("currentstatus", "Paused")
      .single();

    await supabase
      .from("campaign")
      .update({ camstatusid: pausedStatus.camstatusid })
      .eq("campaignid", campaignID);

    res.json({ message: "✅ Campaign paused successfully." });
  } catch (err) {
    console.error("Pause campaign error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;

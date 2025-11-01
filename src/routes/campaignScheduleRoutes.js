import express from 'express';
import { supabase } from '../../services/supabaseClient.js';

const router = express.Router();

/**
 * AutoCheck the Schedule and start it , update the campaign status 
 */
export async function autoCheckCampaignStatuses() {
  try {
    const now = new Date();

    const { data: campaigns, error } = await supabase
      .from("campaign")
      .select(`
        campaignid,
        campaignschedule:campaignscheduleid (
          startdate,
          starttime,
          enddate,
          endtime
        ),
        camstatusid
      `);

    if (error) throw error;

    const { data: statuses } = await supabase.from("campaignstatus").select("camstatusid, currentstatus");
    const getStatusId = (name) =>
      statuses.find((s) => s.currentstatus.toLowerCase() === name.toLowerCase())?.camstatusid;

    const activeID = getStatusId("Active");
    const inactiveID = getStatusId("Inactive");
    const onHoldID = getStatusId("On Hold");

    for (const c of campaigns) {
      if (!c.campaignschedule) continue;

      const start = new Date(`${c.campaignschedule.startdate}T${c.campaignschedule.starttime || "00:00"}+08:00`);
      const end = new Date(`${c.campaignschedule.enddate}T${c.campaignschedule.endtime || "23:59"}+08:00`);

      let newStatus = null;

      if (now < start) newStatus = onHoldID;
      else if (now >= start && now <= end) newStatus = activeID;
      else if (now > end) newStatus = inactiveID;

      if (newStatus && newStatus !== c.camstatusid) {
        await supabase
          .from("campaign")
          .update({ camstatusid: newStatus })
          .eq("campaignid", c.campaignid);
      }
    }

    console.log("✅ [AutoCheck] Campaign statuses updated successfully.");
  } catch (err) {
    console.error("❌ [AutoCheck] Error checking campaign statuses:", err.message);
  }
  console.log(`[${new Date().toLocaleTimeString()}] Auto check completed.`);
}

/**
 * 🟢 GET All Campaigns with their Schedule (if any)
 * GET /api/schedule
 */
router.get("/schedules", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("campaign")
      .select(`
        campaignid,
        campaignname,
        objective,
        campaignstatus:camstatusid ( currentstatus  ),
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
      status: c.campaignstatus?.currentstatus  || "Unknown",
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

/**
 * 🟢 POST Add a New Schedule
 * POST /api/schedule/add
 */
router.post("/add", async (req, res) => {
  try {
    const { campaignID, startDate, startTime, endDate, endTime, timeMessage } = req.body;

    if (!campaignID || !startDate || !endDate) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Insert into CampaignSchedule
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

    // Find On Hold status ID
    const { data: onHoldStatus } = await supabase
      .from("campaignstatus")
      .select("camstatusid")
      .eq("currentstatus", "On Hold")
      .single();

    // Update Campaign with the schedule + set status On Hold
    const { error: updateError } = await supabase
      .from("campaign")
      .update({
        campaignscheduleid: scheduleData.campaignscheduleid,
        camstatusid: onHoldStatus?.camstatusid || null,
      })
      .eq("campaignid", campaignID);

    if (updateError) throw updateError;

    res.status(201).json({
      message: "✅ Schedule added successfully and campaign set to On Hold!",
      scheduleId: scheduleData.campaignscheduleid,
    });
  } catch (err) {
    console.error("Add schedule error:", err);
    res.status(500).json({ error: err.message });
  }
});


/**
 * 🟢 PUT Update Existing Schedule
 * PUT /api/schedule/update/:id
 */
router.put('/update/:id', async (req, res) => {
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
      .from('campaignschedule')
      .update(updateData)
      .eq('campaignscheduleid', scheduleID);

    if (error) throw error;

    res.status(200).json({ message: '✅ Schedule updated successfully!' });
  } catch (err) {
    console.error('Update schedule error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put("/check-status", async (req, res) => {
  try {
    const now = new Date();

    // Fetch all campaigns with schedules
    const { data: campaigns, error } = await supabase
      .from("campaign")
      .select(`
        campaignid,
        campaignschedule:campaignscheduleid (
          startdate,
          starttime,
          enddate,
          endtime
        ),
        camstatusid
      `);

    if (error) throw error;

    // Get status IDs
    const { data: statuses } = await supabase.from("campaignstatus").select("camstatusid, currentstatus");
    const getStatusId = (name) => statuses.find((s) => s.currentstatus.toLowerCase() === name.toLowerCase())?.camstatusid;

    const activeID = getStatusId("Active");
    const inactiveID = getStatusId("Inactive");
    const onHoldID = getStatusId("On Hold");

    for (const c of campaigns) {
      if (!c.campaignschedule) continue;

     const start = new Date(`${c.campaignschedule.startdate}T${c.campaignschedule.starttime || "00:00"}+08:00`);
const end = new Date(`${c.campaignschedule.enddate}T${c.campaignschedule.endtime || "23:59"}+08:00`);

      let newStatus = null;

      if (now < start) newStatus = onHoldID;
      else if (now >= start && now <= end) newStatus = activeID;
      else if (now > end) newStatus = inactiveID;

      if (newStatus && newStatus !== c.camstatusid) {
        await supabase
          .from("campaign")
          .update({ camstatusid: newStatus })
          .eq("campaignid", c.campaignid);
      }
    }

    res.json({ message: "✅ Campaign statuses updated based on current time." });
  } catch (err) {
    console.error("Check status error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;

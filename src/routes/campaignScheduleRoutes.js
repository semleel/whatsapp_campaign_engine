import express from 'express';
import { supabase } from '../../services/supabaseClient.js';

const router = express.Router();

/**
 * 🟢 GET All Campaigns with their Schedule (if any)
 * GET /api/schedule
 */
router.get('/schedules', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('campaign')
      .select(`
        campaignid,
        campaignname,
        objective,
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
      schedule: c.campaignschedule ? {
        id: c.campaignschedule.campaignscheduleid,
        startDate: c.campaignschedule.startdate,
        startTime: c.campaignschedule.starttime,
        endDate: c.campaignschedule.enddate,
        endTime: c.campaignschedule.endtime,
        timeMessage: c.campaignschedule.timemessage,
      } : null,
    }));

    res.status(200).json(formatted);
  } catch (err) {
    console.error('Fetch schedules error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 🟢 POST Add a New Schedule
 * POST /api/schedule/add
 */
router.post('/add', async (req, res) => {
  try {
    const { campaignID, startDate, startTime, endDate, endTime, timeMessage } = req.body;

    if (!campaignID || !startDate || !endDate) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const { data: scheduleData, error: scheduleError } = await supabase
      .from('campaignschedule')
      .insert([{ startdate: startDate, starttime: startTime, enddate: endDate, endtime: endTime, timemessage: timeMessage }])
      .select('campaignscheduleid')
      .single();

    if (scheduleError) throw scheduleError;

    const { error: updateError } = await supabase
      .from('campaign')
      .update({ campaignscheduleid: scheduleData.campaignscheduleid })
      .eq('campaignid', campaignID);

    if (updateError) throw updateError;

    res.status(201).json({
      message: '✅ Schedule added successfully!',
      scheduleId: scheduleData.campaignscheduleid,
    });
  } catch (err) {
    console.error('Add schedule error:', err);
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

export default router;

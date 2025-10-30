import express from 'express';
import { supabase } from '../../services/supabaseClient.js';

const router = express.Router();

/**
 * CREATE Campaign
 * POST /api/campaign/create
 */
router.post('/create', async (req, res) => {
  try {
    const {
      campaignName,
      objective,
      targetRegionID,
      userFlowID,
      camStatusID,
      campaignScheduleID
    } = req.body;

    // Convert numeric IDs (important to fix "invalid input syntax for type integer")
    const insertData = {
      campaignname: campaignName,
      objective,
      targetregionid: targetRegionID ? parseInt(targetRegionID) : null,
      userflowid: userFlowID ? parseInt(userFlowID) : null,
      camstatusid: camStatusID ? parseInt(camStatusID) : null,
      campaignscheduleid: campaignScheduleID
        ? parseInt(campaignScheduleID)
        : null
    };

    const { data, error } = await supabase
      .from('campaign')
      .insert([insertData])
      .select();

    if (error) throw error;

    res.status(201).json({
      message: '✅ Campaign created successfully!',
      data
    });
  } catch (err) {
    console.error('Create error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * READ All Campaigns (with JOIN)
 * GET /api/campaign/list
 */
router.get('/list', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('campaign')
      .select(`
        campaignid,
        campaignname,
        objective,
        targetregion:targetregionid (regionname),
        userflow:userflowid (userflowname),
        campaignstatus:camstatusid (currentstatus)
      `);

    if (error) throw error;

    // Flatten nested objects for UI
    const formatted = data.map((c) => ({
      campaignid: c.campaignid,
      campaignname: c.campaignname,
      objective: c.objective,
      regionname: c.targetregion?.regionname || 'N/A',
      userflowname: c.userflow?.userflowname || 'N/A',
      currentstatus: c.campaignstatus?.currentstatus || 'N/A'
    }));

    res.status(200).json(formatted);
  } catch (err) {
    console.error('Fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * ARCHIVE Campaign
 * PUT /api/campaign/archive/:id
 */
router.put('/archive/:id', async (req, res) => {
  try {
    const campaignID = parseInt(req.params.id);

    const { error } = await supabase
      .from('campaign')
      .update({ camstatusid: 4 }) // assuming 4 = "Archived" in your campaignstatus table
      .eq('campaignid', campaignID);

    if (error) throw error;

    res.status(200).json({ message: '📦 Campaign archived successfully!' });
  } catch (err) {
    console.error('Archive error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;

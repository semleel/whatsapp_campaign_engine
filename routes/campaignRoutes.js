import express from 'express';
import { supabase } from '../config/supabaseClient.js';

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

    const { data, error } = await supabase
      .from('campaign')
      .insert([
        {
          campaignname: campaignName,
          objective: objective,
          targetregionid: targetRegionID,
          userflowid: userFlowID,
          camstatusid: camStatusID,
          campaignscheduleid: campaignScheduleID
        }
      ])
      .select();

    if (error) throw error;

    res.status(201).json({
      message: '✅ Campaign created successfully!',
      data: data
    });
  } catch (err) {
    console.error('Create error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * READ All Campaigns
 * GET /api/campaign/all
 */
router.get('/all', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('campaign')
      .select(`
        campaignid,p
        campaignname,
        objective,
        targetregionid,
        userflowid,
        camstatusid
        campaignscheduleid
      `);

    if (error) throw error;

    res.status(200).json({
      message: '📋 All campaigns fetched successfully!',
      total: data.length,
      data: data
    });
  } catch (err) {
    console.error('Fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;

import express from 'express';
import { supabase } from '../../services/supabaseClient.js';

const router = express.Router();

/**
 * CREATE Campaign
 * POST /api/campaign/create
 */
router.post('/create', async (req, res) => {
  try {
    const { campaignName, objective, targetRegionID, userFlowID, campaignScheduleID } = req.body;

    const insertData = {
      campaignname: campaignName,
      objective,
      targetregionid: targetRegionID ? parseInt(targetRegionID) : null,
      userflowid: userFlowID ? parseInt(userFlowID) : null,
      // camstatusid is now handled by Supabase default (NEW)
      campaignscheduleid: campaignScheduleID ? parseInt(campaignScheduleID) : null,
    };

    const { data, error } = await supabase
      .from('campaign')
      .insert([insertData])
      .select();

    if (error) throw error;

    res.status(201).json({
      message: 'Campaign created successfully!',
      data,
    });
  } catch (err) {
    console.error('Create error:', err);
    res.status(500).json({ error: err.message });
  }
});


/**
 * READ All Campaigns
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
        campaignstatus:camstatusid (currentstatus),
        camstatusid
      `)
      .neq('camstatusid', 3); // ✅ Exclude Archived campaigns

    if (error) throw error;

    const formatted = data.map((c) => ({
      campaignid: c.campaignid,
      campaignname: c.campaignname,
      objective: c.objective,
      regionname: c.targetregion?.regionname || 'N/A',
      userflowname: c.userflow?.userflowname || 'N/A',
      currentstatus: c.campaignstatus?.currentstatus || 'N/A',
      camstatusid: c.camstatusid,
    }));

    res.status(200).json(formatted);
  } catch (err) {
    console.error('Fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});


router.get('/archive', async (req, res) => {
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
      `)
      .eq('camstatusid', 3);

    if (error) throw error;

    const formatted = data.map((c) => ({
      campaignid: c.campaignid,
      campaignname: c.campaignname,
      objective: c.objective,
      regionname: c.targetregion?.regionname || 'N/A',
      userflowname: c.userflow?.userflowname || 'N/A',
      currentstatus: c.campaignstatus?.currentstatus || 'Archived'
    }));

    res.status(200).json(formatted);
  } catch (err) {
    console.error('Fetch archived campaigns error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * READ Single Campaign
 * GET /api/campaign/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const campaignID = parseInt(req.params.id);

    const { data, error } = await supabase
      .from('campaign')
      .select('*')
      .eq('campaignid', campaignID)
      .single();

    if (error) throw error;

    res.status(200).json(data);
  } catch (err) {
    console.error('Fetch single error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * UPDATE Campaign
 * PUT /api/campaign/update/:id
 */
router.put('/update/:id', async (req, res) => {
  try {
    const campaignID = parseInt(req.params.id);
    const {
      campaignName,
      objective,
      targetRegionID,
      userFlowID,
      camStatusID,
      campaignScheduleID
    } = req.body;

    const updateData = {
      campaignname: campaignName,
      objective,
      targetregionid: targetRegionID ? parseInt(targetRegionID) : null,
      userflowid: userFlowID ? parseInt(userFlowID) : null,
      camstatusid: camStatusID ? parseInt(camStatusID) : null,
      campaignscheduleid: campaignScheduleID
        ? parseInt(campaignScheduleID)
        : null
    };

    const { error } = await supabase
      .from('campaign')
      .update(updateData)
      .eq('campaignid', campaignID);

    if (error) throw error;

    res.status(200).json({ message: 'Campaign updated successfully!' });
  } catch (err) {
    console.error('Update error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * READ Archived Campaigns
 * GET /api/campaign/archive
 */

/**
 * ARCHIVE Campaign
 * PUT /api/campaign/archive/:id
 */
router.put('/archive/:id', async (req, res) => {
  try {
    const campaignID = parseInt(req.params.id);
    console.log('Archiving campaign ID:', campaignID);

    const { error } = await supabase
      .from('campaign')
      .update({ camstatusid: 3 })
      .eq('campaignid', campaignID);

    if (error) {
      console.error('Supabase update error:', error);
      throw error;
    }

    console.log('Campaign updated in DB.');
    res.status(200).json({ message: 'Campaign archived successfully!' });
  } catch (err) {
    console.error('Archive error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * RESTORE Archived Campaign
 * PUT /api/campaign/restore/:id
 */
router.put('/restore/:id', async (req, res) => {
  try {
    const campaignID = parseInt(req.params.id);
    console.log('Restoring campaign ID:', campaignID);

    // Get the Inactive status ID
    const { data: inactiveStatus, error: statusError } = await supabase
      .from('campaignstatus')
      .select('camstatusid')
      .eq('currentstatus', 'Inactive')
      .single();

    if (statusError) throw statusError;

    // Update campaign to Inactive
    const { error } = await supabase
      .from('campaign')
      .update({ camstatusid: inactiveStatus.camstatusid })
      .eq('campaignid', campaignID);

    if (error) throw error;

    res.status(200).json({ message: '♻️ Campaign restored to Inactive!' });
  } catch (err) {
    console.error('Restore error:', err);
    res.status(500).json({ error: err.message });
  }
});



export default router;

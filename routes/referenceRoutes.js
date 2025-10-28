import express from 'express';
import { supabase } from '../config/supabaseClient.js';

const router = express.Router();

/**
 * GET /api/reference/regions
 * Fetch all target regions
 */
router.get('/regions', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('targetregion')
      .select('regionid, regionname');

    if (error) throw error;

    res.status(200).json(data);
  } catch (err) {
    console.error('Error fetching regions:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/reference/userflows
 * Fetch all user flows
 */
router.get('/userflows', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('userflow')
      .select('userflowid, userflowname');

    if (error) throw error;

    res.status(200).json(data);
  } catch (err) {
    console.error('Error fetching user flows:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;

import express from 'express';
import { supabase } from '../../services/supabaseClient.js';

const router = express.Router();

/**
 * CREATE Template (Content)
 * POST /api/template/create
 */
router.post('/create', async (req, res) => {
  try {
    const {
      title,
      type,
      category,
      status = 'Draft',
      defaultLang,
      description = '',
      mediaUrl = null
    } = req.body || {};

    if (!title || !type || !defaultLang) {
      return res.status(400).json({ error: 'title, type and defaultLang are required' });
    }

    const now = new Date().toISOString();

    const insertData = {
      title,
      type,
      category: category || null,
      status,
      defaultlang: defaultLang,
      description,
      mediaurl: mediaUrl,
      currentversion: null,
      lastupdated: now,
      createdat: now,
      updatedat: now,
      isdeleted: false,
      deletedat: null
    };

    const { data, error } = await supabase
      .from('content')
      .insert([insertData])
      .select();

    if (error) throw error;

    return res.status(201).json({
      message: 'Template created successfully',
      data: data?.[0] || null
    });
  } catch (err) {
    console.error('Template create error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * LIST Templates (basic fields)
 * GET /api/template/list
 */
router.get('/list', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('content')
      .select('contentid, title, type, status, defaultlang, category, currentversion, updatedat, lastupdated')
      .eq('isdeleted', false)
      .order('updatedat', { ascending: false });

    if (error) throw error;

    return res.status(200).json(data || []);
  } catch (err) {
    console.error('Template list error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET Single Template
 * GET /api/template/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid template id' });
    }

    const { data, error } = await supabase
      .from('content')
      .select('*')
      .eq('contentid', id)
      .single();

    if (error) throw error;

    return res.status(200).json(data);
  } catch (err) {
    console.error('Template get error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * CREATE Version for a Content
 * POST /api/template/:contentId/version
 * body: { changeNote?, createdBy?, versionNo?, setCurrent? }
 */
router.post('/:contentId/version', async (req, res) => {
  try {
    const contentId = parseInt(req.params.contentId);
    if (Number.isNaN(contentId)) return res.status(400).json({ error: 'Invalid content id' });

    const { changeNote = '', createdBy = 'system', versionNo, setCurrent = true } = req.body || {};
    const now = new Date().toISOString();

    let nextVersionNo = versionNo;
    if (!nextVersionNo) {
      const { data: last, error: lastErr } = await supabase
        .from('templateversion')
        .select('versionno')
        .eq('contentid', contentId)
        .order('versionno', { ascending: false })
        .limit(1);
      if (lastErr) throw lastErr;
      nextVersionNo = (last && last[0]?.versionno ? last[0].versionno : 0) + 1;
    }

    const { data, error } = await supabase
      .from('templateversion')
      .insert([{ contentid: contentId, versionno: nextVersionNo, changenote: changeNote, createdby: createdBy, createdat: now }])
      .select();
    if (error) throw error;

    if (setCurrent) {
      const { error: updErr } = await supabase
        .from('content')
        .update({ currentversion: nextVersionNo, updatedat: now, lastupdated: now })
        .eq('contentid', contentId);
      if (updErr) throw updErr;
    }

    return res.status(201).json({ message: 'Version created', version: data?.[0] || null });
  } catch (err) {
    console.error('Create version error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * LIST Versions
 * GET /api/template/:contentId/versions
 */
router.get('/:contentId/versions', async (req, res) => {
  try {
    const contentId = parseInt(req.params.contentId);
    if (Number.isNaN(contentId)) return res.status(400).json({ error: 'Invalid content id' });

    const { data, error } = await supabase
      .from('templateversion')
      .select('*')
      .eq('contentid', contentId)
      .order('versionno', { ascending: false });
    if (error) throw error;
    return res.status(200).json(data || []);
  } catch (err) {
    console.error('List versions error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * CREATE Variant
 * POST /api/template/:contentId/variant
 * body: { versionNo?, lang, body, placeholders }
 */
router.post('/:contentId/variant', async (req, res) => {
  try {
    const contentId = parseInt(req.params.contentId);
    if (Number.isNaN(contentId)) return res.status(400).json({ error: 'Invalid content id' });
    const { versionNo, lang, body, placeholders } = req.body || {};
    if (!lang || !body) return res.status(400).json({ error: 'lang and body are required' });

    // Resolve version
    let useVersion = versionNo;
    if (!useVersion) {
      const { data: content, error: contErr } = await supabase
        .from('content')
        .select('currentversion, defaultlang')
        .eq('contentid', contentId)
        .single();
      if (contErr) throw contErr;
      if (content?.currentversion) useVersion = content.currentversion;
      else {
        // fallback to latest existing version or create v1
        const { data: last, error: lastErr } = await supabase
          .from('templateversion')
          .select('versionno')
          .eq('contentid', contentId)
          .order('versionno', { ascending: false })
          .limit(1);
        if (lastErr) throw lastErr;
        useVersion = last?.[0]?.versionno || 1;
        if (!last?.length) {
          const now = new Date().toISOString();
          const { error: vErr } = await supabase
            .from('templateversion')
            .insert([{ contentid: contentId, versionno: useVersion, changenote: 'Initial', createdby: 'system', createdat: now }]);
          if (vErr) throw vErr;
          await supabase.from('content').update({ currentversion: useVersion, updatedat: now }).eq('contentid', contentId);
        }
      }
    }

    const { data, error } = await supabase
      .from('templatevariant')
      .insert([{ contentid: contentId, versionno: useVersion, lang, body, placeholders }])
      .select();
    if (error) throw error;
    return res.status(201).json({ message: 'Variant created', variant: data?.[0] || null });
  } catch (err) {
    console.error('Create variant error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * LIST Variants by Content and Version
 * GET /api/template/:contentId/variants?versionNo=...
 */
router.get('/:contentId/variants', async (req, res) => {
  try {
    const contentId = parseInt(req.params.contentId);
    if (Number.isNaN(contentId)) return res.status(400).json({ error: 'Invalid content id' });
    const versionNo = req.query.versionNo ? parseInt(String(req.query.versionNo)) : undefined;

    let versionFilter = versionNo;
    if (!versionFilter) {
      const { data: content, error: contErr } = await supabase
        .from('content')
        .select('currentversion')
        .eq('contentid', contentId)
        .single();
      if (contErr) throw contErr;
      versionFilter = content?.currentversion || undefined;
    }

    let query = supabase
      .from('templatevariant')
      .select('variantid, contentid, versionno, lang, body, placeholders')
      .eq('contentid', contentId);
    if (versionFilter) query = query.eq('versionno', versionFilter);

    const { data, error } = await query;
    if (error) throw error;
    return res.status(200).json(data || []);
  } catch (err) {
    console.error('List variants error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * UPDATE Variant
 * PUT /api/template/variant/:variantId
 */
router.put('/variant/:variantId', async (req, res) => {
  try {
    const variantId = parseInt(req.params.variantId);
    if (Number.isNaN(variantId)) return res.status(400).json({ error: 'Invalid variant id' });
    const { body, placeholders, lang } = req.body || {};

    const update = {};
    if (typeof body === 'string') update.body = body;
    if (typeof lang === 'string') update.lang = lang;
    if (placeholders !== undefined) update.placeholders = placeholders;
    if (Object.keys(update).length === 0) return res.status(400).json({ error: 'No fields to update' });

    const { error } = await supabase
      .from('templatevariant')
      .update(update)
      .eq('variantid', variantId);
    if (error) throw error;
    return res.status(200).json({ message: 'Variant updated' });
  } catch (err) {
    console.error('Update variant error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * APPROVAL record for Content
 * POST /api/template/:contentId/approve
 * body: { status, approverId, remarks }
 */
router.post('/:contentId/approve', async (req, res) => {
  try {
    const contentId = parseInt(req.params.contentId);
    if (Number.isNaN(contentId)) return res.status(400).json({ error: 'Invalid content id' });
    const { status, approverId = 'system', remarks = '' } = req.body || {};
    if (!status) return res.status(400).json({ error: 'status is required' });

    const now = new Date().toISOString();
    const record = {
      contentid: contentId,
      status,
      approverid: String(approverId),
      requestedat: now,
      approvedat: null,
      rejectedat: null,
      remarks,
    };
    if (status.toLowerCase() === 'approved') record.approvedat = now;
    if (status.toLowerCase() === 'rejected') record.rejectedat = now;

    const { data, error } = await supabase
      .from('approvalrecord')
      .insert([record])
      .select();
    if (error) throw error;

    // Optionally update Content.status
    if (status.toLowerCase() === 'approved') {
      await supabase.from('content').update({ status: 'Active', updatedat: now }).eq('contentid', contentId);
    }

    return res.status(201).json({ message: 'Approval recorded', approval: data?.[0] || null });
  } catch (err) {
    console.error('Approval error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * LIST Approval records
 * GET /api/template/:contentId/approvals
 */
router.get('/:contentId/approvals', async (req, res) => {
  try {
    const contentId = parseInt(req.params.contentId);
    if (Number.isNaN(contentId)) return res.status(400).json({ error: 'Invalid content id' });
    const { data, error } = await supabase
      .from('approvalrecord')
      .select('*')
      .eq('contentid', contentId)
      .order('approvalrecordid', { ascending: false });
    if (error) throw error;
    return res.status(200).json(data || []);
  } catch (err) {
    console.error('List approvals error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * SET current version
 * POST /api/template/:contentId/version/current { versionNo }
 */
router.post('/:contentId/version/current', async (req, res) => {
  try {
    const contentId = parseInt(req.params.contentId);
    const versionNo = parseInt(req.body?.versionNo);
    if (Number.isNaN(contentId) || Number.isNaN(versionNo)) return res.status(400).json({ error: 'Invalid ids' });
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('content')
      .update({ currentversion: versionNo, updatedat: now })
      .eq('contentid', contentId);
    if (error) throw error;
    return res.status(200).json({ message: 'Current version updated' });
  } catch (err) {
    console.error('Set current version error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * LIST Active Templates (non-deleted, not expired)
 * GET /api/template/active
 */
router.get('/active', async (_req, res) => {
  try {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from('content')
      .select('contentid, title, type, status, defaultlang, category, currentversion, updatedat, lastupdated, expiresat')
      .eq('isdeleted', false)
      .or(`expiresat.is.null,expiresat.gt.${nowIso}`)
      .order('updatedat', { ascending: false });
    if (error) throw error;
    return res.status(200).json(data || []);
  } catch (err) {
    console.error('Active template list error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * EXPIRE a template (schedule expiry)
 * POST /api/template/:contentId/expire { expiresAt }
 * - Sets content.expiresat to a timestamp (ISO string).
 * - If expiresAt is in the past, optionally mark status as 'Expired'.
 */
router.post('/:contentId/expire', async (req, res) => {
  try {
    const contentId = parseInt(req.params.contentId);
    if (Number.isNaN(contentId)) return res.status(400).json({ error: 'Invalid content id' });

    const raw = req.body?.expiresAt;
    if (!raw) return res.status(400).json({ error: 'expiresAt is required (ISO timestamp)' });
    const expiresAt = new Date(String(raw));
    if (Number.isNaN(expiresAt.getTime())) return res.status(400).json({ error: 'expiresAt must be a valid date/time' });

    const now = new Date();
    const payload = { expiresat: expiresAt.toISOString(), updatedat: new Date().toISOString() };
    if (expiresAt.getTime() <= now.getTime()) {
      payload.status = 'Expired';
    }

    const { error } = await supabase
      .from('content')
      .update(payload)
      .eq('contentid', contentId);
    if (error) throw error;

    return res.status(200).json({ message: 'Expiry scheduled', expiresAt: payload.expiresat });
  } catch (err) {
    console.error('Expire template error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * SOFT DELETE a template
 * POST /api/template/:contentId/delete
 * - Sets isdeleted=true and deletedat=now
 */
router.post('/:contentId/delete', async (req, res) => {
  try {
    const contentId = parseInt(req.params.contentId);
    if (Number.isNaN(contentId)) return res.status(400).json({ error: 'Invalid content id' });

    const now = new Date().toISOString();
    const { error } = await supabase
      .from('content')
      .update({ isdeleted: true, deletedat: now, updatedat: now })
      .eq('contentid', contentId);
    if (error) throw error;

    return res.status(200).json({ message: 'Template soft-deleted' });
  } catch (err) {
    console.error('Soft delete error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * LIST Tags for a template
 * GET /api/template/:contentId/tags
 */
router.get('/:contentId/tags', async (req, res) => {
  try {
    const contentId = parseInt(req.params.contentId);
    if (Number.isNaN(contentId)) return res.status(400).json({ error: 'Invalid content id' });

    // Join contenttag -> tag to get names
    const { data, error } = await supabase
      .from('contenttag')
      .select('tagid, tag:tagid(name)')
      .eq('contentid', contentId);
    if (error) throw error;

    const tags = (data || []).map(r => ({ tagid: r.tagid, name: r.tag?.name })).filter(t => t.name);
    return res.status(200).json(tags);
  } catch (err) {
    console.error('List tags error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * SET/REPLACE Tags for a template
 * POST /api/template/:contentId/tags { tags: string[] }
 * - Ensures Tag rows exist, replaces ContentTag mappings for the content
 */
router.post('/:contentId/tags', async (req, res) => {
  try {
    const contentId = parseInt(req.params.contentId);
    if (Number.isNaN(contentId)) return res.status(400).json({ error: 'Invalid content id' });
    let tags = req.body?.tags;
    if (!Array.isArray(tags)) return res.status(400).json({ error: 'tags must be an array of strings' });
    tags = tags.map((t) => String(t).trim()).filter(Boolean);

    // Load existing tag ids
    let existing = [];
    if (tags.length) {
      const { data: ex, error: exErr } = await supabase
        .from('tag')
        .select('tagid, name')
        .in('name', tags);
      if (exErr) throw exErr;
      existing = ex || [];
    }

    const existingNames = new Set(existing.map((r) => r.name));
    const toCreate = tags.filter((n) => !existingNames.has(n));

    let created = [];
    if (toCreate.length) {
      const { data: ins, error: insErr } = await supabase
        .from('tag')
        .insert(toCreate.map((name) => ({ name })))
        .select('tagid, name');
      if (insErr) throw insErr;
      created = ins || [];
    }

    const allTags = [...existing, ...created];
    const tagIds = allTags.map((r) => r.tagid);

    // Replace contenttag mappings
    // 1) delete all existing mappings for content
    const { error: delErr } = await supabase
      .from('contenttag')
      .delete()
      .eq('contentid', contentId);
    if (delErr) throw delErr;

    // 2) insert new mappings (if any)
    if (tagIds.length) {
      const rows = tagIds.map((tid) => ({ contentid: contentId, tagid: tid }));
      const { error: mapErr } = await supabase.from('contenttag').insert(rows);
      if (mapErr) throw mapErr;
    }

    return res.status(200).json({ message: 'Tags updated', tags: allTags });
  } catch (err) {
    console.error('Update tags error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * RENDER resolver (select variant by lang/version with fallback)
 * GET /api/template/:contentId/render?lang=en&versionNo=1
 */
router.get('/:contentId/render', async (req, res) => {
  try {
    const contentId = parseInt(req.params.contentId);
    if (Number.isNaN(contentId)) return res.status(400).json({ error: 'Invalid content id' });
    const reqLang = (req.query.lang ? String(req.query.lang) : '').toLowerCase();
    const qVersion = req.query.versionNo ? parseInt(String(req.query.versionNo)) : undefined;

    const { data: content, error: cErr } = await supabase
      .from('content')
      .select('contentid, title, defaultlang, currentversion')
      .eq('contentid', contentId)
      .single();
    if (cErr) throw cErr;
    if (!content) return res.status(404).json({ error: 'Content not found' });

    let useVersion = qVersion || content.currentversion || undefined;
    if (!useVersion) {
      const { data: last, error: lastErr } = await supabase
        .from('templateversion')
        .select('versionno')
        .eq('contentid', contentId)
        .order('versionno', { ascending: false })
        .limit(1);
      if (lastErr) throw lastErr;
      useVersion = last?.[0]?.versionno;
    }

    const langs = [];
    if (reqLang) langs.push(reqLang);
    if (!langs.includes(content.defaultlang)) langs.push(content.defaultlang);

    let found = null;
    for (const L of langs) {
      let query = supabase
        .from('templatevariant')
        .select('variantid, contentid, versionno, lang, body, placeholders')
        .eq('contentid', contentId)
        .eq('lang', L);
      if (useVersion) query = query.eq('versionno', useVersion);
      const { data, error } = await query.limit(1);
      if (error) throw error;
      if (data && data[0]) { found = data[0]; break; }
    }

    if (!found) return res.status(404).json({ error: 'No variant found for requested/default language' });
    return res.status(200).json({ content, variant: found });
  } catch (err) {
    console.error('Render resolve error:', err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;

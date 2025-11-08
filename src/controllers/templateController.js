import { supabase } from "../services/supabaseService.js";

export async function createTemplate(req, res) {
  try {
    const {
      title,
      type,
      category,
      status = "Draft",
      defaultLang,
      description = "",
      mediaUrl = null,
    } = req.body || {};

    if (!title || !type || !defaultLang) {
      return res.status(400).json({ error: "title, type and defaultLang are required" });
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
      deletedat: null,
    };

    const { data, error } = await supabase.from("content").insert([insertData]).select();
    if (error) throw error;

    return res.status(201).json({ message: "Template created successfully", data: data?.[0] || null });
  } catch (err) {
    console.error("Template create error:", err);
    return res.status(500).json({ error: err.message });
  }
}

export async function listTemplates(_req, res) {
  try {
    const { data, error } = await supabase
      .from("content")
      .select("contentid, title, type, status, defaultlang, category, currentversion, updatedat, lastupdated")
      .eq("isdeleted", false)
      .order("updatedat", { ascending: false });
    if (error) throw error;
    return res.status(200).json(data || []);
  } catch (err) {
    console.error("Template list error:", err);
    return res.status(500).json({ error: err.message });
  }
}

export async function getTemplate(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: "Invalid template id" });
    }

    const { data, error } = await supabase.from("content").select("*").eq("contentid", id).single();
    if (error) throw error;

    return res.status(200).json(data);
  } catch (err) {
    console.error("Template get error:", err);
    return res.status(500).json({ error: err.message });
  }
}

export async function createTemplateVersion(req, res) {
  try {
    const contentId = parseInt(req.params.contentId, 10);
    if (Number.isNaN(contentId)) return res.status(400).json({ error: "Invalid content id" });

    const { changeNote = "", createdBy = "system", versionNo, setCurrent = true } = req.body || {};
    const now = new Date().toISOString();

    let nextVersionNo = versionNo;
    if (!nextVersionNo) {
      const { data: last, error: lastErr } = await supabase
        .from("templateversion")
        .select("versionno")
        .eq("contentid", contentId)
        .order("versionno", { ascending: false })
        .limit(1);
      if (lastErr) throw lastErr;
      nextVersionNo = (last?.[0]?.versionno || 0) + 1;
    }

    const insertData = {
      contentid: contentId,
      versionno: nextVersionNo,
      changenote: changeNote,
      createdby: createdBy,
      createdat: now,
    };

    const { data, error } = await supabase.from("templateversion").insert([insertData]).select().single();
    if (error) throw error;

    if (setCurrent) {
      const { error: updateErr } = await supabase
        .from("content")
        .update({ currentversion: nextVersionNo, updatedat: now })
        .eq("contentid", contentId);
      if (updateErr) throw updateErr;
    }

    return res.status(201).json({ message: "Version created", version: data });
  } catch (err) {
    console.error("Create version error:", err);
    return res.status(500).json({ error: err.message });
  }
}

export async function listTemplateVersions(req, res) {
  try {
    const contentId = parseInt(req.params.contentId, 10);
    if (Number.isNaN(contentId)) return res.status(400).json({ error: "Invalid content id" });

    const { data, error } = await supabase
      .from("templateversion")
      .select("templateversionid, contentid, versionno, changenote, createdby, createdat")
      .eq("contentid", contentId)
      .order("versionno", { ascending: false });
    if (error) throw error;
    return res.status(200).json(data || []);
  } catch (err) {
    console.error("Version list error:", err);
    return res.status(500).json({ error: err.message });
  }
}

export async function addVariant(req, res) {
  try {
    const contentId = parseInt(req.params.contentId, 10);
    if (Number.isNaN(contentId)) return res.status(400).json({ error: "Invalid content id" });

    const { versionNo, lang = "en", body = "", placeholders = [] } = req.body || {};
    if (!versionNo) return res.status(400).json({ error: "versionNo is required" });

    const insertData = {
      contentid: contentId,
      versionno: parseInt(versionNo, 10),
      lang,
      body,
      placeholders,
    };

    const { data, error } = await supabase.from("templatevariant").insert([insertData]).select().single();
    if (error) throw error;
    return res.status(201).json({ message: "Variant added", variant: data });
  } catch (err) {
    console.error("Add variant error:", err);
    return res.status(500).json({ error: err.message });
  }
}

export async function listVariants(req, res) {
  try {
    const contentId = parseInt(req.params.contentId, 10);
    if (Number.isNaN(contentId)) return res.status(400).json({ error: "Invalid content id" });
    const versionNo = req.query.versionNo ? parseInt(String(req.query.versionNo), 10) : undefined;

    let query = supabase
      .from("templatevariant")
      .select("variantid, contentid, versionno, lang, body, placeholders")
      .eq("contentid", contentId);
    if (versionNo) query = query.eq("versionno", versionNo);

    const { data, error } = await query.order("variantid", { ascending: false });
    if (error) throw error;
    return res.status(200).json(data || []);
  } catch (err) {
    console.error("List variants error:", err);
    return res.status(500).json({ error: err.message });
  }
}

export async function updateVariant(req, res) {
  try {
    const variantId = parseInt(req.params.variantId, 10);
    if (Number.isNaN(variantId)) return res.status(400).json({ error: "Invalid variant id" });

    const { lang, body, placeholders } = req.body || {};
    const updateData = {};
    if (lang) updateData.lang = lang;
    if (body) updateData.body = body;
    if (placeholders) updateData.placeholders = placeholders;

    const { error } = await supabase.from("templatevariant").update(updateData).eq("variantid", variantId);
    if (error) throw error;

    return res.status(200).json({ message: "Variant updated" });
  } catch (err) {
    console.error("Variant update error:", err);
    return res.status(500).json({ error: err.message });
  }
}

export async function approveTemplate(req, res) {
  try {
    const contentId = parseInt(req.params.contentId, 10);
    if (Number.isNaN(contentId)) return res.status(400).json({ error: "Invalid content id" });

    const { status = "approved", approverId = "system", remarks = "" } = req.body || {};
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
    if (status.toLowerCase() === "approved") record.approvedat = now;
    if (status.toLowerCase() === "rejected") record.rejectedat = now;

    const { data, error } = await supabase.from("approvalrecord").insert([record]).select();
    if (error) throw error;

    if (status.toLowerCase() === "approved") {
      await supabase.from("content").update({ status: "Active", updatedat: now }).eq("contentid", contentId);
    }

    return res.status(201).json({ message: "Approval recorded", approval: data?.[0] || null });
  } catch (err) {
    console.error("Approval error:", err);
    return res.status(500).json({ error: err.message });
  }
}

export async function listApprovals(req, res) {
  try {
    const contentId = parseInt(req.params.contentId, 10);
    if (Number.isNaN(contentId)) return res.status(400).json({ error: "Invalid content id" });
    const { data, error } = await supabase
      .from("approvalrecord")
      .select("*")
      .eq("contentid", contentId)
      .order("approvalrecordid", { ascending: false });
    if (error) throw error;
    return res.status(200).json(data || []);
  } catch (err) {
    console.error("List approvals error:", err);
    return res.status(500).json({ error: err.message });
  }
}

export async function setCurrentVersion(req, res) {
  try {
    const contentId = parseInt(req.params.contentId, 10);
    const versionNo = parseInt(req.body?.versionNo, 10);
    if (Number.isNaN(contentId) || Number.isNaN(versionNo)) return res.status(400).json({ error: "Invalid ids" });
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("content")
      .update({ currentversion: versionNo, updatedat: now })
      .eq("contentid", contentId);
    if (error) throw error;
    return res.status(200).json({ message: "Current version updated" });
  } catch (err) {
    console.error("Set current version error:", err);
    return res.status(500).json({ error: err.message });
  }
}

export async function renderTemplate(req, res) {
  try {
    const contentId = parseInt(req.params.contentId, 10);
    if (Number.isNaN(contentId)) return res.status(400).json({ error: "Invalid content id" });
    const reqLang = (req.query.lang ? String(req.query.lang) : "").toLowerCase();
    const qVersion = req.query.versionNo ? parseInt(String(req.query.versionNo), 10) : undefined;

    const { data: content, error: cErr } = await supabase
      .from("content")
      .select("contentid, title, defaultlang, currentversion")
      .eq("contentid", contentId)
      .single();
    if (cErr) throw cErr;
    if (!content) return res.status(404).json({ error: "Content not found" });

    let useVersion = qVersion || content.currentversion || undefined;
    if (!useVersion) {
      const { data: last, error: lastErr } = await supabase
        .from("templateversion")
        .select("versionno")
        .eq("contentid", contentId)
        .order("versionno", { ascending: false })
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
        .from("templatevariant")
        .select("variantid, contentid, versionno, lang, body, placeholders")
        .eq("contentid", contentId)
        .eq("lang", L);
      if (useVersion) query = query.eq("versionno", useVersion);
      const { data, error } = await query.limit(1);
      if (error) throw error;
      if (data && data[0]) {
        found = data[0];
        break;
      }
    }

    if (!found) return res.status(404).json({ error: "No variant found for requested/default language" });
    return res.status(200).json({ content, variant: found });
  } catch (err) {
    console.error("Render resolve error:", err);
    return res.status(500).json({ error: err.message });
  }
}

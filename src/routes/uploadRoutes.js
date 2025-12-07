import express from "express";
import multer from "multer";
import supabase from "../lib/supabaseClient.js";

const router = express.Router();

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "video/mp4",
  "application/pdf",
]);
const MAX_SIZE = 16 * 1024 * 1024; // 16 MB
const BUCKET = "Message_Media";

const storage = multer.memoryStorage();

const sanitizeFilename = (name = "file") => {
  // Split extension
  const lastDot = name.lastIndexOf(".");
  const ext = lastDot > -1 ? name.slice(lastDot) : "";
  const base = lastDot > -1 ? name.slice(0, lastDot) : name;
  // Replace non-alphanumeric chars with dashes, then trim
  const safeBase = base
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "file";
  const safeExt = ext.replace(/[^\w.]+/g, "").toLowerCase();
  return `${safeBase}${safeExt}`;
};

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new Error("Invalid file type"));
      return;
    }
    cb(null, true);
  },
});

router.post("/", upload.single("file"), async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: "Supabase is not configured" });
    }
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const timestamp = Date.now();
    const safeName = sanitizeFilename(req.file.originalname);
    const path = `attachments/${timestamp}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false,
      });

    if (uploadError) {
      return res.status(500).json({ error: uploadError.message });
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    if (!data?.publicUrl) {
      return res.status(500).json({ error: "Failed to generate public URL" });
    }

    return res.status(200).json({ url: data.publicUrl });
  } catch (err) {
    const message =
      err?.message === "File too large"
        ? "File too large (max 16MB)"
        : err?.message || "Upload failed";
    return res.status(400).json({ error: message });
  }
});

export default router;

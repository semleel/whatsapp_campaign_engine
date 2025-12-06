// src/services/messageSender.js
// Helper to infer WhatsApp media type from a URL when DB column is absent.
export function getMediaTypeFromUrl(url) {
  if (!url) return "text";
  const lower = url.toLowerCase();
  if (lower.match(/\.(jpg|jpeg|png|gif|webp)$/)) return "image";
  if (lower.match(/\.(mp4|mov|avi|mkv)$/)) return "video";
  if (lower.match(/\.(pdf|doc|docx|xls|xlsx|ppt|pptx)$/)) return "document";
  if (lower.match(/\.(mp3|wav|ogg)$/)) return "audio";
  return "document";
}

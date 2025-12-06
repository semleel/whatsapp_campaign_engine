import jwt from "jsonwebtoken";
import { prisma } from "../config/prismaClient.js";

const FALLBACK_SECRET = "dev-secret-change-me";

/**
 * Verify Bearer JWT and active sessiontoken row.
 */
export default async function authMiddleware(req, res, next) {
  try {
    const header = req.headers["authorization"] || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Missing Authorization header" });

    const secret = process.env.JWT_SECRET || FALLBACK_SECRET;
    const decoded = jwt.verify(token, secret);

    const tokenRow = await prisma.session_token.findFirst({
      where: { token_value: token, is_revoked: false },
    });
    const now = new Date();
    if (!tokenRow || (tokenRow.expiry_at && tokenRow.expiry_at < now)) {
      return res.status(401).json({ error: "Token expired or revoked" });
    }

    req.adminId = decoded.sub;
    const rawRole = decoded.role || tokenRow?.role_type || "";
    const normalizedRole =
      req.adminId === 1 ? "admin" : (rawRole || "").toString().toLowerCase();
    req.role = normalizedRole;
    req.tokenRow = tokenRow;

    prisma.session_token
      .update({ where: { token_id: tokenRow.token_id }, data: { last_used_at: new Date() } })
      .catch(() => {});

    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireRole(roles = []) {
  return function roleGuard(req, res, next) {
    const role = (req.role || "").toLowerCase();
    const allowed = roles.map((r) => (r || "").toLowerCase());
    if (!role || !allowed.includes(role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}

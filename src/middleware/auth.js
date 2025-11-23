import jwt from "jsonwebtoken";
import prisma from "../config/prismaClient.js";

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

    const tokenRow = await prisma.sessiontoken.findFirst({
      where: { tokenvalue: token, is_revoked: false },
    });
    const now = new Date();
    if (!tokenRow || (tokenRow.expiryat && tokenRow.expiryat < now)) {
      return res.status(401).json({ error: "Token expired or revoked" });
    }

    req.adminId = decoded.sub;
    const rawRole = decoded.role || tokenRow?.roletype || "";
    const normalizedRole =
      req.adminId === 1 ? "admin" : (rawRole || "").toString().toLowerCase();
    req.role = normalizedRole;
    req.tokenRow = tokenRow;

    prisma.sessiontoken
      .update({ where: { tokenid: tokenRow.tokenid }, data: { lastusedat: new Date() } })
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

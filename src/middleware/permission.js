import prisma from "../config/prismaClient.js";

const BASELINE_ADMIN_ID = Number(process.env.BASELINE_ADMIN_ID || 0);

/**
 * Server-side privilege guard.
 * Admin role bypasses checks.
 */
export function requirePrivilege(resource, action) {
  return async function permissionGuard(req, res, next) {
    try {
      const role = (req.role || "").toLowerCase();
      if (role === "admin" || role === "super") return next();

      if (!req.adminId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const priv = await prisma.staff_privilege.findFirst({
        where: { adminid: Number(req.adminId), resource },
        select: { view: true, create: true, update: true, archive: true },
      });

      let effectivePriv = priv;

      // Fallback to general baseline (adminid = BASELINE_ADMIN_ID) when no per-user privileges exist
      if (!effectivePriv) {
        effectivePriv = await prisma.staff_privilege.findFirst({
          where: { adminid: BASELINE_ADMIN_ID, resource },
          select: { view: true, create: true, update: true, archive: true },
        });
      }

      if (!effectivePriv?.[action]) {
        return res.status(403).json({
          error: `You do not have permission to ${action} ${resource}. Please contact an admin to request access.`,
          code: "FORBIDDEN_PRIVILEGE",
          details: { resource, action, role },
        });
      }

      return next();
    } catch (err) {
      console.error("Privilege check failed:", err);
      return res.status(500).json({ error: "Permission check failed" });
    }
  };
}

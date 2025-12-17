import prisma from "../config/prismaClient.js";

const BASELINE_ADMIN_ID = Number(process.env.BASELINE_ADMIN_ID || 0);

async function resolvePrivileges(adminId, resource) {
  if (!adminId) return null;
  const targetId = Number(adminId);
  const select = { can_view: true, can_create: true, can_update: true, can_archive: true };

  let priv = await prisma.staff_privilege.findFirst({
    where: { admin_id: targetId, resource },
    select,
  });

  if (!priv) {
    priv = await prisma.staff_privilege.findFirst({
      where: { admin_id: BASELINE_ADMIN_ID, resource },
      select,
    });
  }

  return {
    view: Boolean(priv?.can_view),
    create: Boolean(priv?.can_create),
    update: Boolean(priv?.can_update),
    archive: Boolean(priv?.can_archive),
  };
}

function handleUnauthorized(res) {
  return res.status(401).json({ error: "Unauthorized" });
}

function handleForbidden(res, resource, action, role, actionsList = [action]) {
  const actionLabel = actionsList.length > 1 ? actionsList.join(" or ") : action;
  return res.status(403).json({
    error: `You do not have permission to ${actionLabel} ${resource}. Please contact an admin to request access.`,
    code: "FORBIDDEN_PRIVILEGE",
    details: { resource, action: actionLabel, role },
  });
}

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
        return handleUnauthorized(res);
      }

      const privileges = await resolvePrivileges(req.adminId, resource);
      if (!privileges[action]) {
        return handleForbidden(res, resource, action, role);
      }

      return next();
    } catch (err) {
      console.error("Privilege check failed:", err);
      return res.status(500).json({ error: "Permission check failed" });
    }
  };
}

export function requirePrivilegeAny(resource, actions = []) {
  return async function permissionGuard(req, res, next) {
    try {
      const role = (req.role || "").toLowerCase();
      if (role === "admin" || role === "super") return next();

      if (!req.adminId) {
        return handleUnauthorized(res);
      }

      const privileges = await resolvePrivileges(req.adminId, resource);

      const allowed = actions.some((action) => privileges[action]);
      if (!allowed) {
        return handleForbidden(res, resource, "access", role, actions);
      }

      return next();
    } catch (err) {
      console.error("Privilege check failed:", err);
      return res.status(500).json({ error: "Permission check failed" });
    }
  };
}

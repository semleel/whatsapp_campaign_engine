import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASELINE_ADMIN_ID = Number(process.env.BASELINE_ADMIN_ID || 1);

export function requirePrivilege(
  resource: string,
  action: "view" | "create" | "update" | "archive"
) {
  return async function permissionGuard(
    req: Request & { adminId?: number; role?: string },
    res: Response,
    next: NextFunction
  ) {
    try {
      const role = (req.role || "").toLowerCase();
      if (role === "admin") return next();

      if (!req.adminId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const priv = await prisma.staff_privilege.findUnique({
        where: {
          adminid_resource: {
            adminid: req.adminId,
            resource,
          },
        },
        select: {
          view: true,
          create: true,
          update: true,
          archive: true,
        },
      });

      let effectivePriv = priv;

      // Fallback to general baseline (adminid = BASELINE_ADMIN_ID) when no per-user privileges exist
      if (!effectivePriv) {
        effectivePriv = await prisma.staff_privilege.findUnique({
          where: {
            adminid_resource: {
              adminid: BASELINE_ADMIN_ID,
              resource,
            },
          },
          select: {
            view: true,
            create: true,
            update: true,
            archive: true,
          },
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
      return res.status(500).json({
        error: "Permission check failed",
      });
    }
  };
}

import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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

      if (!priv?.[action]) {
        return res.status(403).json({
          error: `Permission denied: missing ${action} access for ${resource}`,
          code: "FORBIDDEN_PRIVILEGE",
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

import express from "express";
import authMiddleware, { requireRole } from "../middleware/auth.js";
import { getPrivileges, upsertPrivileges } from "../controllers/privilegeController.js";

const router = express.Router();

function allowSelfOrAdmin(req, res, next) {
  const role = (req.role || "").toLowerCase();
  const requester = Number(req.adminId);
  const target = Number(req.params.adminid);
  if (role === "admin" || (requester && target && requester === target)) {
    return next();
  }
  return res.status(403).json({ error: "Forbidden" });
}

router.use(authMiddleware);

// Allow admins to manage anyone, and staff to read their own privileges
router.get("/:adminid", allowSelfOrAdmin, getPrivileges);

// Only admins can update privileges
router.put("/:adminid", requireRole(["Admin"]), upsertPrivileges);

export default router;

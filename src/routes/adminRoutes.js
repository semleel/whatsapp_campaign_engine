import express from "express";
import {
  listAdmins,
  getAdmin,
  createAdmin,
  updateAdmin,
  deleteAdmin,
} from "../controllers/adminController.js";
import authMiddleware from "../middleware/auth.js";
import { requirePrivilege } from "../middleware/permission.js";

const router = express.Router();

router.use(authMiddleware);

// View staff list / details
router.get("/", requirePrivilege("system", "view"), listAdmins);
router.get("/:id", requirePrivilege("system", "view"), getAdmin);

// Create / update / disable staff
router.post("/", requirePrivilege("system", "create"), createAdmin);
router.put("/:id", requirePrivilege("system", "update"), updateAdmin);
router.delete("/:id", requirePrivilege("system", "archive"), deleteAdmin);

export default router;

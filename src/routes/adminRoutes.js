import express from "express";
import {
  listAdmins,
  getAdmin,
  createAdmin,
  updateAdmin,
  deleteAdmin,
} from "../controllers/adminController.js";
import authMiddleware from "../middleware/auth.js";

const router = express.Router();

router.use(authMiddleware);

// Only allow non-staff roles to manage staff. Staff accounts cannot CRUD others.
router.use((req, res, next) => {
  const role = (req.role || "").toLowerCase();
  // Permit the primary admin (id=1) even if role is missing/mis-set.
  if (role === "staff" && req.adminId !== 1) {
    return res.status(403).json({ error: "Admin permission required" });
  }
  next();
});

router.get("/", listAdmins);
router.get("/:id", getAdmin);
router.post("/", createAdmin);
router.put("/:id", updateAdmin);
router.delete("/:id", deleteAdmin);

export default router;

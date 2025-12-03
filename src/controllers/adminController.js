import bcrypt from "bcrypt";
import prisma from "../config/prismaClient.js";

const SALT_ROUNDS = Number(process.env.PASSWORD_SALT_ROUNDS || 10);
const ALLOWED_ROLES = ["Admin", "Super", "Staff"];

const BASELINE_ADMIN_ID = Number(process.env.BASELINE_ADMIN_ID || 1);
const toTitle = (role) => {
  if (!role) return null;
  const r = String(role).trim();
  if (!r) return null;
  return r.charAt(0).toUpperCase() + r.slice(1).toLowerCase();
};

const normalizeRole = (role, fallback = null) => {
  const normalized = toTitle(role);
  if (!normalized) return fallback;
  return ALLOWED_ROLES.includes(normalized) ? normalized : null;
};
const DEFAULT_BASELINE_PRIVILEGES = [
  "overview",
  "campaigns",
  "content",
  "flows",
  "contacts",
  "integration",
  "reports",
  "system",
  "conversations",
].map((resource) => ({
  resource,
  view: true,
  create: false,
  update: false,
  archive: false,
}));

export async function listAdmins(req, res) {
  const rows = await prisma.admin.findMany({
    select: {
      adminid: true,
      name: true,
      email: true,
      role: true,
      phonenum: true,
      is_active: true,
      createdat: true,
      _count: { select: { staff_privilege: true } },
    },
    orderBy: { adminid: "asc" },
  });
  const normalized = rows.map((r) => {
    const { _count, ...rest } = r;
    return {
      ...rest,
      role: toTitle(r.role),
      has_privileges: (_count?.staff_privilege || 0) > 0,
    };
  });
  return res.json(normalized);
}

export async function getAdmin(req, res) {
  const id = Number(req.params.id);
  const admin = await prisma.admin.findUnique({
    where: { adminid: id },
    select: {
      adminid: true,
      name: true,
      email: true,
      role: true,
      phonenum: true,
      is_active: true,
      createdat: true,
      _count: { select: { staff_privilege: true } },
    },
  });
  if (!admin) return res.status(404).json({ error: "Admin not found" });
  const { _count, ...rest } = admin;
  return res.json({
    ...rest,
    role: toTitle(admin.role),
    has_privileges: (_count?.staff_privilege || 0) > 0,
  });
}

export async function createAdmin(req, res) {
  const { name, email, password, phonenum, role } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email and password are required" });

  const existing = await prisma.admin.findUnique({ where: { email } });
  if (existing) return res.status(400).json({ error: "Email already in use" });

  const normalizedRole = normalizeRole(role, "Staff");
  if (!normalizedRole) return res.status(400).json({ error: "Invalid role" });

  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
  const admin = await prisma.admin.create({
    data: {
      name: name || null,
      email,
      password_hash,
      role: normalizedRole,
      phonenum: phonenum || null,
      is_active: true,
    },
  });

  // Apply general baseline privileges (adminid = 0) to new staff by default
  let appliedBaseline = false;
  try {
    let baseline = await prisma.staff_privilege.findMany({ where: { adminid: BASELINE_ADMIN_ID } });

    // If no baseline exists yet, seed it with the default workspace access (view-only)
    if (!baseline.length) {
      await prisma.staff_privilege.createMany({
        data: DEFAULT_BASELINE_PRIVILEGES.map((row) => ({
          ...row,
          adminid: BASELINE_ADMIN_ID,
        })),
        skipDuplicates: true,
      });
      baseline = await prisma.staff_privilege.findMany({ where: { adminid: BASELINE_ADMIN_ID } });
    }

    if (baseline.length) {
      await prisma.staff_privilege.createMany({
        data: baseline.map((row) => ({
          adminid: admin.adminid,
          resource: row.resource,
          view: row.view,
          create: row.create,
          update: row.update,
          archive: row.archive,
        })),
        skipDuplicates: true,
      });
      appliedBaseline = true;
    }
  } catch (err) {
    // Do not fail staff creation if baseline copy fails
    console.error("Failed to apply baseline privileges to new staff:", err);
  }

  return res.status(201).json({
    adminid: admin.adminid,
    name: admin.name,
    email: admin.email,
    role: admin.role,
    phonenum: admin.phonenum,
    is_active: admin.is_active,
    has_privileges: appliedBaseline,
  });
}

export async function updateAdmin(req, res) {
  const id = Number(req.params.id);
  const { name, email, role, phonenum, is_active, password } = req.body || {};

  const normalizedRole = role === undefined ? undefined : normalizeRole(role);
  if (role !== undefined && !normalizedRole) {
    return res.status(400).json({ error: "Invalid role" });
  }

  const data = { name, email, phonenum, is_active };
  if (role !== undefined) data.role = normalizedRole;
  if (password) data.password_hash = await bcrypt.hash(password, SALT_ROUNDS);

  try {
    const updated = await prisma.admin.update({ where: { adminid: id }, data });
    return res.json({
      adminid: updated.adminid,
      name: updated.name,
      email: updated.email,
      role: updated.role,
      phonenum: updated.phonenum,
      is_active: updated.is_active,
    });
  } catch (err) {
    return res.status(404).json({ error: "Admin not found" });
  }
}

export async function deleteAdmin(req, res) {
  const id = Number(req.params.id);
  try {
    const updated = await prisma.admin.update({
      where: { adminid: id },
      data: { is_active: false },
    });
    return res.json({ success: true, adminid: updated.adminid, is_active: updated.is_active });
  } catch (err) {
    return res.status(404).json({ error: "Admin not found" });
  }
}

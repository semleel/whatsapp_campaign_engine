import bcrypt from "bcrypt";
import prisma from "../config/prismaClient.js";

const SALT_ROUNDS = Number(process.env.PASSWORD_SALT_ROUNDS || 10);
const toTitle = (role) => {
  if (!role) return null;
  const r = String(role).trim();
  if (!r) return null;
  return r.charAt(0).toUpperCase() + r.slice(1).toLowerCase();
};

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
    },
    orderBy: { adminid: "asc" },
  });
  const normalized = rows.map((r) => ({ ...r, role: toTitle(r.role) }));
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
    },
  });
  if (!admin) return res.status(404).json({ error: "Admin not found" });
  return res.json({ ...admin, role: toTitle(admin.role) });
}

export async function createAdmin(req, res) {
  const { name, email, password, phonenum } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email and password are required" });

  const existing = await prisma.admin.findUnique({ where: { email } });
  if (existing) return res.status(400).json({ error: "Email already in use" });

  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
  const admin = await prisma.admin.create({
    data: {
      name: name || null,
      email,
      password_hash,
      role: "Staff",
      phonenum: phonenum || null,
      is_active: true,
    },
  });

  return res.status(201).json({
    adminid: admin.adminid,
    name: admin.name,
    email: admin.email,
    role: admin.role,
    phonenum: admin.phonenum,
    is_active: admin.is_active,
  });
}

export async function updateAdmin(req, res) {
  const id = Number(req.params.id);
  const { name, email, role, phonenum, is_active, password } = req.body || {};

  const normalizedRole = role === undefined ? undefined : toTitle(role) || "Staff";
  if (role && normalizedRole !== "Staff") {
    return res.status(400).json({ error: "Role is fixed to Staff" });
  }

  const data = { name, email, phonenum, is_active };
  if (normalizedRole) data.role = normalizedRole;
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

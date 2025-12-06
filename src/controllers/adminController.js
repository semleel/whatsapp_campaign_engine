import bcrypt from "bcrypt";
import prisma from "../config/prismaClient.js";

const SALT_ROUNDS = Number(process.env.PASSWORD_SALT_ROUNDS || 10);
const ALLOWED_ROLES = ["Admin", "Super", "Staff"];

const BASELINE_ADMIN_ID = Number(process.env.BASELINE_ADMIN_ID || 0);
const NEW_STAFF_TEMPLATE_ADMIN_ID = Number(
  process.env.NEW_STAFF_TEMPLATE_ADMIN_ID || BASELINE_ADMIN_ID
);
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

async function ensureTemplateAdminExists(adminid) {
  if (!Number.isFinite(adminid)) return null;
  const existing = await prisma.admin.findUnique({ where: { admin_id: adminid } });
  if (existing) return existing;

  const password_hash = await bcrypt.hash("template-placeholder", SALT_ROUNDS);
  return prisma.admin.create({
    data: {
      admin_id: adminid,
      name: "New Staff Privilege Template",
      email: `template-${adminid}@local`,
      password_hash,
      role: "Staff",
      phone_num: null,
      is_active: true,
    },
  });
}

async function ensureBaselinePrivileges() {
  await ensureTemplateAdminExists(BASELINE_ADMIN_ID);
  let baseline = await prisma.staff_privilege.findMany({ where: { admin_id: BASELINE_ADMIN_ID } });
  if (!baseline.length) {
    await prisma.staff_privilege.createMany({
      data: DEFAULT_BASELINE_PRIVILEGES.map((row) => ({
        ...row,
        admin_id: BASELINE_ADMIN_ID,
      })),
      skipDuplicates: true,
    });
    baseline = await prisma.staff_privilege.findMany({ where: { admin_id: BASELINE_ADMIN_ID } });
  }
  return baseline;
}

async function ensureTemplatePrivileges() {
  const templateId = NEW_STAFF_TEMPLATE_ADMIN_ID;
  await ensureTemplateAdminExists(templateId);
  let template = await prisma.staff_privilege.findMany({ where: { admin_id: templateId } });

  if (!template.length) {
    await prisma.staff_privilege.createMany({
      data: DEFAULT_BASELINE_PRIVILEGES.map((row) => ({
        ...row,
        admin_id: templateId,
      })),
      skipDuplicates: true,
    });
    template = await prisma.staff_privilege.findMany({ where: { admin_id: templateId } });
  }

  if (!template.length && templateId !== BASELINE_ADMIN_ID) {
    const baseline = await ensureBaselinePrivileges();
    template = baseline;
  }

  return { template, templateId };
}

async function syncAdminIdSequence() {
  try {
    await prisma.$executeRaw`
      SELECT setval(
        pg_get_serial_sequence('admin', 'admin_id'),
        COALESCE((SELECT MAX(admin_id) FROM "admin"), 0)
      )
    `;
  } catch (err) {
    console.warn("Failed to sync admin id sequence:", err);
  }
}

export async function listAdmins(req, res) {
  const excludeIds = [NEW_STAFF_TEMPLATE_ADMIN_ID].filter((n) => Number.isFinite(n));
  const rows = await prisma.admin.findMany({
    where: excludeIds.length ? { admin_id: { notIn: excludeIds } } : undefined,
    select: {
      admin_id: true,
      name: true,
      email: true,
      role: true,
      phone_num: true,
      is_active: true,
      created_at: true,
      _count: { select: { staff_privilege: true } },
    },
    orderBy: { admin_id: "asc" },
  });
  const normalized = rows.map((r) => {
    const { _count, ...rest } = r;
    return {
      adminid: r.admin_id,
      name: r.name,
      email: r.email,
      role: toTitle(r.role),
      phonenum: r.phone_num,
      is_active: r.is_active,
      createdat: r.created_at,
      role: toTitle(r.role),
      has_privileges: (_count?.staff_privilege || 0) > 0,
    };
  });
  return res.json(normalized);
}

export async function getAdmin(req, res) {
  const id = Number(req.params.id);
  const admin = await prisma.admin.findUnique({
    where: { admin_id: id },
    select: {
      admin_id: true,
      name: true,
      email: true,
      role: true,
      phone_num: true,
      is_active: true,
      created_at: true,
      _count: { select: { staff_privilege: true } },
    },
  });
  if (!admin) return res.status(404).json({ error: "Admin not found" });
  const { _count, ...rest } = admin;
  return res.json({
    adminid: admin.admin_id,
    name: admin.name,
    email: admin.email,
    role: toTitle(admin.role),
    phonenum: admin.phone_num,
    is_active: admin.is_active,
    createdat: admin.created_at,
    has_privileges: (_count?.staff_privilege || 0) > 0,
  });
}

export async function createAdmin(req, res) {
  try {
    const { name, email, password, phonenum, role } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "email and password are required" });

    const existing = await prisma.admin.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ error: "Email already in use" });

    const normalizedRole = normalizeRole(role, "Staff");
    if (!normalizedRole) return res.status(400).json({ error: "Invalid role" });

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    const createRow = () =>
      prisma.admin.create({
        data: {
          name: name || null,
          email,
          password_hash,
          role: normalizedRole,
          phonenum: phonenum || null,
          is_active: true,
        },
      });

    // Keep the adminid sequence in sync (DB imports can desync sequences).
    await syncAdminIdSequence();

    let admin;
    try {
      admin = await createRow();
    } catch (err) {
      if (err.code === "P2002" && Array.isArray(err.meta?.target) && err.meta.target.includes("adminid")) {
        await syncAdminIdSequence();
        admin = await createRow();
      } else if (err.code === "P2002" && Array.isArray(err.meta?.target) && err.meta.target.includes("email")) {
        return res.status(400).json({ error: "Email already in use" });
      } else {
        throw err;
      }
    }

    // Apply general baseline privileges (adminid = BASELINE_ADMIN_ID) to new staff by default
    let appliedBaseline = false;
    try {
      const { template } = await ensureTemplatePrivileges();

      if (template.length) {
        await prisma.staff_privilege.createMany({
          data: template.map((row) => ({
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
  } catch (err) {
    console.error("createAdmin error:", err);
    return res.status(500).json({ error: err.message || "Failed to create admin" });
  }
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

// /src/controllers/privilegeController.js

import { prisma } from "../config/prismaClient.js";
import { Prisma } from "@prisma/client";

const DEFAULT_BASELINE_PRIVILEGES = [
  "overview",
  "campaigns",
  "content",
  "flows",
  "contacts",
  "integration",
  "feedback",
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

const BASELINE_ADMIN_ID = Number(process.env.BASELINE_ADMIN_ID || 0);
const NEW_STAFF_TEMPLATE_ADMIN_ID = Number(
  process.env.NEW_STAFF_TEMPLATE_ADMIN_ID || BASELINE_ADMIN_ID
);

async function ensureTemplateAdminExists(adminid) {
  if (!Number.isFinite(adminid)) return null;
  const existing = await prisma.admin.findUnique({ where: { admin_id: adminid } });
  if (existing) return existing;
  return prisma.admin.create({
    data: {
      admin_id: adminid,
      name: "Privilege Template",
      email: `template-${adminid}@local`,
      password_hash: "template", // placeholder
      role: "Staff",
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

/**
 * GET /api/privilege/:adminid
 * Return privileges in correct frontend shape:
 * {
 *   campaigns: { view: true, create: false, update: false, archive: false },
 *   reports:   { view: true, create: false, update: false, archive: false }
 * }
 */
export async function getPrivileges(req, res) {
  const adminid = Number(req.params.adminid);
  if (Number.isNaN(adminid)) return res.status(400).json({ error: "adminid is required" });
  try {
    await ensureTemplateAdminExists(adminid);
    let rows = await prisma.staff_privilege.findMany({
      where: { admin_id: adminid }
    });

    // Fallback to general baseline (adminid = 0) when no rows for this user
    if (!rows.length && adminid !== BASELINE_ADMIN_ID) {
      const baseline = await ensureBaselinePrivileges();
      if (baseline.length) {
        await prisma.staff_privilege.createMany({
          data: baseline.map((row) => ({
            admin_id: adminid,
            resource: row.resource,
            can_view: row.view,
            can_create: row.create,
            can_update: row.update,
            can_archive: row.archive,
          })),
          skipDuplicates: true,
        });
        rows = await prisma.staff_privilege.findMany({ where: { admin_id: adminid } });
      } else {
        rows = [];
      }
    }

    const map = {};
    rows.forEach((r) => {
      map[r.resource] = {
        view: !!r.can_view,
        create: !!r.can_create,
        update: !!r.can_update,
        archive: !!r.can_archive,
      };
    });

    res.json({ adminid, privileges: map });
  } catch (err) {
    console.error("Privilege GET error:", err);
    res.status(500).json({ error: "Failed to load privileges" });
  }
}

/**
 * PUT /api/privilege/:adminid
 * Replace all privileges for a staff record
 */
export async function upsertPrivileges(req, res) {
  const adminid = Number(req.params.adminid);
  if (Number.isNaN(adminid)) return res.status(400).json({ error: "adminid is required" });
  const privileges = req.body.privileges || {};

  try {
    await ensureTemplateAdminExists(adminid);
    // Remove previous privileges
    await prisma.$executeRaw`DELETE FROM staff_privilege WHERE admin_id = ${adminid}`;

    // Insert new privileges
    const inserts = Object.entries(privileges).map(([resource, actions]) => ({
      admin_id: adminid,
      resource,
      view: !!actions.view,
      create: !!actions.create,
      update: !!actions.update,
      archive: !!actions.archive,
    }));

    if (inserts.length > 0) {
      const values = Prisma.join(
        inserts.map((i) =>
          Prisma.sql`(${i.admin_id}, ${i.resource}, ${i.view}, ${i.create}, ${i.update}, ${i.archive})`
        )
      );
      await prisma.$executeRaw`INSERT INTO staff_privilege (admin_id, resource, can_view, can_create, can_update, can_archive) VALUES ${values}`;
    }

    res.json({ success: true, count: inserts.length });
  } catch (err) {
    console.error("Privilege SAVE error:", err);
    res.status(500).json({ error: "Failed to save privileges" });
  }
}

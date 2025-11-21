// /src/controllers/privilegeController.js

import prisma from "../config/prismaClient.js";

/**
 * GET /api/privilege/:adminid
 * Return privileges in correct frontend shape:
 * {
 *   campaigns: { view: true, create: false, update: false, archive: false },
 *   reports:   { view: true, create: false, update: false, archive: false }
 * }
 */
export async function getPrivileges(req, res) {
  const adminid = parseInt(req.params.adminid);

  try {
    const rows = await prisma.staff_privilege.findMany({
      where: { adminid }
    });

    const map = {};

    rows.forEach(r => {
      map[r.resource] = {
        view: r.view,
        create: r.create,
        update: r.update,
        archive: r.archive
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
  const adminid = parseInt(req.params.adminid);
  const privileges = req.body.privileges || {};

  try {
    // Remove previous privileges
    await prisma.staff_privilege.deleteMany({ where: { adminid } });

    // Insert new privileges
    const inserts = Object.entries(privileges).map(
      ([resource, actions]) => ({
        adminid,
        resource,
        view: !!actions.view,
        create: !!actions.create,
        update: !!actions.update,
        archive: !!actions.archive
      })
    );

    if (inserts.length > 0) {
      await prisma.staff_privilege.createMany({
        data: inserts
      });
    }

    res.json({ success: true, count: inserts.length });
  } catch (err) {
    console.error("Privilege SAVE error:", err);
    res.status(500).json({ error: "Failed to save privileges" });
  }
}

// /src/controllers/privilegeController.js

import prisma from "../config/prismaClient.js";
import { Prisma } from "@prisma/client";

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
  if (!adminid) return res.status(400).json({ error: "adminid is required" });
  try {
    const rows = await prisma.$queryRaw`
      SELECT resource, "view", "create", "update", archive
      FROM staff_privilege
      WHERE adminid = ${adminid}
    `;

    const map = {};
    rows.forEach((r) => {
      map[r.resource] = {
        view: !!r.view,
        create: !!r.create,
        update: !!r.update,
        archive: !!r.archive,
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
  if (!adminid) return res.status(400).json({ error: "adminid is required" });
  const privileges = req.body.privileges || {};

  try {
    // Remove previous privileges
    await prisma.$executeRaw`DELETE FROM staff_privilege WHERE adminid = ${adminid}`;

    // Insert new privileges
    const inserts = Object.entries(privileges).map(([resource, actions]) => ({
      adminid,
      resource,
      view: !!actions.view,
      create: !!actions.create,
      update: !!actions.update,
      archive: !!actions.archive,
    }));

    if (inserts.length > 0) {
      const values = Prisma.join(
        inserts.map((i) =>
          Prisma.sql`(${i.adminid}, ${i.resource}, ${i.view}, ${i.create}, ${i.update}, ${i.archive})`
        )
      );
      await prisma.$executeRaw`INSERT INTO staff_privilege (adminid, resource, "view", "create", "update", archive) VALUES ${values}`;
    }

    res.json({ success: true, count: inserts.length });
  } catch (err) {
    console.error("Privilege SAVE error:", err);
    res.status(500).json({ error: "Failed to save privileges" });
  }
}

import { prisma } from "../config/prismaClient.js";

// GET /api/system/commands
export async function listSystemCommands(req, res, next) {
  try {
    const commands = await prisma.system_command.findMany({
      orderBy: { command: "asc" },
    });
    return res.json(commands);
  } catch (err) {
    return next(err);
  }
}

// PATCH /api/system/commands/:command
// Body may contain { is_enabled?: boolean, description?: string | null }
export async function updateSystemCommand(req, res, next) {
  const { command } = req.params;
  const { is_enabled, description } = req.body || {};

  if (!command || typeof command !== "string") {
    return res.status(400).json({ message: "Command is required." });
  }

  const data = {};

  if (typeof is_enabled === "boolean") {
    data.is_enabled = is_enabled;
  }

  if (typeof description === "string") {
    data.description = description;
  } else if (description === null) {
    data.description = null;
  }

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ message: "No valid fields to update." });
  }

  try {
    const updated = await prisma.system_command.update({
      where: { command },
      data,
    });
    return res.json(updated);
  } catch (err) {
    if (err?.code === "P2025") {
      return res.status(404).json({ message: "Command not found." });
    }
    return next(err);
  }
}

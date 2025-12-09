import { prisma } from "../config/prismaClient.js";

export async function listApis(req, res) {
  try {
    const apis = await prisma.api.findMany({
      select: { api_id: true, name: true, is_active: true, response_template: true },
      orderBy: { api_id: "asc" },
    });
    return res.status(200).json(apis);
  } catch (err) {
    console.error("List APIs error:", err);
    return res.status(500).json({ error: err.message });
  }
}

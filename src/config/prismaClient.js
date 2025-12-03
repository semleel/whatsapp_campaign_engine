import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.__prismaBackend ||
  new PrismaClient({
    log: ["error", "warn"],
  });

if (!globalForPrisma.__prismaBackend) {
  globalForPrisma.__prismaBackend = prisma;
}

export default prisma;

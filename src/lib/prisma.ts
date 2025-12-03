import { PrismaClient } from "@prisma/client";

// Prevent multiple instances in dev / hot-reload
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ["error", "warn"],
  });

if (!globalForPrisma.prisma) {
  globalForPrisma.prisma = prisma;
}

export default prisma;

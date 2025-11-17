import pkg from "@prisma/client";
const { PrismaClient } = pkg;

let prisma;
if (!global._prisma) {
  global._prisma = new PrismaClient({
    log: ["error", "warn"],
  });
}
prisma = global._prisma;

export default prisma;

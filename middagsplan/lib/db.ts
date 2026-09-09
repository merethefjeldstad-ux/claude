import { PrismaClient } from "@prisma/client";

// Standard Next.js-mønster: gjenbruk PrismaClient på tvers av hot-reloads i
// dev, én instans i produksjon.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

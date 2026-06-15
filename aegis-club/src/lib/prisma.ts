import { PrismaClient } from "@prisma/client";

// Reaproveita a instância do PrismaClient em desenvolvimento para evitar
// esgotar o pool de conexões com o hot-reload do Next.js.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

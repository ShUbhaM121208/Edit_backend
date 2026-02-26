import { PrismaClient } from "@prisma/client";

// Singleton Prisma client — avoid instantiating multiple clients in dev (hot reload)
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// Eagerly connect so the first request isn't slow / doesn't fail
prisma.$connect().catch((err) => {
  console.error("[Prisma] Failed to connect on startup – will retry on first query", err.message);
});

// Graceful shutdown — release pool connections
const shutdown = async () => {
  await prisma.$disconnect();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

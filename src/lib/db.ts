import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const poolSize = parseInt(process.env.DATABASE_POOL_SIZE || "10", 10);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL!,
      max: poolSize,
    }),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

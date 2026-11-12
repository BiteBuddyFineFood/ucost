import { Prisma, PrismaClient } from "@prisma/client";
import { setTimeout as delay } from "node:timers/promises";

const globalDb = globalThis as unknown as { prisma?: PrismaClient };
export const db = globalDb.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalDb.prisma = db;

// Only short rolled-back writes are retried. External calls remain outside transactions.
export async function writeTransaction<T>(
  action: (tx: Prisma.TransactionClient) => Promise<T>,
  options = { maxWait: 10000, timeout: 15000 },
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(action, options);
    } catch (error) {
      const code = (error as any)?.code;
      if (attempt >= 2 || !["P2034", "P1008", "P2028"].includes(code))
        throw error;
      await delay(25 * (attempt + 1));
    }
  }
}

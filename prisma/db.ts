import { PrismaClient } from '../lib/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Standard Prisma 7 singleton pattern. Prevents exhausting the connection
// pool from hot-reload creating a new PrismaClient on every file change in
// dev (Next.js dev server re-evaluates modules on each request without this).
//
// The `prisma-client` generator (schema.prisma has no `url` in its
// `datasource` block) does not read DATABASE_URL automatically — it
// requires an explicit driver adapter. See the generated client's own
// doc comment in lib/generated/prisma/internal/class.ts for this exact
// pattern.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}
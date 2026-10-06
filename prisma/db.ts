import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';

// ---------------------------------------------------------------------------
// Prisma singleton with pg.Pool for serverless environments (Vercel).
//
// PrismaPg accepts either a connectionString (single persistent connection)
// or a pg.Pool (pooled connections). In serverless each function invocation
// may be a cold start with a fresh module scope, meaning the globalForPrisma
// singleton isn't guaranteed — multiple PrismaClient instances accumulate and
// exhaust Supabase's session-mode connection limit (pool_size: 15).
//
// Using pg.Pool + Supabase's Transaction mode pooler (port 6543) instead of
// the Session mode pooler (port 5432) solves this: connections are released
// after each query rather than held for the lifetime of the client, so
// serverless burst traffic never hits the ceiling.
//
// DATABASE_URL must point to the Transaction mode pooler:
//   postgresql://[user]:[password]@[host]:6543/[db]?pgbouncer=true
// DIRECT_URL must point to the direct connection (port 5432) for migrations.
// ---------------------------------------------------------------------------

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Keep the pool small — each Vercel function has its own pool, so the
  // effective total across all concurrent invocations is max * concurrency.
  // 2 is enough for a single function; raise only if queries queue up.
  max: 2,
});

const adapter = new PrismaPg(pool);

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}
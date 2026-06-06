/**
 * src/server/db.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Singleton Prisma client connected to Turso via @prisma/adapter-libsql.
 *
 * Uses environment variables:
 *   TURSO_DATABASE_URL  — e.g. "libsql://tcflow-yourname.turso.io"
 *   TURSO_AUTH_TOKEN    — from `turso db tokens create tcflow`
 *
 * For local development without a Turso account, set:
 *   TURSO_DATABASE_URL="file:./dev.db"
 *   TURSO_AUTH_TOKEN=""   (leave empty for local file)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';

const url   = process.env['TURSO_DATABASE_URL'];
const token = process.env['TURSO_AUTH_TOKEN'];

if (!url) {
  throw new Error(
    'TURSO_DATABASE_URL is not set. ' +
    'Add it to your .env file. ' +
    'For local dev use: TURSO_DATABASE_URL="file:./dev.db"'
  );
}

// PrismaLibSql accepts the config object directly — NOT a @libsql/client Client instance.
const adapter = new PrismaLibSql({
  url,
  authToken: token || undefined,
});

// Single shared instance — not created per-request like SheetsService was.
// Prisma manages connection internally.
export const prisma = new PrismaClient({ adapter } as any);

/**
 * src/server/db.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Singleton Prisma client connected to Turso via @prisma/adapter-libsql.
 *
 * Uses environment variables:
 *   TURSO_DATABASE_URL  — e.g. "libsql://tcflow-yourname.turso.io"
 *   TURSO_AUTH_TOKEN    — from `turso db tokens create tcflow`
 *
 * NOTE: PrismaClient is loaded via createRequire to prevent esbuild from
 * trying to bundle .prisma/client/default at build time. It is server-only
 * and resolved from node_modules at runtime.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createRequire } from 'node:module';
import { PrismaLibSql } from '@prisma/adapter-libsql';

// Load PrismaClient at runtime — esbuild will not attempt to bundle this
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client') as typeof import('@prisma/client');

const url   = process.env['TURSO_DATABASE_URL'];
const token = process.env['TURSO_AUTH_TOKEN'];

if (!url) {
  throw new Error(
    'TURSO_DATABASE_URL is not set. ' +
    'Add it to your .env file. ' +
    'For local dev use: TURSO_DATABASE_URL="file:./dev.db"'
  );
}

// PrismaLibSql accepts the config object directly
const adapter = new PrismaLibSql({
  url,
  authToken: token || undefined,
});

// Single shared instance — not created per-request like SheetsService was.
export const prisma = new PrismaClient({ adapter } as any);

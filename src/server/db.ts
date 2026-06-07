/**
 * src/server/db.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Singleton Prisma client connected to Turso via @prisma/adapter-libsql.
 *
 * Uses environment variables:
 *   TURSO_DATABASE_URL  — e.g. "libsql://tcflow-yourname.turso.io"
 *   TURSO_AUTH_TOKEN    — from `turso db tokens create tcflow`
 *
 * WHY dynamic import() instead of createRequire():
 *   The old createRequire() trick prevented esbuild from bundling the client
 *   (which would fail on native bindings), but it also hid the dependency from
 *   Vercel's @vercel/nft file tracer — so @prisma/client was never packaged
 *   into the serverless function, causing "Cannot find module" at runtime.
 *
 *   Since @prisma/client is already in externalDependencies in angular.json,
 *   esbuild will NOT bundle it regardless of how it is imported. Using a plain
 *   ESM dynamic import() achieves the same build-time result AND is visible to
 *   @vercel/nft so the package gets included in the Vercel function bundle.
 * ─────────────────────────────────────────────────────────────────────────────
 */

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { PrismaClient } = (await import('@prisma/client')) as any;

const adapter = new PrismaLibSql({
  url,
  authToken: token || undefined,
});

// Single shared instance — not created per-request.
export const prisma: any = new PrismaClient({ adapter });

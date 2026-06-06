/**
 * prisma.config.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Prisma 7+ requires connection config here instead of in schema.prisma.
 * Used by the Prisma CLI (migrate, generate, studio).
 * Runtime DB connection is handled in src/server/db.ts via PrismaLibSql.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { defineConfig } from 'prisma/config';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import 'dotenv/config';

const url   = process.env['DATABASE_URL'] ?? 'file:./dev.db';
const token = process.env['TURSO_AUTH_TOKEN'];

export default defineConfig({
  earlyAccess: true,
  schema: './prisma/schema.prisma',
  datasource: {
    url,
  },
  migrate: {
    adapter: () => {
      return new PrismaLibSql({ url, authToken: token || undefined });
    },
  },
});

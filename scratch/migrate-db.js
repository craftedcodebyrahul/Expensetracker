require('dotenv').config();
const { PrismaLibSql } = require('@prisma/adapter-libsql');
const { PrismaClient } = require('@prisma/client');

const url = process.env.TURSO_DATABASE_URL;
const token = process.env.TURSO_AUTH_TOKEN;

const adapter = new PrismaLibSql({ url, authToken: token || undefined });
const prisma = new PrismaClient({ adapter });

async function main() {
  try {
    console.log("Running migration raw SQL on database...");
    await prisma.$executeRawUnsafe(`
      ALTER TABLE settings ADD COLUMN monthly_report_enabled INTEGER NOT NULL DEFAULT 1;
    `);
    console.log("✅ Column 'monthly_report_enabled' added successfully to 'settings' table!");
  } catch (e) {
    if (e.message.includes('duplicate column') || e.message.includes('already exists')) {
      console.log("ℹ️ Column 'monthly_report_enabled' already exists in 'settings' table, skipping.");
    } else {
      console.error("⚠️ Error running migration:", e);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());

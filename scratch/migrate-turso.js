import dotenv from 'dotenv';
dotenv.config();

import { PrismaLibSql } from '@prisma/adapter-libsql';
import { PrismaClient } from '@prisma/client';

const url = process.env.TURSO_DATABASE_URL;
const token = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  throw new Error('TURSO_DATABASE_URL is not set in .env');
}

const adapter = new PrismaLibSql({
  url,
  authToken: token || undefined,
});

const prisma = new PrismaClient({ adapter });

async function migrate() {
  console.log('🚀 Connecting to remote Turso database at:', url);

  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS dismissed_bills (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `;

  const createIndexQuery = `
    CREATE UNIQUE INDEX IF NOT EXISTS dismissed_bills_user_id_description_key 
    ON dismissed_bills (user_id, description);
  `;

  console.log('Creating table "dismissed_bills"...');
  await prisma.$executeRawUnsafe(createTableQuery);
  console.log('Table "dismissed_bills" verified/created successfully!');

  console.log('Creating unique index...');
  await prisma.$executeRawUnsafe(createIndexQuery);
  console.log('Unique index verified/created successfully!');

  await prisma.$disconnect();
  console.log('Done!');
}

migrate().catch(console.error);

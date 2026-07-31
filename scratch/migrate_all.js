import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
dotenv.config();

const dbUrls = [
  process.env.DATABASE_URL || 'file:./dev.db',
  process.env.TURSO_DATABASE_URL
].filter(Boolean);

async function migrate() {
  for (const url of dbUrls) {
    console.log(`\nMigrating database at: ${url}`);
    const client = createClient({
      url,
      authToken: process.env.TURSO_AUTH_TOKEN
    });

    try {
      await client.execute(`ALTER TABLE accounts ADD COLUMN apr REAL DEFAULT 0`);
      console.log('Added apr column to accounts');
    } catch (e) {
      console.log('apr column info:', e.message);
    }

    try {
      await client.execute(`ALTER TABLE accounts ADD COLUMN minimum_payment REAL DEFAULT 0`);
      console.log('Added minimum_payment column to accounts');
    } catch (e) {
      console.log('minimum_payment column info:', e.message);
    }
  }
}

migrate();

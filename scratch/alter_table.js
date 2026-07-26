import { createClient } from '@libsql/client';
import dotenv from 'dotenv';

dotenv.config();

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

console.log('Connecting to Turso DB:', url);

const client = createClient({
  url: url || 'file:./dev.db',
  authToken
});

async function run() {
  try {
    console.log('Adding parent_id column to categories table on Turso...');
    await client.execute('ALTER TABLE categories ADD COLUMN parent_id TEXT;');
    console.log('✅ Successfully added parent_id column to categories table on Turso!');
  } catch (err) {
    if (err.message && err.message.includes('duplicate column name')) {
      console.log('✅ Column parent_id already exists on Turso categories table.');
    } else {
      console.error('Error adding column to Turso:', err);
    }
  }

  try {
    console.log('Creating index on parent_id...');
    await client.execute('CREATE INDEX IF NOT EXISTS categories_parent_id_idx ON categories(parent_id);');
    console.log('✅ Index created successfully!');
  } catch (err) {
    console.error('Error creating index:', err);
  }
}

run();

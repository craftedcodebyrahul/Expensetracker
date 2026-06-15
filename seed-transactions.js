import dotenv from 'dotenv';
dotenv.config();

import { PrismaLibSql } from '@prisma/adapter-libsql';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

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
const userId = 'dev_test_user_id';

async function run() {
  console.log('Seeding transactions for', userId);

  const now = new Date().toISOString();

  // 1. Ensure user exists
  let user = await prisma.user.findUnique({
    where: { id: userId }
  });
  if (!user) {
    user = await prisma.user.create({
      data: {
        id: userId,
        email: 'dev_test@example.com',
        name: 'Dev Test User',
        createdAt: now
      }
    });
    console.log('Created user:', userId);
  } else {
    console.log('User exists:', userId);
  }

  // 2. Ensure checking account exists
  let account = await prisma.account.findFirst({
    where: { userId }
  });
  if (!account) {
    account = await prisma.account.create({
      data: {
        id: uuidv4(),
        userId,
        name: 'Chequing Account',
        type: 'asset',
        currency: 'USD',
        initialBalance: 1000.0,
        createdAt: now
      }
    });
    console.log('Created account:', account.id);
  } else {
    console.log('Using existing account:', account.id);
  }

  // Clean up any old Spotify transactions
  await prisma.transaction.deleteMany({
    where: { userId, description: 'Spotify Premium' }
  });

  // Create 3 Spotify Premium transactions
  const txns = [
    {
      id: uuidv4(),
      userId,
      type: 'expense',
      amount: 11.99,
      category: 'subscriptions',
      description: 'Spotify Premium',
      date: '2026-04-10',
      tags: '[]',
      isRecurring: 0,
      accountId: account.id,
      source: 'manual',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      userId,
      type: 'expense',
      amount: 11.99,
      category: 'subscriptions',
      description: 'Spotify Premium',
      date: '2026-05-10',
      tags: '[]',
      isRecurring: 0,
      accountId: account.id,
      source: 'manual',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      userId,
      type: 'expense',
      amount: 11.99,
      category: 'subscriptions',
      description: 'Spotify Premium',
      date: '2026-06-10',
      tags: '[]',
      isRecurring: 0,
      accountId: account.id,
      source: 'manual',
      createdAt: now,
      updatedAt: now,
    }
  ];

  await prisma.transaction.createMany({
    data: txns
  });

  console.log('Successfully seeded 3 Spotify Premium transactions!');
  await prisma.$disconnect();
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});

import dotenv from 'dotenv';
dotenv.config();

import { PrismaLibSql } from '@prisma/adapter-libsql';
import { PrismaClient } from '@prisma/client';

const url = process.env.TURSO_DATABASE_URL;
const token = process.env.TURSO_AUTH_TOKEN;

const adapter = new PrismaLibSql({
  url,
  authToken: token || undefined,
});

const prisma = new PrismaClient({ adapter });
const userId = 'dev_test_user_id';

async function check() {
  console.log('--- USER INFO ---');
  const user = await prisma.user.findUnique({ where: { id: userId } });
  console.log('User:', user);

  console.log('--- RECURRING SCHEDULES ---');
  const schedules = await prisma.recurringSchedule.findMany({ where: { userId } });
  console.log('Schedules count:', schedules.length);
  schedules.forEach(s => console.log(`- ID: ${s.id}, Desc: ${s.description}, Active: ${s.isActive}`));

  console.log('--- DISMISSED BILLS ---');
  const dismissed = await prisma.dismissedBill.findMany({ where: { userId } });
  console.log('Dismissed count:', dismissed.length);
  dismissed.forEach(d => console.log(`- Desc: ${d.description}`));

  console.log('--- RECENT TRANSACTIONS ---');
  const transactions = await prisma.transaction.findMany({
    where: { userId },
    take: 10,
    orderBy: { date: 'desc' }
  });
  console.log('Recent transactions count:', transactions.length);
  transactions.forEach(t => console.log(`- Desc: ${t.description}, Date: ${t.date}, Amt: ${t.amount}, Cat: ${t.category}`));

  console.log('--- DETECTED BILLS ---');
  const dbServiceModule = await import('../src/server/db.service.ts');
  const dbService = dbServiceModule.dbService;
  const suggestions = await dbService.detectRecurringBills(userId);
  console.log('Suggestions:', suggestions);

  await prisma.$disconnect();
}

check().catch(console.error);

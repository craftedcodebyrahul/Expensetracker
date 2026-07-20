import 'dotenv/config';
process.env['TURSO_DATABASE_URL'] = 'file:./dev.db';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { v4 as uuidv4 } from 'uuid';

const testUserId = 'dev_test_goals_advisor_user_id';

describe('Goals Integrated Smart Savings Advisor Verification', () => {
  let checkingAccountId: string;
  let savingsAccountId: string;
  let goalId: string;
  let prisma: any;
  let dbService: any;

  beforeAll(async () => {
    const dbModule = await import('./db.js');
    prisma = dbModule.prisma;
    const dbServiceModule = await import('./db.service.js');
    dbService = dbServiceModule.dbService;

    // 1. Ensure test user exists
    await prisma.user.upsert({
      where: { id: testUserId },
      update: {},
      create: {
        id: testUserId,
        email: 'goals_advisor_test@example.com',
        name: 'Goals Advisor Test User',
        createdAt: new Date().toISOString()
      }
    });

    // 2. Create checking account with $500
    const checking = await prisma.account.create({
      data: {
        id: uuidv4(),
        userId: testUserId,
        name: 'Chequing Account',
        type: 'asset',
        currency: 'CAD',
        initialBalance: 500.0,
        createdAt: new Date().toISOString()
      }
    });
    checkingAccountId = checking.id;

    // 3. Create savings account
    const savings = await prisma.account.create({
      data: {
        id: uuidv4(),
        userId: testUserId,
        name: 'High Interest Savings Account',
        type: 'asset',
        currency: 'CAD',
        initialBalance: 100.0,
        createdAt: new Date().toISOString()
      }
    });
    savingsAccountId = savings.id;

    // 4. Create an active goal target
    const goal = await prisma.goal.create({
      data: {
        id: uuidv4(),
        userId: testUserId,
        name: 'Emergency Fund Goal',
        targetAmount: 1000.00,
        currentAmount: 200.00,
        targetDate: '2026-12-31',
        accountId: savingsAccountId,
        createdAt: new Date().toISOString()
      }
    });
    goalId = goal.id;
  });

  afterAll(async () => {
    // Clean up
    await prisma.goal.deleteMany({ where: { userId: testUserId } });
    await prisma.transaction.deleteMany({ where: { userId: testUserId } });
    await prisma.account.deleteMany({ where: { userId: testUserId } });
    await prisma.user.deleteMany({ where: { id: testUserId } });
    await prisma.$disconnect();
  });

  it('should allocate surplus from checking to goal, increment goal amount and log a transfer transaction', async () => {
    // Allocate $150 surplus
    const result = await dbService.allocateSavingsToGoal(
      testUserId,
      goalId,
      checkingAccountId,
      150.00
    );

    expect(result).toBeDefined();
    expect(result.goal).toBeDefined();
    expect(result.transaction).toBeDefined();

    // Verify Goal currentAmount is incremented by 150 (200 + 150 = 350)
    expect(result.goal.currentAmount).toBe(350.00);

    // Verify transaction fields
    expect(result.transaction.type).toBe('transfer');
    expect(result.transaction.amount).toBe(150.00);
    expect(result.transaction.accountId).toBe(checkingAccountId);
    expect(result.transaction.toAccountId).toBe(savingsAccountId);
    expect(result.transaction.description).toContain('Goal Allocation');

    // Fetch from database to verify persistence
    const persistedGoal = await prisma.goal.findUnique({ where: { id: goalId } });
    expect(persistedGoal.currentAmount).toBe(350.00);
  });
});

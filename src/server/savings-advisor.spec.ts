import 'dotenv/config';
process.env['TURSO_DATABASE_URL'] = 'file:./dev.db';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { v4 as uuidv4 } from 'uuid';

const testUserId = 'dev_test_advisor_user_id';

describe('Smart Savings & Transfer Advisor Verification', () => {
  let checkingAccountId: string;
  let savingsAccountId: string;
  let billScheduleId: string;
  let prisma: any;
  let dbService: any;

  beforeAll(async () => {
    // Dynamically import db and dbService
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
        email: 'advisor_test@example.com',
        name: 'Advisor Test User',
        createdAt: new Date().toISOString()
      }
    });

    // 2. Create checking account with $100 CAD
    const checking = await prisma.account.create({
      data: {
        id: uuidv4(),
        userId: testUserId,
        name: 'Primary Chequing',
        type: 'asset',
        currency: 'CAD',
        initialBalance: 100.0,
        createdAt: new Date().toISOString()
      }
    });
    checkingAccountId = checking.id;

    // 3. Create savings account with $1000 CAD
    const savings = await prisma.account.create({
      data: {
        id: uuidv4(),
        userId: testUserId,
        name: 'High Interest Savings',
        type: 'asset',
        currency: 'CAD',
        initialBalance: 1000.0,
        createdAt: new Date().toISOString()
      }
    });
    savingsAccountId = savings.id;
  });

  afterAll(async () => {
    // Clean up
    if (billScheduleId) {
      await prisma.recurringSchedule.deleteMany({ where: { id: billScheduleId } });
    }
    await prisma.transaction.deleteMany({ where: { userId: testUserId } });
    await prisma.account.deleteMany({ where: { userId: testUserId } });
    await prisma.user.deleteMany({ where: { id: testUserId } });
    await prisma.$disconnect();
  });

  it('should detect a shortfall warning when bills exceed balance and suggest a top-up', async () => {
    const today = new Date();
    const threeDaysLater = new Date();
    threeDaysLater.setDate(today.getDate() + 3);
    const threeDaysLaterStr = threeDaysLater.toISOString().split('T')[0];

    // 1. Create a bill due in 3 days for $150 (exceeds chequing balance of $100)
    const bill = await prisma.recurringSchedule.create({
      data: {
        id: uuidv4(),
        userId: testUserId,
        type: 'expense',
        amount: 150.00,
        category: 'utilities',
        description: 'Hydro Bill Payment',
        frequency: 'monthly',
        startDate: today.toISOString().split('T')[0],
        nextDueDate: threeDaysLaterStr,
        accountId: checkingAccountId,
        isActive: 1,
        createdAt: new Date().toISOString()
      }
    });
    billScheduleId = bill.id;

    // 2. Fetch advisor recommendations
    const advice = await dbService.getSavingsAdvisor(testUserId);

    // Verify shortfall is calculated
    const checkingDetails = advice.accounts.find((a: any) => a.id === checkingAccountId);
    expect(checkingDetails).toBeDefined();
    expect(checkingDetails.shortfall).toBeGreaterThan(0);
    // Shortfall should be at least (150 bill + 100 safety buffer + projected spending - 100 balance) = 150+
    expect(checkingDetails.shortfall).toBe(150); // 150 + 100 buffer + 0 projected - 100 balance = 150

    // Verify top-up warning recommendation is generated
    const shortfallWarning = advice.globalRecommendations.find((r: any) => r.type === 'warning');
    expect(shortfallWarning).toBeDefined();
    expect(shortfallWarning.title).toContain('Shortfall Risk');
    expect(shortfallWarning.message).toContain('Transfer');
    expect(shortfallWarning.action).toBeDefined();
    expect(shortfallWarning.action.fromAccountId).toBe(savingsAccountId);
    expect(shortfallWarning.action.toAccountId).toBe(checkingAccountId);
    expect(shortfallWarning.action.amount).toBe(150);
  });

  it('should successfully execute transfer and update advisor values', async () => {
    const adviceBefore = await dbService.getSavingsAdvisor(testUserId);
    const shortfallBefore = adviceBefore.accounts.find((a: any) => a.id === checkingAccountId).shortfall;
    expect(shortfallBefore).toBe(150);

    // Execute transfer recommendation
    const txn = await dbService.executeSavingsTransfer(
      testUserId,
      savingsAccountId,
      checkingAccountId,
      150.00,
      'topup'
    );

    expect(txn).toBeDefined();
    expect(txn.type).toBe('transfer');
    expect(txn.amount).toBe(150.00);

    // Fetch advisor values again
    const adviceAfter = await dbService.getSavingsAdvisor(testUserId);
    const checkingDetailsAfter = adviceAfter.accounts.find((a: any) => a.id === checkingAccountId);
    
    // Checking balance should now be $250 ($100 initial + $150 transfer)
    expect(checkingDetailsAfter.balance).toBe(250.00);
    // Shortfall should be 0 because balance ($250) is greater than reserved ($150 bills + $100 buffer = $250)
    expect(checkingDetailsAfter.shortfall).toBe(0);
  });
});

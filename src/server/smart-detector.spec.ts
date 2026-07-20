import 'dotenv/config';
process.env['TURSO_DATABASE_URL'] = 'file:./dev.db';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { v4 as uuidv4 } from 'uuid';

const testUserId = 'dev_test_detector_user_id';

describe('Smart Bill Detector Confidence and Dismissal Verification', () => {
  let accountId: string;
  let categoryId: string;
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
        email: 'detector_test@example.com',
        name: 'Detector Test User',
        createdAt: new Date().toISOString()
      }
    });

    // 2. Ensure test account exists
    const account = await prisma.account.create({
      data: {
        id: uuidv4(),
        userId: testUserId,
        name: 'Test Wallet',
        type: 'asset',
        currency: 'USD',
        createdAt: new Date().toISOString()
      }
    });
    accountId = account.id;

    // 3. Ensure category exists
    const category = await prisma.category.create({
      data: {
        id: uuidv4(),
        userId: testUserId,
        name: 'Utilities',
        type: 'expense',
        createdAt: new Date().toISOString()
      }
    });
    categoryId = category.id;
  });

  afterAll(async () => {
    // Clean up
    await prisma.dismissedBill.deleteMany({ where: { userId: testUserId } });
    await prisma.transaction.deleteMany({ where: { userId: testUserId } });
    await prisma.category.deleteMany({ where: { userId: testUserId } });
    await prisma.account.deleteMany({ where: { userId: testUserId } });
    await prisma.user.deleteMany({ where: { id: testUserId } });
    await prisma.$disconnect();
  });

  it('should implement confidence levels and filter out noise', async () => {
    // 1. A single high-confidence subscription transaction ("Netflix")
    const netflixTxn = await prisma.transaction.create({
      data: {
        id: uuidv4(),
        userId: testUserId,
        accountId,
        category: categoryId,
        type: 'expense',
        amount: 15.99,
        description: 'Netflix Subscription',
        date: '2026-06-01',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    });

    // 2. A single noisy general keyword transaction ("Electricity")
    const noiseTxn = await prisma.transaction.create({
      data: {
        id: uuidv4(),
        userId: testUserId,
        accountId,
        category: categoryId,
        type: 'expense',
        amount: 85.00,
        description: 'Electricity Bill Payment',
        date: '2026-06-05',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    });

    // Run detector
    let suggestions = await dbService.detectRecurringBills(testUserId);

    // Netflix (low confidence) should be detected.
    const netflixSug = suggestions.find((s: any) => s.description.includes('Netflix'));
    expect(netflixSug).toBeDefined();
    expect(netflixSug.confidence).toBe('low');

    // Electricity noise (only 1 transaction) should NOT be suggested.
    const electricitySug = suggestions.find((s: any) => s.description.includes('Electricity'));
    expect(electricitySug).toBeUndefined();

    // 3. Add a second "Electricity" transaction separated by 30 days
    const secondElectricityTxn = await prisma.transaction.create({
      data: {
        id: uuidv4(),
        userId: testUserId,
        accountId,
        category: categoryId,
        type: 'expense',
        amount: 85.00,
        description: 'Electricity Bill Payment',
        date: '2026-07-05',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    });

    // Run detector again
    suggestions = await dbService.detectRecurringBills(testUserId);

    // Now Electricity should be detected as it has 2 transactions (high confidence because amounts & interval are consistent)
    const activeElectricitySug = suggestions.find((s: any) => s.description.includes('Electricity'));
    expect(activeElectricitySug).toBeDefined();
    expect(activeElectricitySug.confidence).toBe('high');
  });

  it('should support dismissing suggestions and undismissing (restoring) them', async () => {
    // Let's check suggestions (we expect Netflix to be suggested)
    let suggestions = await dbService.detectRecurringBills(testUserId);
    let netflixSug = suggestions.find((s: any) => s.description.includes('Netflix'));
    expect(netflixSug).toBeDefined();

    // Dismiss it
    await dbService.dismissRecurringBill(testUserId, 'Netflix Subscription');

    // Check suggestions again
    suggestions = await dbService.detectRecurringBills(testUserId);
    netflixSug = suggestions.find((s: any) => s.description.includes('Netflix'));
    // Netflix should now be hidden
    expect(netflixSug).toBeUndefined();

    // Undismiss (restore) it
    await dbService.undismissRecurringBill(testUserId, 'Netflix Subscription');

    // Check suggestions again
    suggestions = await dbService.detectRecurringBills(testUserId);
    netflixSug = suggestions.find((s: any) => s.description.includes('Netflix'));
    // Netflix should show up again
    expect(netflixSug).toBeDefined();
    expect(netflixSug.confidence).toBe('low');
  });
});

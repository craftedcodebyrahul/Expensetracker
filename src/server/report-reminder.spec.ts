import 'dotenv/config';
process.env['TURSO_DATABASE_URL'] = 'file:./dev.db';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { v4 as uuidv4 } from 'uuid';

const userId = 'dev_test_user_id';

function getFutureDateString(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

describe('Scheduled Bill Reminders Email Notification Verification', () => {
  let accountId: string;
  let scheduleId: string;
  let prisma: any;
  let reportService: any;

  beforeAll(async () => {
    // Dynamically import db and reportService after setting env variables
    const dbModule = await import('./db.js');
    prisma = dbModule.prisma;
    const reportModule = await import('./report.service.js');
    reportService = reportModule.reportService;

    // 1. Ensure test user exists with active test email
    const testEmail = process.env['EMAIL_SMTP_USER'] || 'dev_test@example.com';
    await prisma.user.upsert({
      where: { id: userId },
      update: { email: testEmail },
      create: {
        id: userId,
        email: testEmail,
        name: 'Dev Test User',
        createdAt: new Date().toISOString()
      }
    });

    // 2. Ensure test account exists
    const account = await prisma.account.create({
      data: {
        id: uuidv4(),
        userId,
        name: 'Test Wallet',
        type: 'asset',
        currency: 'USD',
        createdAt: new Date().toISOString()
      }
    });
    accountId = account.id;
  });

  afterAll(async () => {
    // Clean up
    if (scheduleId) {
      await prisma.recurringSchedule.deleteMany({ where: { id: scheduleId } });
    }
    if (accountId) {
      await prisma.account.deleteMany({ where: { id: accountId } });
    }
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('should successfully query database and trigger email reminder for bills due tomorrow', async () => {
    const tomorrowStr = getFutureDateString(1);
    
    // Create recurring schedule due tomorrow with emailReminder enabled
    const schedule = await prisma.recurringSchedule.create({
      data: {
        id: uuidv4(),
        userId,
        type: 'expense',
        amount: 25.50,
        category: 'utilities',
        description: 'Test Bill Reminder Payment',
        frequency: 'monthly',
        startDate: new Date().toISOString().split('T')[0],
        nextDueDate: tomorrowStr,
        accountId,
        isActive: 1,
        emailReminder: 1,
        reminderDaysBefore: 1,
        createdAt: new Date().toISOString()
      }
    });
    scheduleId = schedule.id;

    // Simulate daily cron query logic
    const tomorrowQueryStr = getFutureDateString(1);
    const dayAfterTomorrowQueryStr = getFutureDateString(2);

    const schedulesToRemind = await prisma.recurringSchedule.findMany({
      where: {
        isActive: 1,
        emailReminder: 1,
        OR: [
          { nextDueDate: tomorrowQueryStr, reminderDaysBefore: 1 },
          { nextDueDate: dayAfterTomorrowQueryStr, reminderDaysBefore: 2 }
        ]
      },
      include: {
        user: true
      }
    });

    // Verify query retrieved the created schedule
    const found = schedulesToRemind.find(s => s.id === scheduleId);
    expect(found).toBeDefined();
    expect(found?.emailReminder).toBe(1);
    expect(found?.reminderDaysBefore).toBe(1);

    // Trigger email reminder send
    console.log(`✉️ Triggering bill payment email reminder to: ${found?.user.email}`);
    const emailResult = await reportService.sendUpcomingBillReminder(found, 1);
    
    expect(emailResult).toHaveProperty('messageId');
    console.log(`✉️ Test Email sent successfully! MessageID: ${emailResult.messageId}`);
  });
});

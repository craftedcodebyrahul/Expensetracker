import cron from 'node-cron';
import { prisma } from './db.js';
import { reportService } from './report.service.js';

function getFutureDateString(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function startReportScheduler() {
  console.log('⏰ Report Scheduler: Initializing monthly cron worker...');

  // Pattern '0 0 1 * *' represents:
  // Minute: 0, Hour: 0, Day of Month: 1, Month: *, Day of Week: *
  // This triggers exactly at 00:00 (Midnight) on the 1st of every calendar month.
  cron.schedule('0 0 1 * *', async () => {
    console.log('⏰ Report Scheduler: Running scheduled monthly financial audit job...');
    
    try {
      // Find all users who enabled monthly email reports
      const optedInSettings = await prisma.settings.findMany({
        where: { monthlyReportEnabled: 1 },
        select: { userId: true },
      });

      if (optedInSettings.length === 0) {
        console.log('⏰ Report Scheduler: No users have monthly reports enabled. Skipping.');
        return;
      }

      console.log(`⏰ Report Scheduler: Found ${optedInSettings.length} user(s) opted in. Dispatched tasks...`);

      for (const settings of optedInSettings) {
        try {
          await reportService.sendMonthlyReport(settings.userId);
        } catch (err: any) {
          console.error(
            `❌ Report Scheduler: Failed to send report to user ${settings.userId}:`,
            err?.message || err
          );
        }
      }
    } catch (err: any) {
      console.error('❌ Report Scheduler: Critical failure querying settings:', err?.message || err);
    }
  });

  console.log('⏰ Report Scheduler: Initializing daily bill reminder worker...');

  // Daily at 08:00 AM ('0 8 * * *')
  cron.schedule('0 8 * * *', async () => {
    console.log('⏰ Report Scheduler: Running scheduled daily bill reminder job...');
    
    try {
      const tomorrowStr = getFutureDateString(1);
      const dayAfterTomorrowStr = getFutureDateString(2);

      const schedulesToRemind = await prisma.recurringSchedule.findMany({
        where: {
          isActive: 1,
          emailReminder: 1,
          OR: [
            { nextDueDate: tomorrowStr, reminderDaysBefore: 1 },
            { nextDueDate: dayAfterTomorrowStr, reminderDaysBefore: 2 }
          ]
        },
        include: {
          user: true
        }
      });

      if (schedulesToRemind.length === 0) {
        console.log('⏰ Report Scheduler: No bills require reminders today.');
        return;
      }

      console.log(`⏰ Report Scheduler: Found ${schedulesToRemind.length} bill(s) to remind. Sending...`);

      for (const schedule of schedulesToRemind) {
        try {
          const daysBefore = schedule.nextDueDate === tomorrowStr ? 1 : 2;
          await reportService.sendUpcomingBillReminder(schedule, daysBefore);
        } catch (err: any) {
          console.error(
            `❌ Report Scheduler: Failed to send bill reminder for schedule ${schedule.id}:`,
            err?.message || err
          );
        }
      }
    } catch (err: any) {
      console.error('❌ Report Scheduler: Daily reminder task critical failure:', err?.message || err);
    }
  });

  console.log('⏰ Report Scheduler: Cron workers initialized successfully!');
}


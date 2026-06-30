import cron from 'node-cron';
import { prisma } from './db.js';
import { reportService } from './report.service.js';

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

  console.log('⏰ Report Scheduler: Cron worker started and scheduled for the 1st of every month!');
}

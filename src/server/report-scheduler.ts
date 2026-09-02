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

export async function checkAndSendBillReminders(targetUserId?: string): Promise<{ sentCount: number; details: string[] }> {
  console.log(`⏰ Report Scheduler: Checking bill reminders${targetUserId ? ` for user ${targetUserId}` : ''}...`);
  const details: string[] = [];
  let sentCount = 0;

  try {
    const settingsList = await prisma.settings.findMany({
      where: {
        billRemindersEnabled: 1,
        ...(targetUserId ? { userId: targetUserId } : {}),
      },
    });

    if (settingsList.length === 0) {
      console.log('⏰ Report Scheduler: No users with bill reminders enabled.');
      return { sentCount: 0, details: ['No users have bill reminders enabled in Settings.'] };
    }

    for (const userSetting of settingsList) {
      const globalDaysBefore = userSetting.billReminderDaysBefore || 2;

      // Find all active schedules for this user
      const schedules = await prisma.recurringSchedule.findMany({
        where: {
          userId: userSetting.userId,
          isActive: 1,
        },
        include: {
          user: true,
        },
      });

      for (const schedule of schedules) {
        // Skip if per-schedule emailReminder is explicitly turned off (0)
        if (schedule.emailReminder === 0) continue;

        const effectiveDaysBefore = userSetting.billReminderDaysBefore || 2;
        const targetDateStr = getFutureDateString(effectiveDaysBefore);

        if (schedule.nextDueDate === targetDateStr) {
          try {
            await reportService.sendUpcomingBillReminder(schedule, effectiveDaysBefore);
            sentCount++;
            details.push(`Sent reminder for "${schedule.description}" ($${schedule.amount}) due on ${schedule.nextDueDate} (${effectiveDaysBefore} day(s) prior)`);
          } catch (err: any) {
            console.error(`❌ Failed to send bill reminder for schedule ${schedule.id}:`, err?.message || err);
            details.push(`Failed for "${schedule.description}": ${err?.message || err}`);
          }
        }
      }
    }
  } catch (err: any) {
    console.error('❌ Critical error in checkAndSendBillReminders:', err?.message || err);
    details.push(`Error: ${err?.message || err}`);
  }

  return { sentCount, details };
}

export function startReportScheduler() {
  console.log('⏰ Report Scheduler: Initializing monthly cron worker...');

  // Monthly cron at midnight on 1st of every month
  cron.schedule('0 0 1 * *', async () => {
    console.log('⏰ Report Scheduler: Running scheduled monthly financial audit job...');
    
    try {
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
    await checkAndSendBillReminders();
  });

  console.log('⏰ Report Scheduler: Cron workers initialized successfully!');
}

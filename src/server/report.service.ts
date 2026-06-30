import nodemailer from 'nodemailer';
import { prisma } from './db.js';
import { dbService } from './db.service.js';

export class ReportService {
  private getTransporter() {
    const user = process.env['EMAIL_SMTP_USER'];
    const pass = process.env['EMAIL_SMTP_PASS'];
    const host = process.env['EMAIL_SMTP_HOST'] || 'smtp.gmail.com';
    const port = Number(process.env['EMAIL_SMTP_PORT']) || 465;

    if (!user || !pass) {
      throw new Error(
        'SMTP email credentials are not configured. Please set EMAIL_SMTP_USER and EMAIL_SMTP_PASS in your .env file.'
      );
    }

    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }

  private getPreviousMonthRange() {
    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth(); // 0-indexed month is previous month (e.g. July (6) -> June (5))

    if (month === 0) {
      month = 12;
      year -= 1;
    }

    const monthStr = String(month).padStart(2, '0');
    const monthsList = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const monthName = monthsList[month - 1];

    return {
      prefix: `${year}-${monthStr}`,
      year,
      month,
      label: `${monthName} ${year}`,
    };
  }

  async generateReportData(userId: string) {
    const { prefix, year, month, label } = this.getPreviousMonthRange();

    // 1. Fetch user & preferences
    const user = await prisma.user.findFirst({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    const settings = await dbService.getSettings(userId);
    const symbol = settings.currencySymbol || '$';

    // Helper to format currency
    const formatCurrency = (amt: number) => {
      const formatted = Math.abs(amt).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      return `${amt < 0 ? '-' : ''}${symbol}${formatted}`;
    };

    // 2. Query transactions for the previous month
    const txns = await prisma.transaction.findMany({
      where: {
        userId,
        date: { startsWith: prefix },
      },
    });

    let totalIncome = 0;
    let totalExpense = 0;
    const catExpenses: Record<string, number> = {};

    txns.forEach((t: any) => {
      if (t.type === 'income') {
        totalIncome += t.amount;
      } else if (t.type === 'expense') {
        totalExpense += t.amount;
        catExpenses[t.category] = (catExpenses[t.category] || 0) + t.amount;
      }
    });

    const netSavings = totalIncome - totalExpense;
    const savingsRate = totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0;

    // 3. Category Names Map
    const categories = await dbService.getCategories(userId);
    const catMap = new Map<string, { name: string; icon: string }>();
    categories.forEach(c => catMap.set(c.id, { name: c.name, icon: c.icon }));

    const topCategories = Object.entries(catExpenses)
      .map(([catId, amount]) => {
        const catInfo = catMap.get(catId) || { name: catId, icon: '💰' };
        return {
          name: catInfo.name,
          icon: catInfo.icon,
          amount,
        };
      })
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    // 4. Budget Overruns
    const budgets = await prisma.budget.findMany({
      where: { userId, year, month },
    });
    const budgetOverruns: any[] = [];
    budgets.forEach((b: any) => {
      const spent = catExpenses[b.categoryId] || 0;
      if (spent > b.amount) {
        const catInfo = catMap.get(b.categoryId) || { name: b.categoryId, icon: '🎯' };
        budgetOverruns.push({
          name: catInfo.name,
          icon: catInfo.icon,
          limit: b.amount,
          spent,
          overrun: spent - b.amount,
        });
      }
    });

    // 5. Runway Projection
    const accounts = await dbService.getAccounts(userId);
    let totalAssets = 0;
    accounts.forEach((acc: any) => {
      if (acc.type === 'asset') {
        totalAssets += acc.initialBalance || 0;
      } else if (acc.type === 'liability') {
        totalAssets -= acc.initialBalance || 0;
      }
    });

    const avgDailySpend = totalExpense / 30;
    const runwayDays = avgDailySpend > 0 ? Math.round(totalAssets / avgDailySpend) : 999;

    // 6. Recent Alerts/Anomalies
    const anomalies = await dbService.scanForAnomalies(userId);
    const recentAnomalies = anomalies.slice(0, 3).map((a: any) => ({
      title: a.title,
      description: a.description,
      amount: a.amount,
    }));

    return {
      user,
      monthLabel: label,
      totalIncome,
      totalExpense,
      netSavings,
      savingsRate,
      topCategories,
      budgetOverruns,
      totalAssets,
      runwayDays,
      recentAnomalies,
      formatCurrency,
    };
  }

  buildHtmlReport(data: any): string {
    const {
      user,
      monthLabel,
      totalIncome,
      totalExpense,
      netSavings,
      savingsRate,
      topCategories,
      budgetOverruns,
      totalAssets,
      runwayDays,
      recentAnomalies,
      formatCurrency,
    } = data;

    const netSavingsColor = netSavings >= 0 ? '#66bb6a' : '#ef5350';
    const savingsRateFormatted = savingsRate >= 0 ? `${savingsRate.toFixed(1)}%` : '0%';

    // Top categories list HTML
    const categoriesHtml = topCategories.length > 0
      ? topCategories.map((c: any) => `
        <tr style="border-bottom: 1px solid #232d42;">
          <td style="padding: 10px 0; font-size: 14px; color: #f3f4f6;">
            <span style="margin-right: 8px;">${c.icon}</span> ${c.name}
          </td>
          <td style="padding: 10px 0; font-size: 14px; text-align: right; color: #ef5350; font-weight: 600;">
            ${formatCurrency(c.amount)}
          </td>
        </tr>
      `).join('')
      : `<tr><td colspan="2" style="padding: 15px 0; text-align: center; color: #9ca3af; font-size: 14px;">No expense records this month.</td></tr>`;

    // Overruns list HTML
    const overrunsHtml = budgetOverruns.length > 0
      ? budgetOverruns.map((o: any) => `
        <div style="background-color: rgba(239, 83, 80, 0.08); border: 1px solid rgba(239, 83, 80, 0.25); border-radius: 8px; padding: 12px; margin-bottom: 10px;">
          <div style="display: flex; justify-content: space-between; font-weight: 600; font-size: 13px; color: #ef5350;">
            <span>${o.icon} ${o.name}</span>
            <span>Over by ${formatCurrency(o.overrun)}</span>
          </div>
          <div style="font-size: 12px; color: #9ca3af; margin-top: 4px;">
            Limit: ${formatCurrency(o.limit)} · Spent: ${formatCurrency(o.spent)}
          </div>
        </div>
      `).join('')
      : `<p style="margin: 0; color: #66bb6a; font-size: 13px; font-weight: 500;">🏆 Brilliant! No budget limits were exceeded this month.</p>`;

    // Anomaly alerts HTML
    const anomaliesHtml = recentAnomalies.length > 0
      ? recentAnomalies.map((a: any) => `
        <div style="background-color: rgba(255, 193, 7, 0.08); border: 1px solid rgba(255, 193, 7, 0.25); border-radius: 8px; padding: 12px; margin-bottom: 10px;">
          <div style="font-weight: 600; font-size: 13px; color: #ffb300;">⚠️ ${a.title}</div>
          <div style="font-size: 12px; color: #9ca3af; margin-top: 4px;">${a.description}</div>
        </div>
      `).join('')
      : `<p style="margin: 0; color: #66bb6a; font-size: 13px; font-weight: 500;">✅ Clean ledger! No transaction duplicate flags or anomalies found.</p>`;

    // Build complete Premium HTML template
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TCFlow Monthly Report</title>
</head>
<body style="background-color: #0b0e14; color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #111622; border: 1px solid #232d42; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.4);">
    
    <!-- Top Header Banner -->
    <div style="background: linear-gradient(135deg, #5c6bc0 0%, #2196f3 100%); padding: 30px 20px; text-align: center;">
      <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(255,255,255,0.75);">FinTrack Pro</div>
      <h1 style="margin: 5px 0 0 0; font-size: 24px; color: #ffffff; font-weight: 800;">Monthly Financial Audit</h1>
      <p style="margin: 5px 0 0 0; font-size: 14px; color: #e3f2fd;">Compiled summary for <strong>${monthLabel}</strong></p>
    </div>

    <!-- User greeting -->
    <div style="padding: 24px 20px 0 20px;">
      <p style="margin: 0; font-size: 15px; color: #9ca3af;">Hello <strong>${user.name}</strong>,</p>
      <p style="margin: 8px 0 0 0; font-size: 14px; color: #9ca3af; line-height: 1.4;">Here is your personal monthly financial breakdown. All calculations are customized to your account configurations.</p>
    </div>

    <!-- Overview Statistics Row -->
    <div style="padding: 20px; display: grid; gap: 12px;">
      
      <!-- Net Savings Card -->
      <div style="background-color: #181f2f; border: 1px solid #232d42; border-radius: 12px; padding: 18px; text-align: center;">
        <span style="font-size: 11px; text-transform: uppercase; font-weight: 600; color: #9ca3af; letter-spacing: 0.05em;">Net Cashflow / Savings</span>
        <h2 style="margin: 6px 0; font-size: 28px; color: ${netSavingsColor}; font-weight: 800;">${formatCurrency(netSavings)}</h2>
        <span style="font-size: 12px; color: #9ca3af;">Savings Rate: <strong>${savingsRateFormatted}</strong></span>
      </div>

      <!-- Income & Expense split cards -->
      <table style="width: 100%; border-collapse: collapse; margin-top: 8px;">
        <tr>
          <td style="width: 48%; padding: 0 8px 0 0;">
            <div style="background-color: #181f2f; border: 1px solid #232d42; border-radius: 12px; padding: 15px; text-align: center;">
              <span style="font-size: 10px; text-transform: uppercase; color: #9ca3af; font-weight: 600;">Total Inflow</span>
              <div style="font-size: 18px; color: #66bb6a; font-weight: 700; margin-top: 4px;">${formatCurrency(totalIncome)}</div>
            </div>
          </td>
          <td style="width: 48%; padding: 0 0 0 8px;">
            <div style="background-color: #181f2f; border: 1px solid #232d42; border-radius: 12px; padding: 15px; text-align: center;">
              <span style="font-size: 10px; text-transform: uppercase; color: #9ca3af; font-weight: 600;">Total Outflow</span>
              <div style="font-size: 18px; color: #ef5350; font-weight: 700; margin-top: 4px;">${formatCurrency(totalExpense)}</div>
            </div>
          </td>
        </tr>
      </table>
    </div>

    <!-- Runway Card -->
    <div style="margin: 0 20px 20px 20px; background-color: rgba(33, 150, 243, 0.08); border: 1px solid rgba(33, 150, 243, 0.2); border-radius: 12px; padding: 15px; display: flex; align-items: center; justify-content: space-between;">
      <div>
        <div style="font-size: 11px; text-transform: uppercase; color: #9ca3af; font-weight: 600; letter-spacing: 0.05em;">Estimated Runway</div>
        <div style="font-size: 18px; font-weight: 700; color: #64b5f6; margin-top: 2px;">
          ${runwayDays === 999 ? 'Infinite' : `${runwayDays} Days`}
        </div>
      </div>
      <div style="text-align: right;">
        <div style="font-size: 11px; text-transform: uppercase; color: #9ca3af; font-weight: 600; letter-spacing: 0.05em;">Assets Balance</div>
        <div style="font-size: 15px; font-weight: 700; color: #f3f4f6; margin-top: 2px;">${formatCurrency(totalAssets)}</div>
      </div>
    </div>

    <!-- Top Spending Categories Section -->
    <div style="padding: 0 20px 20px 20px;">
      <h3 style="margin: 0 0 10px 0; font-size: 16px; color: #f3f4f6; border-bottom: 2px solid #232d42; padding-bottom: 8px;">📊 Top Spending Categories</h3>
      <table style="width: 100%; border-collapse: collapse;">
        ${categoriesHtml}
      </table>
    </div>

    <!-- Budgets & Alerts Grid -->
    <div style="padding: 0 20px 24px 20px;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <!-- Budget warnings -->
          <td style="width: 48%; padding: 0 10px 0 0; vertical-align: top;">
            <h3 style="margin: 0 0 10px 0; font-size: 15px; color: #f3f4f6; border-bottom: 2px solid #232d42; padding-bottom: 6px;">🎯 Budget Overruns</h3>
            ${overrunsHtml}
          </td>
          <!-- Anomalies -->
          <td style="width: 48%; padding: 0 0 0 10px; vertical-align: top;">
            <h3 style="margin: 0 0 10px 0; font-size: 15px; color: #f3f4f6; border-bottom: 2px solid #232d42; padding-bottom: 6px;">⚠️ Smart Audit Alerts</h3>
            ${anomaliesHtml}
          </td>
        </tr>
      </table>
    </div>

    <!-- Footer -->
    <div style="background-color: #0b0e14; padding: 24px 20px; border-top: 1px solid #232d42; text-align: center;">
      <p style="margin: 0; font-size: 12px; color: #6b7280;">You received this email because you opted in to monthly reports in your account settings.</p>
      <p style="margin: 6px 0 0 0; font-size: 12px; color: #6b7280;">To unsubscribe, update your preferences at <a href="${process.env['GOOGLE_REDIRECT_URI']?.replace('/auth/google/callback', '') ?? 'http://localhost:4000'}/settings" style="color: #64b5f6; text-decoration: none;">TCFlow Settings</a></p>
      <p style="margin: 18px 0 0 0; font-size: 11px; color: #4b5563;">© 2026 TCFlow Inc. All rights reserved.</p>
    </div>

  </div>
</body>
</html>
    `;
  }

  async sendMonthlyReport(userId: string) {
    const reportData = await this.generateReportData(userId);
    const html = this.buildHtmlReport(reportData);

    const transporter = this.getTransporter();
    const from = process.env['EMAIL_FROM'] || `"FinTrack Pro" <${process.env['EMAIL_SMTP_USER']}>`;

    const info = await transporter.sendMail({
      from,
      to: reportData.user.email,
      subject: `📊 FinTrack Pro: Monthly Financial Audit - ${reportData.monthLabel}`,
      html,
    });

    console.log(`✉️ Email report successfully sent to ${reportData.user.email} (MessageID: ${info.messageId})`);
    return info;
  }
}

export const reportService = new ReportService();

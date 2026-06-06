/**
 * src/server/migrate-from-sheets.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * ONE-TIME migration script: reads all data from the user's Google Spreadsheet
 * and inserts it into Turso DB via Prisma.
 *
 * Usage (after building):
 *   GOOGLE_ACCESS_TOKEN="ya29.xxx"  SPREADSHEET_ID="1abc..." MIGRATE_USER_ID="11831..." \
 *   node dist/Expensetracker/server/migrate-from-sheets.mjs
 *
 * Or set all in .env and run:
 *   node -r dotenv/config dist/Expensetracker/server/migrate-from-sheets.mjs
 *
 * Environment variables required:
 *   GOOGLE_ACCESS_TOKEN   — short-lived token (get from /auth/me after login)
 *   SPREADSHEET_ID        — the Google Spreadsheet ID
 *   MIGRATE_USER_ID       — the Google sub (user ID) to assign all migrated data
 *
 * The script is idempotent — safe to run multiple times (uses upsert with original IDs).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import 'dotenv/config';
import { google } from 'googleapis';
import { prisma } from './db.js';

// ── Sheet helpers ─────────────────────────────────────────────────────────────

function parseTags(tagsStr: string | undefined): string {
  if (!tagsStr) return '[]';
  try {
    // If already JSON, validate it
    const parsed = JSON.parse(tagsStr);
    if (Array.isArray(parsed)) return JSON.stringify(parsed);
  } catch {}
  // Otherwise it's a comma-separated string from old Sheets format
  return JSON.stringify(tagsStr.split(',').map(t => t.trim()).filter(Boolean));
}

function toFloat(val: string | undefined): number {
  return parseFloat(val ?? '0') || 0;
}

function toBool(val: string | undefined): number {
  return val === 'true' || val === '1' ? 1 : 0;
}

function safeStr(val: string | undefined): string | null {
  return (val && val.trim()) ? val.trim() : null;
}

// ── Main migration ────────────────────────────────────────────────────────────

export async function runMigration(): Promise<void> {
  const accessToken  = process.env['GOOGLE_ACCESS_TOKEN'];
  const spreadsheetId = process.env['SPREADSHEET_ID'];
  const userId       = process.env['MIGRATE_USER_ID'];

  if (!accessToken || !spreadsheetId || !userId) {
    console.error('❌ Missing env vars: GOOGLE_ACCESS_TOKEN, SPREADSHEET_ID, MIGRATE_USER_ID');
    process.exit(1);
  }

  // Build a Sheets client with the provided access token
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const sheets = google.sheets({ version: 'v4', auth });

  const getRows = async (range: string): Promise<string[][]> => {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    const rows = res.data.values ?? [];
    return rows.length > 1 ? rows.slice(1) as string[][] : []; // skip header row
  };

  const now = new Date().toISOString();
  let counts = {
    users: 0, accounts: 0, categories: 0, budgets: 0,
    recurring: 0, transactions: 0, settings: 0,
  };

  console.log('🚀 Starting migration from Google Sheets → Turso DB');
  console.log(`   User ID: ${userId}`);
  console.log(`   Spreadsheet: ${spreadsheetId}\n`);

  // ── Step 1: Ensure user exists ────────────────────────────────────────────

  await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: {
      id: userId,
      email: process.env['MIGRATE_USER_EMAIL'] ?? 'migrated@user.com',
      name:  process.env['MIGRATE_USER_NAME']  ?? 'Migrated User',
      picture: '',
      createdAt: now,
    },
  });
  counts.users = 1;
  console.log('✅ User row ensured');

  // ── Step 2: Settings ──────────────────────────────────────────────────────

  try {
    const settingsRows = await getRows('Settings!A:B');
    const settingsMap: Record<string, string> = {};
    settingsRows.forEach(([key, val]) => { if (key) settingsMap[key] = val; });

    await prisma.settings.upsert({
      where: { userId },
      update: {
        currency:       settingsMap['currency']       ?? 'USD',
        currencySymbol: settingsMap['currencySymbol'] ?? '$',
        dateFormat:     settingsMap['dateFormat']     ?? 'MM/dd/yyyy',
        theme:          settingsMap['theme']          ?? 'dark',
        updatedAt: now,
      },
      create: {
        userId,
        currency:       settingsMap['currency']       ?? 'USD',
        currencySymbol: settingsMap['currencySymbol'] ?? '$',
        dateFormat:     settingsMap['dateFormat']     ?? 'MM/dd/yyyy',
        theme:          settingsMap['theme']          ?? 'dark',
        updatedAt: now,
      },
    });
    counts.settings = 1;
    console.log('✅ Settings migrated');
  } catch (e) { console.warn('⚠️  Settings migration failed:', e); }

  // ── Step 3: Accounts ──────────────────────────────────────────────────────

  try {
    // Columns: id, name, type, createdAt, initialBalance
    const rows = await getRows('Accounts!A:E');
    let done = 0;
    for (const [id, name, type, createdAt, initialBalance] of rows) {
      if (!id || !name || !type) continue;
      await prisma.account.upsert({
        where: { id },
        update: { name, type, initialBalance: toFloat(initialBalance) },
        create: {
          id, userId, name,
          type: (type === 'asset' || type === 'liability') ? type : 'asset',
          initialBalance: toFloat(initialBalance),
          createdAt: createdAt ?? now,
        },
      });
      done++;
    }
    counts.accounts = done;
    console.log(`✅ ${done} accounts migrated`);
  } catch (e) { console.warn('⚠️  Accounts migration failed:', e); }

  // ── Step 4: Categories ────────────────────────────────────────────────────

  try {
    // Columns: id, name, type, icon, color, budget, createdAt
    const rows = await getRows('Categories!A:G');
    let done = 0;
    for (const [id, name, type, icon, color, budget, createdAt] of rows) {
      if (!id || !name) continue;
      await prisma.category.upsert({
        where: { id },
        update: { name, type, icon: icon ?? '💰', color: color ?? '#607D8B', budget: toFloat(budget) || null },
        create: {
          id, userId, name,
          type: (['income', 'expense', 'both'].includes(type)) ? type : 'expense',
          icon: icon ?? '💰',
          color: color ?? '#607D8B',
          budget: toFloat(budget) || null,
          createdAt: createdAt ?? now,
        },
      });
      done++;
    }
    counts.categories = done;
    console.log(`✅ ${done} categories migrated`);
  } catch (e) { console.warn('⚠️  Categories migration failed:', e); }

  // ── Step 5: Budgets ───────────────────────────────────────────────────────

  try {
    // Columns: id, categoryId, categoryName, amount, period, month, year, createdAt
    const rows = await getRows('Budgets!A:H');
    let done = 0;
    for (const [id, categoryId, categoryName, amount, period, month, year, createdAt] of rows) {
      if (!id || !categoryId || !amount) continue;
      await prisma.budget.upsert({
        where: { id },
        update: { amount: toFloat(amount), period: period ?? 'monthly' },
        create: {
          id, userId, categoryId,
          categoryName: categoryName ?? categoryId,
          amount: toFloat(amount),
          period: (['monthly', 'yearly'].includes(period)) ? period : 'monthly',
          month: month ? parseInt(month) : null,
          year: parseInt(year) || new Date().getFullYear(),
          createdAt: createdAt ?? now,
        },
      });
      done++;
    }
    counts.budgets = done;
    console.log(`✅ ${done} budgets migrated`);
  } catch (e) { console.warn('⚠️  Budgets migration failed:', e); }

  // ── Step 6: Recurring Schedules ───────────────────────────────────────────

  try {
    // Columns: id, type, amount, category, description, frequency, startDate, nextDueDate, accountId, toAccountId, createdAt
    const rows = await getRows('Recurring!A:K');
    let done = 0;
    for (const [id, type, amount, category, description, frequency, startDate, nextDueDate, accountId, toAccountId, createdAt] of rows) {
      if (!id || !type || !amount || !frequency || !startDate || !accountId) continue;
      // Verify accountId exists in DB (skip if account wasn't migrated)
      const acc = await prisma.account.findFirst({ where: { id: accountId, userId } });
      if (!acc) { console.warn(`  ⚠️  Skipping recurring ${id}: account ${accountId} not found`); continue; }

      await prisma.recurringSchedule.upsert({
        where: { id },
        update: { amount: toFloat(amount), nextDueDate: nextDueDate ?? startDate },
        create: {
          id, userId,
          type: (['income', 'expense', 'transfer'].includes(type)) ? type : 'expense',
          amount: toFloat(amount),
          category: safeStr(category),
          description: description ?? '',
          frequency: (['daily', 'weekly', 'monthly', 'yearly'].includes(frequency)) ? frequency : 'monthly',
          startDate,
          nextDueDate: nextDueDate ?? startDate,
          accountId,
          toAccountId: safeStr(toAccountId),
          isActive: 1,
          createdAt: createdAt ?? now,
        },
      });
      done++;
    }
    counts.recurring = done;
    console.log(`✅ ${done} recurring schedules migrated`);
  } catch (e) { console.warn('⚠️  Recurring migration failed:', e); }

  // ── Step 7: Transactions ──────────────────────────────────────────────────

  try {
    // Columns: id, type, amount, category, description, date, tags, isRecurring,
    //          recurringFrequency, recurringId, paymentMethod, notes,
    //          createdAt, updatedAt, accountId, toAccountId
    const rows = await getRows('Transactions!A:P');
    let done = 0;
    let skipped = 0;

    for (const row of rows) {
      const [
        id, type, amount, category, description, date, tags, isRecurring,
        recurringFrequency, recurringId, paymentMethod, notes,
        createdAt, updatedAt, accountId, toAccountId,
      ] = row;

      if (!id || !type || !amount || !date || !accountId) { skipped++; continue; }

      // Verify account exists
      const acc = await prisma.account.findFirst({ where: { id: accountId, userId } });
      if (!acc) { skipped++; continue; }

      await prisma.transaction.upsert({
        where: { id },
        update: { updatedAt: updatedAt ?? now },
        create: {
          id, userId,
          type: (['income', 'expense', 'transfer'].includes(type)) ? type : 'expense',
          amount: toFloat(amount),
          category: safeStr(category),
          description: description ?? '',
          date,
          tags: parseTags(tags),
          isRecurring: toBool(isRecurring),
          recurringFrequency: safeStr(recurringFrequency),
          recurringId: safeStr(recurringId),
          paymentMethod: safeStr(paymentMethod),
          notes: safeStr(notes),
          accountId,
          toAccountId: safeStr(toAccountId),
          source: 'manual',
          importId: null,
          rawDescription: null,
          bankTransactionHash: null,
          createdAt: createdAt ?? now,
          updatedAt: updatedAt ?? now,
        },
      });
      done++;
    }

    counts.transactions = done;
    console.log(`✅ ${done} transactions migrated (${skipped} skipped)`);
  } catch (e) { console.warn('⚠️  Transactions migration failed:', e); }

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log('\n📊 Migration Summary:');
  console.table(counts);
  console.log('\n✅ Migration complete! You can now switch to Turso DB.');

  await prisma.$disconnect();
}

// Allow running directly as a script
runMigration().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});

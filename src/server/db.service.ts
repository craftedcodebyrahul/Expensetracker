/**
 * src/server/db.service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Drop-in replacement for sheets.service.ts — all methods have the same
 * signatures and return types, but use Prisma + Turso instead of Google Sheets.
 *
 * Key differences from SheetsService:
 * - Every method takes `userId` as first arg (multi-user isolation)
 * - Tags stored as JSON strings in DB, parsed/serialized here
 * - Booleans stored as integers (0/1) in SQLite, mapped here
 * - No caching layer needed — Turso latency is ~5-20ms vs Sheets ~300-800ms
 * - No processingLocks — Prisma $transaction() is ACID-safe
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { v4 as uuidv4 } from 'uuid';
import { prisma } from './db.js';

// ── Prisma row types (avoids implicit 'any' when @prisma/client is external) ──
interface PrismaRecurringScheduleRow {
  id: string; userId: string; type: string; amount: number;
  category: string | null; description: string; frequency: string;
  startDate: string; nextDueDate: string; accountId: string;
  toAccountId: string | null; isActive: number; createdAt: string;
  emailReminder: number; reminderDaysBefore: number;
}
interface PrismaCategoryRow {
  id: string; userId: string; name: string; type: string;
  icon: string; color: string; budget: number | null; createdAt: string;
}
interface PrismaAccountRow {
  id: string; userId: string; name: string; type: string;
  currency: string; initialBalance: number; isInvestment: number; createdAt: string;
  stockHoldings?: PrismaStockHoldingRow[];
}
interface PrismaStockHoldingRow {
  id: string; accountId: string; ticker: string;
  shares: number; price: number; costBasis: number; updatedAt: string;
}
interface PrismaBudgetRow {
  id: string; userId: string; categoryId: string; categoryName: string;
  amount: number; period: string; month: number | null; year: number; createdAt: string;
}
interface PrismaBankImportRow {
  id: string; userId: string; fileName: string; bankName: string | null;
  fileType: string; status: string; totalRows: number; importedCount: number;
  skippedCount: number; failedCount: number; dateFrom: string | null;
  dateTo: string | null; errorMessage: string | null;
  createdAt: string; completedAt: string | null;
}

// ── Types (mirrors sheets.service.ts exports) ─────────────────────────────────

export interface Transaction {
  id: string;
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  category: string;
  description: string;
  date: string;
  tags: string[];
  isRecurring: boolean;
  recurringFrequency?: string;
  recurringId?: string;
  paymentMethod?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  accountId: string;
  toAccountId?: string;
  source?: 'manual' | 'import' | 'recurring';
  importId?: string;
  rawDescription?: string;
  stockOrderId?: string;
}

export interface Category {
  id: string;
  name: string;
  type: 'income' | 'expense' | 'both';
  icon: string;
  color: string;
  budget?: number;
  createdAt: string;
}

export interface StockHolding {
  id: string;
  accountId: string;
  ticker: string;
  shares: number;
  price: number;
  costBasis: number;
  updatedAt: string;
}

export interface StockOrder {
  id: string;
  accountId: string;
  ticker: string;
  type: 'BUY' | 'SELL';
  shares: number;
  pricePerShare: number;
  date: string;
  transactionId?: string | null;
  createdAt: string;
}

export interface Account {
  id: string;
  name: string;
  type: 'asset' | 'liability';
  currency?: string;
  initialBalance?: number;
  isInvestment?: boolean;
  stockHoldings?: StockHolding[];
  createdAt?: string;
}

export interface Goal {
  id: string;
  userId?: string;
  name: string;
  targetAmount: number;
  targetDate: string;
  currentAmount: number;
  accountId?: string | null;
  createdAt?: string;
}

export interface Budget {
  id: string;
  categoryId: string;
  categoryName: string;
  amount: number;
  period: 'monthly' | 'yearly';
  month?: number;
  year: number;
  spent: number;       // computed
  remaining: number;   // computed
  percentage: number;  // computed
  createdAt: string;
}

export interface RecurringSchedule {
  id: string;
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  category: string;
  description: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  startDate: string;
  nextDueDate: string;
  accountId: string;
  toAccountId?: string;
  createdAt?: string;
  isActive?: boolean;
  emailReminder?: boolean;
  reminderDaysBefore?: number;
}

export interface AppSettings {
  currency: string;
  currencySymbol: string;
  dateFormat: string;
  theme: string;
  lastSync: string;
  monthlyReportEnabled?: boolean;
  billRemindersEnabled?: boolean;
  billReminderDaysBefore?: number;
  apiKey?: string;
}

export interface BankImport {
  id: string;
  userId: string;
  fileName: string;
  bankName?: string;
  fileType: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'partial';
  totalRows: number;
  importedCount: number;
  skippedCount: number;
  failedCount: number;
  dateFrom?: string;
  dateTo?: string;
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parse JSON tags string from DB → string[] */
function parseTags(tagsJson: string | null | undefined): string[] {
  try { return JSON.parse(tagsJson ?? '[]'); } catch { return []; }
}

/** Serialize tags array → JSON string for DB storage */
function serializeTags(tags: string[] | undefined | null): string {
  return JSON.stringify(tags ?? []);
}

/** Map DB row → Transaction (handles 0/1 booleans, JSON tags) */
function rowToTransaction(row: any): Transaction {
  return {
    id: row.id,
    type: row.type as Transaction['type'],
    amount: row.amount,
    category: row.category ?? '',
    description: row.description,
    date: row.date,
    tags: parseTags(row.tags),
    isRecurring: row.isRecurring === 1,
    recurringFrequency: row.recurringFrequency ?? undefined,
    recurringId: row.recurringId ?? undefined,
    paymentMethod: row.paymentMethod ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    accountId: row.accountId,
    toAccountId: row.toAccountId ?? undefined,
    source: (row.source as any) ?? 'manual',
    importId: row.importId ?? undefined,
    rawDescription: row.rawDescription ?? undefined,
    stockOrderId: row.stockOrderId ?? undefined,
  };
}

/** Advance a YYYY-MM-DD date string by a frequency */
function advanceDateByFrequency(dateStr: string, frequency: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const originalDay = date.getDate();
  if (frequency === 'daily')   { date.setDate(date.getDate() + 1); }
  else if (frequency === 'weekly')  { date.setDate(date.getDate() + 7); }
  else if (frequency === 'biweekly') { date.setDate(date.getDate() + 14); }
  else if (frequency === 'monthly') {
    date.setMonth(date.getMonth() + 1);
    if (date.getDate() !== originalDay) date.setDate(0); // handle month-end
  }
  else if (frequency === 'yearly') { date.setFullYear(date.getFullYear() + 1); }
  return date.toISOString().split('T')[0];
}

/** Fetch from Gemini API with exponential backoff retry for 503/429 errors */
async function fetchGeminiWithRetry(url: string, options: RequestInit, retries = 2, delayMs = 1000): Promise<Response> {
  let lastResponse: Response | null = null;
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) {
        return response;
      }
      lastResponse = response;
      if (response.status === 503 || response.status === 429) {
        console.warn(`Gemini API returned status ${response.status}. Retrying in ${delayMs}ms (attempt ${i + 1}/${retries})...`);
        if (i < retries) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
          delayMs *= 2; // exponential backoff
          continue;
        }
      }
      return response;
    } catch (err) {
      if (i === retries) {
        throw err;
      }
      console.warn(`Gemini API fetch error. Retrying in ${delayMs}ms...`, err);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      delayMs *= 2;
    }
  }
  return lastResponse!;
}

// ── Default seed data ─────────────────────────────────────────────────────────

const DEFAULT_CATEGORIES: Omit<Category, 'createdAt'>[] = [
  { id: 'food',          name: 'Food & Dining',      type: 'expense', icon: '🍽️', color: '#FF6384' },
  { id: 'transport',     name: 'Transportation',     type: 'expense', icon: '🚗', color: '#36A2EB' },
  { id: 'housing',       name: 'Housing & Rent',     type: 'expense', icon: '🏠', color: '#FFCE56' },
  { id: 'utilities',     name: 'Utilities',          type: 'expense', icon: '💡', color: '#4BC0C0' },
  { id: 'healthcare',    name: 'Healthcare',         type: 'expense', icon: '🏥', color: '#9966FF' },
  { id: 'entertainment', name: 'Entertainment',      type: 'expense', icon: '🎬', color: '#FF9F40' },
  { id: 'shopping',      name: 'Shopping',           type: 'expense', icon: '🛍️', color: '#FF6384' },
  { id: 'education',     name: 'Education',          type: 'expense', icon: '📚', color: '#36A2EB' },
  { id: 'travel',        name: 'Travel',             type: 'expense', icon: '✈️', color: '#4BC0C0' },
  { id: 'subscriptions', name: 'Subscriptions',      type: 'expense', icon: '📱', color: '#9966FF' },
  { id: 'insurance',     name: 'Insurance',          type: 'expense', icon: '🛡️', color: '#FFCE56' },
  { id: 'groceries',     name: 'Groceries',          type: 'expense', icon: '🛒', color: '#8BC34A' },
  { id: 'dining_out',    name: 'Dining Out',         type: 'expense', icon: '🍕', color: '#FF5722' },
  { id: 'fitness',       name: 'Fitness & Sports',   type: 'expense', icon: '🏋️', color: '#00BCD4' },
  { id: 'personal_care', name: 'Personal Care',      type: 'expense', icon: '💅', color: '#E91E63' },
  { id: 'pets',          name: 'Pets',               type: 'expense', icon: '🐾', color: '#795548' },
  { id: 'gifts_given',   name: 'Gifts Given',        type: 'expense', icon: '🎁', color: '#9C27B0' },
  { id: 'taxes',         name: 'Taxes & Fees',       type: 'expense', icon: '🧾', color: '#607D8B' },
  { id: 'other_expense', name: 'Other Expenses',     type: 'expense', icon: '💸', color: '#C9CBCF' },
  { id: 'salary',        name: 'Salary',             type: 'income',  icon: '💼', color: '#4CAF50' },
  { id: 'freelance',     name: 'Freelance',          type: 'income',  icon: '💻', color: '#8BC34A' },
  { id: 'investment',    name: 'Investment Returns', type: 'income',  icon: '📈', color: '#00BCD4' },
  { id: 'rental',        name: 'Rental Income',      type: 'income',  icon: '🏘️', color: '#FF9800' },
  { id: 'business',      name: 'Business Income',    type: 'income',  icon: '🏢', color: '#9C27B0' },
  { id: 'bonus',         name: 'Bonus',              type: 'income',  icon: '🎯', color: '#F44336' },
  { id: 'gift_received', name: 'Gifts Received',     type: 'income',  icon: '🎁', color: '#E91E63' },
  { id: 'refund',        name: 'Refunds',            type: 'income',  icon: '↩️', color: '#00BCD4' },
  { id: 'side_hustle',   name: 'Side Hustle',        type: 'income',  icon: '⚡', color: '#FF9800' },
  { id: 'other_income',  name: 'Other Income',       type: 'income',  icon: '💰', color: '#607D8B' },
];

const DEFAULT_ACCOUNTS: Omit<Account, 'createdAt'>[] = [
  { id: 'chequing',     name: 'Chequing Account', type: 'asset',     initialBalance: 0 },
  { id: 'cash_overseas', name: 'Overseas Cash',   type: 'asset',     initialBalance: 0 },
  { id: 'credit_card',  name: 'Credit Card',      type: 'liability', initialBalance: 0 },
  { id: 'debt_line',    name: 'Debt Line',         type: 'liability', initialBalance: 0 },
];

const EXCHANGE_RATES: Record<string, number> = {
  USD: 1.0,
  EUR: 0.92,
  GBP: 0.78,
  INR: 83.5,
  CAD: 1.37,
  AUD: 1.51,
  JPY: 157.0,
};

let cachedRates: Record<string, number> = { ...EXCHANGE_RATES };
let lastRatesFetch = 0;

export async function getExchangeRates(): Promise<Record<string, number>> {
  const now = Date.now();
  if (now - lastRatesFetch < 3600000) {
    return cachedRates;
  }
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (res.ok) {
      const data = await res.json() as any;
      if (data && data.rates) {
        cachedRates = data.rates;
        lastRatesFetch = now;
      }
    }
  } catch (err) {
    console.error('Failed to fetch exchange rates, using fallback:', err);
  }
  return cachedRates;
}

// ── DbService ─────────────────────────────────────────────────────────────────

export class DbService {

  // ── User Initialization ───────────────────────────────────────────────────

  /** Called on first login — seeds categories, accounts, and settings for new users */
  async initializeUser(userId: string): Promise<void> {
    const now = new Date().toISOString();

    // Seed settings if not present
    await prisma.settings.upsert({
      where: { userId },
      update: {},
      create: { userId, updatedAt: now },
    });

    // Seed categories only if none exist for this user
    const catCount = await prisma.category.count({ where: { userId } });
    if (catCount === 0) {
      await prisma.category.createMany({
        data: DEFAULT_CATEGORIES.map(c => ({
          ...c,
          id: uuidv4(),
          userId,
          createdAt: now,
        })),
      });
      console.log(`✅ Seeded ${DEFAULT_CATEGORIES.length} default categories for user ${userId}`);
    }

    // Seed accounts only if none exist
    const accCount = await prisma.account.count({ where: { userId } });
    if (accCount === 0) {
      await prisma.account.createMany({
        data: DEFAULT_ACCOUNTS.map(a => ({
          ...a,
          id: uuidv4(),
          userId,
          createdAt: now,
          initialBalance: a.initialBalance ?? 0,
        })),
      });
      console.log(`✅ Seeded ${DEFAULT_ACCOUNTS.length} default accounts for user ${userId}`);
    }
  }

  // ── Transactions ──────────────────────────────────────────────────────────

  async getTransactions(userId: string, clientDateStr?: string): Promise<Transaction[]> {
    const today = clientDateStr ?? new Date().toLocaleDateString('en-CA');

    // Process recurring schedules atomically before returning transactions
    await this.processRecurringSchedules(userId, today);

    const rows = await prisma.transaction.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
    });

    return rows.map(rowToTransaction);
  }

  async getTransactionById(userId: string, id: string): Promise<Transaction | null> {
    const row = await prisma.transaction.findFirst({ where: { id, userId } });
    return row ? rowToTransaction(row) : null;
  }

  async createTransaction(
    userId: string,
    data: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Transaction> {
    const now = new Date().toISOString();
    const id = uuidv4();
    const recurringId = data.isRecurring ? (data.recurringId ?? uuidv4()) : undefined;

    // If this is a new recurring transaction, also create the schedule entry
    if (data.isRecurring && recurringId) {
      const existingSchedule = await prisma.recurringSchedule.findFirst({
        where: { userId, id: recurringId },
      });
      if (!existingSchedule) {
        await prisma.recurringSchedule.create({
          data: {
            id: recurringId,
            userId,
            type: data.type,
            amount: data.amount,
            category: data.category ?? '',
            description: data.description,
            frequency: (data.recurringFrequency ?? 'monthly') as any,
            startDate: data.date,
            nextDueDate: advanceDateByFrequency(data.date, data.recurringFrequency ?? 'monthly'),
            accountId: data.accountId,
            toAccountId: data.toAccountId ?? null,
            isActive: 1,
            createdAt: now,
          },
        });
      }
    }

    const row = await prisma.transaction.create({
      data: {
        id,
        userId,
        type: data.type,
        amount: data.amount,
        category: data.category ?? null,
        description: data.description,
        date: data.date,
        tags: serializeTags(data.tags),
        isRecurring: data.isRecurring ? 1 : 0,
        recurringFrequency: data.recurringFrequency ?? null,
        recurringId: recurringId ?? null,
        paymentMethod: data.paymentMethod ?? null,
        notes: data.notes ?? null,
        accountId: data.accountId,
        toAccountId: data.toAccountId ?? null,
        source: data.source ?? 'manual',
        importId: data.importId ?? null,
        rawDescription: data.rawDescription ?? null,
        bankTransactionHash: null,
        createdAt: now,
        updatedAt: now,
      },
    });

    return rowToTransaction(row);
  }

  async updateTransaction(
    userId: string,
    id: string,
    data: Partial<Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<Transaction | null> {
    const existing = await prisma.transaction.findFirst({ where: { id, userId } });
    if (!existing) return null;

    const now = new Date().toISOString();

    const isRecurring = data.isRecurring !== undefined ? data.isRecurring : (existing.isRecurring === 1);
    let recurringId = existing.recurringId ?? undefined;

    if (isRecurring) {
      if (!recurringId) {
        recurringId = uuidv4();
      }

      // Upsert or create schedule entry
      const existingSchedule = await prisma.recurringSchedule.findFirst({
        where: { userId, id: recurringId },
      });

      const freq = data.recurringFrequency !== undefined
        ? data.recurringFrequency
        : (existing.recurringFrequency ?? 'monthly');

      if (!existingSchedule) {
        await prisma.recurringSchedule.create({
          data: {
            id: recurringId,
            userId,
            type: data.type !== undefined ? data.type : existing.type,
            amount: data.amount !== undefined ? data.amount : existing.amount,
            category: data.category !== undefined ? data.category : (existing.category ?? null),
            description: data.description !== undefined ? data.description : existing.description,
            frequency: freq as any,
            startDate: data.date !== undefined ? data.date : existing.date,
            nextDueDate: advanceDateByFrequency(
              data.date !== undefined ? data.date : existing.date,
              freq
            ),
            accountId: data.accountId !== undefined ? data.accountId : existing.accountId,
            toAccountId: data.toAccountId !== undefined ? data.toAccountId : (existing.toAccountId ?? null),
            isActive: 1,
            createdAt: now,
          },
        });
      } else {
        await prisma.recurringSchedule.update({
          where: { id: recurringId },
          data: {
            type: data.type !== undefined ? data.type : existing.type,
            amount: data.amount !== undefined ? data.amount : existing.amount,
            category: data.category !== undefined ? data.category : (existing.category ?? null),
            description: data.description !== undefined ? data.description : existing.description,
            frequency: freq as any,
            accountId: data.accountId !== undefined ? data.accountId : existing.accountId,
            toAccountId: data.toAccountId !== undefined ? data.toAccountId : (existing.toAccountId ?? null),
            ...((data.date !== undefined || data.recurringFrequency !== undefined) && {
              startDate: data.date !== undefined ? data.date : existing.date,
              nextDueDate: advanceDateByFrequency(
                data.date !== undefined ? data.date : existing.date,
                freq
              ),
            }),
          },
        });
      }
    } else if (existing.recurringId) {
      // If it was recurring and now is not, deactivate the schedule
      await prisma.recurringSchedule.updateMany({
        where: { userId, id: existing.recurringId },
        data: { isActive: 0 },
      });
      recurringId = undefined; // clear it for this transaction
    }

    const updated = await prisma.transaction.update({
      where: { id },
      data: {
        ...(data.type        !== undefined && { type: data.type }),
        ...(data.amount      !== undefined && { amount: data.amount }),
        ...(data.category    !== undefined && { category: data.category }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.date        !== undefined && { date: data.date }),
        ...(data.tags        !== undefined && { tags: serializeTags(data.tags) }),
        isRecurring: isRecurring ? 1 : 0,
        recurringFrequency: isRecurring
          ? (data.recurringFrequency !== undefined ? data.recurringFrequency : (existing.recurringFrequency ?? 'monthly'))
          : null,
        recurringId: recurringId ?? null,
        ...(data.paymentMethod      !== undefined && { paymentMethod: data.paymentMethod }),
        ...(data.notes       !== undefined && { notes: data.notes }),
        ...(data.accountId   !== undefined && { accountId: data.accountId }),
        ...(data.toAccountId !== undefined && { toAccountId: data.toAccountId }),
        updatedAt: now,
      },
    });

    return rowToTransaction(updated);
  }

  async deleteTransaction(userId: string, id: string): Promise<boolean> {
    const existing = await prisma.transaction.findFirst({ where: { id, userId } });
    if (!existing) return false;
    await prisma.transaction.delete({ where: { id } });
    return true;
  }

  /** Stop recurrence: keep existing transactions but mark schedule inactive */
  async stopRecurringSeries(userId: string, recurringId: string): Promise<boolean> {
    const result = await prisma.recurringSchedule.updateMany({
      where: { userId, id: recurringId },
      data: { isActive: 0 },
    });
    if (result.count === 0) {
      // Also try stopping by matching recurringId on transactions (legacy compatibility)
      const txns = await prisma.transaction.findMany({
        where: { userId, recurringId, isRecurring: 1 },
        take: 1,
      });
      if (txns.length === 0) return false;
      // Mark all transactions in this series as non-recurring
      await prisma.transaction.updateMany({
        where: { userId, recurringId },
        data: { isRecurring: 0, updatedAt: new Date().toISOString() },
      });
    }
    return true;
  }

  /** Delete all transactions + the schedule for a recurring series */
  async deleteRecurringSeries(userId: string, recurringId: string): Promise<boolean> {
    const txnCount = await prisma.transaction.count({ where: { userId, recurringId } });
    const schedCount = await prisma.recurringSchedule.count({ where: { userId, id: recurringId } });
    if (txnCount === 0 && schedCount === 0) return false;

    await prisma.$transaction([
      prisma.transaction.deleteMany({ where: { userId, recurringId } }),
      prisma.recurringSchedule.deleteMany({ where: { userId, id: recurringId } }),
    ]);
    return true;
  }

  // ── Recurring Schedule Auto-Processing ───────────────────────────────────

  private async processRecurringSchedules(userId: string, today: string): Promise<void> {
    // Find all active schedules that are overdue
    const dueSchedules = await prisma.recurringSchedule.findMany({
      where: {
        userId,
        isActive: 1,
        nextDueDate: { lte: today },
      },
    });

    if (dueSchedules.length === 0) return;

    // Get existing transaction dates per recurringId to avoid duplicates
    const existingKeys = new Set<string>();
    const existingTxns = await prisma.transaction.findMany({
      where: { userId, recurringId: { in: dueSchedules.map((s: { id: string }) => s.id) } },
      select: { recurringId: true, date: true },
    });
    existingTxns.forEach((t: { recurringId: string | null; date: string }) => existingKeys.add(`${t.recurringId}__${t.date}`));

    const newTransactions: any[] = [];
    const scheduleUpdates: Array<{ id: string; nextDueDate: string }> = [];

    for (const schedule of dueSchedules) {
      let dueDate = schedule.nextDueDate;

      // Fill in all missed occurrences up to today
      while (dueDate <= today) {
        const key = `${schedule.id}__${dueDate}`;
        if (!existingKeys.has(key)) {
          existingKeys.add(key);
          const now = new Date().toISOString();
          newTransactions.push({
            id: uuidv4(),
            userId,
            type: schedule.type,
            amount: schedule.amount,
            category: schedule.category ?? null,
            description: schedule.description,
            date: dueDate,
            tags: '[]',
            isRecurring: 1,
            recurringFrequency: schedule.frequency,
            recurringId: schedule.id,
            paymentMethod: null,
            notes: null,
            accountId: schedule.accountId,
            toAccountId: schedule.toAccountId ?? null,
            source: 'recurring',
            importId: null,
            rawDescription: null,
            bankTransactionHash: null,
            createdAt: now,
            updatedAt: now,
          });
        }
        dueDate = advanceDateByFrequency(dueDate, schedule.frequency);
      }

      scheduleUpdates.push({ id: schedule.id, nextDueDate: dueDate });
    }

    if (newTransactions.length === 0 && scheduleUpdates.length === 0) return;

    // Commit atomically
    await prisma.$transaction([
      ...(newTransactions.length > 0
        ? [prisma.transaction.createMany({ data: newTransactions })]
        : []),
      ...scheduleUpdates.map(u =>
        prisma.recurringSchedule.update({
          where: { id: u.id },
          data: { nextDueDate: u.nextDueDate },
        })
      ),
    ]);

    if (newTransactions.length > 0) {
      console.log(`✅ Auto-posted ${newTransactions.length} recurring transactions for user ${userId}`);
    }
  }

  // ── Recurring Schedules CRUD ──────────────────────────────────────────────

  async getRecurringSchedules(userId: string): Promise<RecurringSchedule[]> {
    const rows = await prisma.recurringSchedule.findMany({
      where: { userId, isActive: 1 },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r: PrismaRecurringScheduleRow) => ({
      id: r.id,
      type: r.type as RecurringSchedule['type'],
      amount: r.amount,
      category: r.category ?? '',
      description: r.description,
      frequency: r.frequency as RecurringSchedule['frequency'],
      startDate: r.startDate,
      nextDueDate: r.nextDueDate,
      accountId: r.accountId,
      toAccountId: r.toAccountId ?? undefined,
      createdAt: r.createdAt,
      isActive: r.isActive === 1,
      emailReminder: r.emailReminder === 1,
      reminderDaysBefore: r.reminderDaysBefore,
    }));
  }

  async createRecurringSchedule(
    userId: string,
    data: Omit<RecurringSchedule, 'id' | 'createdAt'>
  ): Promise<RecurringSchedule> {
    const now = new Date().toISOString();
    const id = uuidv4();
    const row = await prisma.recurringSchedule.create({
      data: {
        id, userId,
        type: data.type,
        amount: data.amount,
        category: data.category ?? null,
        description: data.description,
        frequency: data.frequency,
        startDate: data.startDate,
        nextDueDate: data.nextDueDate,
        accountId: data.accountId,
        toAccountId: data.toAccountId ?? null,
        isActive: 1,
        emailReminder: data.emailReminder ? 1 : 0,
        reminderDaysBefore: data.reminderDaysBefore ?? 1,
        createdAt: now,
      },
    });
    return { ...data, id: row.id, createdAt: row.createdAt };
  }

  async updateRecurringSchedule(
    userId: string,
    id: string,
    data: Partial<RecurringSchedule>
  ): Promise<RecurringSchedule | null> {
    const existing = await prisma.recurringSchedule.findFirst({ where: { id, userId } });
    if (!existing) return null;
    const updated = await prisma.recurringSchedule.update({
      where: { id },
      data: {
        ...(data.amount      !== undefined && { amount: data.amount }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.frequency   !== undefined && { frequency: data.frequency }),
        ...(data.nextDueDate !== undefined && { nextDueDate: data.nextDueDate }),
        ...(data.emailReminder !== undefined && { emailReminder: data.emailReminder ? 1 : 0 }),
        ...(data.reminderDaysBefore !== undefined && { reminderDaysBefore: data.reminderDaysBefore }),
      },
    });
    return {
      id: updated.id,
      type: updated.type as RecurringSchedule['type'],
      amount: updated.amount,
      category: updated.category ?? '',
      description: updated.description,
      frequency: updated.frequency as RecurringSchedule['frequency'],
      startDate: updated.startDate,
      nextDueDate: updated.nextDueDate,
      accountId: updated.accountId,
      toAccountId: updated.toAccountId ?? undefined,
      createdAt: updated.createdAt,
      emailReminder: updated.emailReminder === 1,
      reminderDaysBefore: updated.reminderDaysBefore,
    };
  }

  async deleteRecurringSchedule(userId: string, id: string): Promise<boolean> {
    const existing = await prisma.recurringSchedule.findFirst({ where: { id, userId } });
    if (!existing) return false;
    await prisma.recurringSchedule.delete({ where: { id } });
    return true;
  }

  // ── Categories ────────────────────────────────────────────────────────────

  async getCategories(userId: string): Promise<Category[]> {
    const rows = await prisma.category.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
    });
    return rows.map((r: PrismaCategoryRow) => ({
      id: r.id,
      name: r.name,
      type: r.type as Category['type'],
      icon: r.icon,
      color: r.color,
      budget: r.budget ?? undefined,
      createdAt: r.createdAt,
    }));
  }

  async createCategory(
    userId: string,
    data: Omit<Category, 'id' | 'createdAt'>
  ): Promise<Category> {
    const now = new Date().toISOString();
    const row = await prisma.category.create({
      data: { id: uuidv4(), userId, ...data, createdAt: now, budget: data.budget ?? null },
    });
    return { ...row, type: row.type as Category['type'], budget: row.budget ?? undefined };
  }

  async updateCategory(
    userId: string,
    id: string,
    data: Partial<Category>
  ): Promise<Category | null> {
    const existing = await prisma.category.findFirst({ where: { id, userId } });
    if (!existing) return null;
    const updated = await prisma.category.update({
      where: { id },
      data: {
        ...(data.name   !== undefined && { name: data.name }),
        ...(data.type   !== undefined && { type: data.type }),
        ...(data.icon   !== undefined && { icon: data.icon }),
        ...(data.color  !== undefined && { color: data.color }),
        ...(data.budget !== undefined && { budget: data.budget ?? null }),
      },
    });
    return { ...updated, type: updated.type as Category['type'], budget: updated.budget ?? undefined };
  }

  async deleteCategory(userId: string, id: string, reassignCategoryId?: string): Promise<{ success: boolean; hasTransactions: boolean; count?: number }> {
    const existing = await prisma.category.findFirst({ where: { id, userId } });
    if (!existing) return { success: false, hasTransactions: false };

    // Check if there are any transactions using this category
    const transactionCount = await prisma.transaction.count({
      where: { userId, category: id }
    });

    if (transactionCount > 0) {
      if (!reassignCategoryId) {
        return { success: false, hasTransactions: true, count: transactionCount };
      }
      // Reassign all transactions
      await prisma.transaction.updateMany({
        where: { userId, category: id },
        data: { category: reassignCategoryId }
      });
    }

    // Reassign any recurring schedules using this category
    await prisma.recurringSchedule.updateMany({
      where: { userId, category: id },
      data: { category: reassignCategoryId || null }
    });

    // Delete any budgets for this category
    await prisma.budget.deleteMany({
      where: { userId, categoryId: id }
    });

    await prisma.category.delete({ where: { id } });
    return { success: true, hasTransactions: false };
  }

  // ── Accounts ──────────────────────────────────────────────────────────────

  async getAccounts(userId: string): Promise<Account[]> {
    let rows = await prisma.account.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      include: { stockHoldings: true },
    });

    let didSeed = false;
    for (const acc of rows) {
      if (acc.isInvestment === 1 && acc.stockHoldings?.length) {
        for (const holding of acc.stockHoldings) {
          const count = await prisma.stockOrder.count({
            where: { accountId: acc.id, ticker: holding.ticker }
          });
          if (count === 0) {
            didSeed = true;
            const now = new Date().toISOString();
            const orderId = uuidv4();
            const txnId = uuidv4();

            await prisma.transaction.create({
              data: {
                id: txnId,
                userId,
                accountId: acc.id,
                type: 'expense',
                amount: holding.shares * holding.price,
                category: 'investment',
                description: `Initial Position: Buy ${holding.shares} shares of ${holding.ticker}`,
                date: acc.createdAt.split('T')[0],
                source: 'manual',
                stockOrderId: orderId,
                createdAt: now,
                updatedAt: now
              }
            });

            await prisma.stockOrder.create({
              data: {
                id: orderId,
                accountId: acc.id,
                ticker: holding.ticker,
                type: 'BUY',
                shares: holding.shares,
                pricePerShare: holding.price,
                date: acc.createdAt.split('T')[0],
                createdAt: now
              }
            });

            await prisma.stockHolding.update({
              where: { id: holding.id },
              data: { costBasis: holding.price }
            });
          }
        }
      }
    }

    if (didSeed) {
      rows = await prisma.account.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        include: { stockHoldings: true },
      });
    }

    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      type: r.type as Account['type'],
      currency: r.currency || 'USD',
      initialBalance: r.initialBalance,
      isInvestment: r.isInvestment === 1,
      stockHoldings: (r.stockHoldings ?? []).map((h: PrismaStockHoldingRow) => ({
        id: h.id,
        accountId: h.accountId,
        ticker: h.ticker,
        shares: h.shares,
        price: h.price,
        costBasis: h.costBasis ?? 0,
        updatedAt: h.updatedAt,
      })),
      createdAt: r.createdAt,
    }));
  }

  /** Fetch live market price for a ticker from Yahoo Finance. Returns null if not found. */
  public async fetchStockPrice(ticker: string): Promise<number | null> {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}`;
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) return null;
      const json = await res.json() as any;
      const price = json.chart?.result?.[0]?.meta?.regularMarketPrice;
      return typeof price === 'number' ? price : null;
    } catch {
      return null;
    }
  }

  /** Refresh market prices for all holdings in every investment account owned by userId. */
  async updateStockPrices(userId: string): Promise<Account[]> {
    const accounts = await this.getAccounts(userId);
    const now = new Date().toISOString();
    for (const acc of accounts) {
      if (!acc.isInvestment || !acc.stockHoldings?.length) continue;
      for (const holding of acc.stockHoldings) {
        const price = await this.fetchStockPrice(holding.ticker);
        if (price !== null) {
          await prisma.stockHolding.update({
            where: { id: holding.id },
            data: { price, updatedAt: now },
          });
        }
      }
    }
    return this.getAccounts(userId);
  }

  /** Search stocks/ETFs using Yahoo Finance search suggestions endpoint. */
  async searchStocks(query: string): Promise<any[]> {
    try {
      const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}`;
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) return [];
      const json = await res.json() as any;
      const quotes = json.quotes || [];
      return quotes.map((q: any) => ({
        symbol: q.symbol,
        name: q.shortname || q.longname || q.symbol,
        exchange: q.exchange,
        typeDisp: q.typeDisp
      }));
    } catch {
      return [];
    }
  }

  /** Get all stock orders for an account. */
  async getStockOrders(userId: string, accountId: string): Promise<StockOrder[]> {
    const rows = await prisma.stockOrder.findMany({
      where: { accountId, account: { userId } },
      orderBy: [
        { date: 'desc' },
        { createdAt: 'desc' }
      ]
    });
    return rows.map((r: any) => ({
      id: r.id,
      accountId: r.accountId,
      ticker: r.ticker,
      type: r.type as StockOrder['type'],
      shares: r.shares,
      pricePerShare: r.pricePerShare,
      date: r.date,
      transactionId: r.transactionId,
      createdAt: r.createdAt
    }));
  }

  /** Recalculate holdings based on orders. */
  private async recalculateStockHoldings(accountId: string, ticker: string): Promise<void> {
    ticker = ticker.toUpperCase().trim();
    const orders = await prisma.stockOrder.findMany({
      where: { accountId, ticker },
      orderBy: [
        { date: 'asc' },
        { createdAt: 'asc' }
      ]
    });

    if (orders.length === 0) {
      await prisma.stockHolding.deleteMany({
        where: { accountId, ticker }
      });
      return;
    }

    let totalShares = 0;
    let totalCost = 0;
    let averagePrice = 0;

    for (const order of orders) {
      if (order.type === 'BUY') {
        totalShares += order.shares;
        totalCost += order.shares * order.pricePerShare;
        averagePrice = totalShares > 0 ? totalCost / totalShares : 0;
      } else if (order.type === 'SELL') {
        totalShares -= order.shares;
        if (totalShares < 0) totalShares = 0;
        totalCost = totalShares * averagePrice;
      }
    }

    if (totalShares <= 0) {
      await prisma.stockHolding.deleteMany({
        where: { accountId, ticker }
      });
      return;
    }

    let livePrice = await this.fetchStockPrice(ticker);
    if (livePrice === null) {
      const existingHolding = await prisma.stockHolding.findFirst({
        where: { accountId, ticker }
      });
      livePrice = existingHolding ? existingHolding.price : averagePrice;
    }

    const existingHolding = await prisma.stockHolding.findFirst({
      where: { accountId, ticker }
    });

    const now = new Date().toISOString();

    if (existingHolding) {
      await prisma.stockHolding.update({
        where: { id: existingHolding.id },
        data: {
          shares: totalShares,
          costBasis: averagePrice,
          price: livePrice,
          updatedAt: now
        }
      });
    } else {
      await prisma.stockHolding.create({
        data: {
          id: uuidv4(),
          accountId,
          ticker,
          shares: totalShares,
          costBasis: averagePrice,
          price: livePrice,
          updatedAt: now
        }
      });
    }
  }

  /** Add a stock order. */
  async addStockOrder(
    userId: string,
    accountId: string,
    data: { ticker: string; type: 'BUY' | 'SELL'; shares: number; pricePerShare: number; date: string }
  ): Promise<StockOrder | null> {
    const acc = await prisma.account.findFirst({ where: { id: accountId, userId } });
    if (!acc) return null;

    const orderId = uuidv4();
    const txnId = uuidv4();
    const now = new Date().toISOString();
    const totalAmount = data.shares * data.pricePerShare;
    const ticker = data.ticker.toUpperCase().trim();

    // Create linked transaction in ledger
    await prisma.transaction.create({
      data: {
        id: txnId,
        userId,
        accountId,
        type: data.type === 'BUY' ? 'expense' : 'income',
        amount: totalAmount,
        category: 'investment',
        description: `${data.type === 'BUY' ? 'Bought' : 'Sold'} ${data.shares} shares of ${ticker}`,
        date: data.date,
        source: 'manual',
        stockOrderId: orderId,
        createdAt: now,
        updatedAt: now
      }
    });

    const order = await prisma.stockOrder.create({
      data: {
        id: orderId,
        accountId,
        ticker,
        type: data.type,
        shares: data.shares,
        pricePerShare: data.pricePerShare,
        date: data.date,
        createdAt: now
      }
    });

    await this.recalculateStockHoldings(accountId, ticker);

    return {
      id: order.id,
      accountId: order.accountId,
      ticker: order.ticker,
      type: order.type as StockOrder['type'],
      shares: order.shares,
      pricePerShare: order.pricePerShare,
      date: order.date,
      createdAt: order.createdAt
    };
  }

  /** Update a stock order. */
  async updateStockOrder(
    userId: string,
    accountId: string,
    orderId: string,
    data: { shares: number; pricePerShare: number; date: string }
  ): Promise<StockOrder | null> {
    const order = await prisma.stockOrder.findFirst({
      where: { id: orderId, accountId, account: { userId } }
    });
    if (!order) return null;

    const totalAmount = data.shares * data.pricePerShare;

    const updatedOrder = await prisma.stockOrder.update({
      where: { id: orderId },
      data: {
        shares: data.shares,
        pricePerShare: data.pricePerShare,
        date: data.date
      }
    });

    const linkedTxn = await prisma.transaction.findFirst({
      where: { stockOrderId: orderId }
    });

    if (linkedTxn) {
      await prisma.transaction.update({
        where: { id: linkedTxn.id },
        data: {
          amount: totalAmount,
          date: data.date,
          description: `${order.type === 'BUY' ? 'Bought' : 'Sold'} ${data.shares} shares of ${order.ticker}`,
          updatedAt: new Date().toISOString()
        }
      });
    }

    await this.recalculateStockHoldings(accountId, order.ticker);

    return {
      id: updatedOrder.id,
      accountId: updatedOrder.accountId,
      ticker: updatedOrder.ticker,
      type: updatedOrder.type as StockOrder['type'],
      shares: updatedOrder.shares,
      pricePerShare: updatedOrder.pricePerShare,
      date: updatedOrder.date,
      createdAt: updatedOrder.createdAt
    };
  }

  /** Delete a stock order. */
  async deleteStockOrder(userId: string, accountId: string, orderId: string): Promise<boolean> {
    const order = await prisma.stockOrder.findFirst({
      where: { id: orderId, accountId, account: { userId } }
    });
    if (!order) return false;

    // Delete linked transaction explicitly
    await prisma.transaction.deleteMany({
      where: { stockOrderId: orderId }
    });

    await prisma.stockOrder.delete({
      where: { id: orderId }
    });

    await this.recalculateStockHoldings(accountId, order.ticker);

    return true;
  }

  /** Add a stock holding to an investment account. (Legacy wrapper) */
  async addStockHolding(
    userId: string,
    accountId: string,
    ticker: string,
    shares: number
  ): Promise<StockHolding | null> {
    const livePrice = (await this.fetchStockPrice(ticker)) ?? 0;
    const today = new Date().toLocaleDateString('en-CA');
    const order = await this.addStockOrder(userId, accountId, {
      ticker,
      type: 'BUY',
      shares,
      pricePerShare: livePrice,
      date: today
    });
    if (!order) return null;
    const holding = await prisma.stockHolding.findFirst({
      where: { accountId, ticker: ticker.toUpperCase().trim() }
    });
    return holding ? {
      id: holding.id,
      accountId: holding.accountId,
      ticker: holding.ticker,
      shares: holding.shares,
      price: holding.price,
      costBasis: holding.costBasis ?? 0,
      updatedAt: holding.updatedAt
    } : null;
  }

  /** Update shares for an existing holding. (Legacy wrapper) */
  async updateStockHolding(
    userId: string,
    holdingId: string,
    shares: number
  ): Promise<StockHolding | null> {
    const holding = await prisma.stockHolding.findFirst({
      where: { id: holdingId, account: { userId } }
    });
    if (!holding) return null;

    const firstOrder = await prisma.stockOrder.findFirst({
      where: { accountId: holding.accountId, ticker: holding.ticker, type: 'BUY' },
      orderBy: { date: 'asc' }
    });

    if (firstOrder) {
      await this.updateStockOrder(userId, holding.accountId, firstOrder.id, {
        shares,
        pricePerShare: firstOrder.pricePerShare,
        date: firstOrder.date
      });
    } else {
      await this.addStockOrder(userId, holding.accountId, {
        ticker: holding.ticker,
        type: 'BUY',
        shares,
        pricePerShare: holding.price,
        date: new Date().toLocaleDateString('en-CA')
      });
    }

    const freshHolding = await prisma.stockHolding.findFirst({
      where: { id: holdingId }
    });
    return freshHolding ? {
      id: freshHolding.id,
      accountId: freshHolding.accountId,
      ticker: freshHolding.ticker,
      shares: freshHolding.shares,
      price: freshHolding.price,
      costBasis: freshHolding.costBasis ?? 0,
      updatedAt: freshHolding.updatedAt
    } : null;
  }

  /** Remove a holding from an investment account. (Legacy wrapper) */
  async deleteStockHolding(userId: string, holdingId: string): Promise<boolean> {
    const holding = await prisma.stockHolding.findFirst({
      where: { id: holdingId, account: { userId } }
    });
    if (!holding) return false;

    const orders = await prisma.stockOrder.findMany({
      where: { accountId: holding.accountId, ticker: holding.ticker }
    });

    for (const o of orders) {
      await this.deleteStockOrder(userId, holding.accountId, o.id);
    }

    return true;
  }

  async createAccount(
    userId: string,
    data: Omit<Account, 'id' | 'createdAt'>
  ): Promise<Account> {
    const now = new Date().toISOString();
    const row = await prisma.account.create({
      data: {
        id: uuidv4(), userId,
        name: data.name,
        type: data.type,
        currency: data.currency ?? 'USD',
        initialBalance: data.initialBalance ?? 0,
        isInvestment: data.isInvestment ? 1 : 0,
        createdAt: now,
      },
    });
    return { id: row.id, name: row.name, type: row.type as Account['type'], currency: row.currency, initialBalance: row.initialBalance, isInvestment: row.isInvestment === 1, stockHoldings: [], createdAt: row.createdAt };
  }

  async updateAccount(
    userId: string,
    id: string,
    data: Partial<Account>
  ): Promise<Account | null> {
    const existing = await prisma.account.findFirst({ where: { id, userId } });
    if (!existing) return null;
    const updated = await prisma.account.update({
      where: { id },
      data: {
        ...(data.name           !== undefined && { name: data.name }),
        ...(data.type           !== undefined && { type: data.type }),
        ...(data.currency       !== undefined && { currency: data.currency }),
        ...(data.isInvestment   !== undefined && { isInvestment: data.isInvestment ? 1 : 0 }),
      },
    });
    const holdings = await prisma.stockHolding.findMany({ where: { accountId: id } });
    return {
      id: updated.id, name: updated.name, type: updated.type as Account['type'],
      currency: updated.currency, initialBalance: updated.initialBalance,
      isInvestment: updated.isInvestment === 1,
      stockHoldings: holdings.map((h: PrismaStockHoldingRow) => ({ id: h.id, accountId: h.accountId, ticker: h.ticker, shares: h.shares, price: h.price, updatedAt: h.updatedAt })),
      createdAt: updated.createdAt,
    };
  }

  async deleteAccount(userId: string, id: string): Promise<boolean> {
    const existing = await prisma.account.findFirst({ where: { id, userId } });
    if (!existing) return false;
    await prisma.account.delete({ where: { id } });
    return true;
  }

  // ── Budgets ───────────────────────────────────────────────────────────────

  async getBudgets(userId: string, year?: number, month?: number): Promise<Budget[]> {
    const filterYear = year ?? new Date().getFullYear();
    const filterMonth = month ?? new Date().getMonth() + 1;
    const today = new Date().toLocaleDateString('en-CA');

    // Load raw budgets filtered by year (and optionally month)
    const rawBudgets = await prisma.budget.findMany({
      where: {
        userId,
        year: filterYear,
        // If month is requested, include both specific-month budgets and yearly ones (month = null)
        ...(month !== undefined ? { OR: [{ month: filterMonth }, { month: null }] } : {}),
      },
    });

    // Compute spent for each budget
    return Promise.all(rawBudgets.map(async (b: PrismaBudgetRow) => {
      const targetMonth = b.month ?? filterMonth;
      const monthStr = String(targetMonth).padStart(2, '0');
      const yearStart = `${filterYear}-${monthStr}-01`;
      // Last day of the target month
      const lastDay = new Date(filterYear, targetMonth, 0).getDate();
      const yearEnd = `${filterYear}-${monthStr}-${String(lastDay).padStart(2, '0')}`;

      const result = await prisma.transaction.aggregate({
        where: {
          userId,
          category: b.categoryId,
          type: 'expense',
          date: { gte: yearStart, lte: yearEnd.slice(0, 7) === today.slice(0, 7) ? today : yearEnd },
        },
        _sum: { amount: true },
      });

      const spent = result._sum.amount ?? 0;
      const remaining = b.amount - spent;
      const percentage = b.amount > 0 ? Math.round((spent / b.amount) * 100) : 0;

      return {
        id: b.id,
        categoryId: b.categoryId,
        categoryName: b.categoryName,
        amount: b.amount,
        period: b.period as Budget['period'],
        month: b.month ?? undefined,
        year: b.year,
        spent,
        remaining,
        percentage,
        createdAt: b.createdAt,
      };
    }));
  }

  async createBudget(
    userId: string,
    data: Omit<Budget, 'id' | 'spent' | 'remaining' | 'percentage' | 'createdAt'>
  ): Promise<Budget> {
    const now = new Date().toISOString();
    const row = await prisma.budget.create({
      data: {
        id: uuidv4(), userId,
        categoryId: data.categoryId,
        categoryName: data.categoryName,
        amount: data.amount,
        period: data.period,
        month: data.month ?? null,
        year: data.year,
        createdAt: now,
      },
    });
    return {
      ...row,
      period: row.period as Budget['period'],
      month: row.month ?? undefined,
      spent: 0, remaining: row.amount, percentage: 0,
    };
  }

  async updateBudget(
    userId: string,
    id: string,
    data: Partial<Budget>
  ): Promise<Budget | null> {
    const existing = await prisma.budget.findFirst({ where: { id, userId } });
    if (!existing) return null;
    const updated = await prisma.budget.update({
      where: { id },
      data: {
        ...(data.amount       !== undefined && { amount: data.amount }),
        ...(data.categoryName !== undefined && { categoryName: data.categoryName }),
        ...(data.period       !== undefined && { period: data.period }),
        ...(data.month        !== undefined && { month: data.month ?? null }),
        ...(data.year         !== undefined && { year: data.year }),
      },
    });
    return {
      ...updated,
      period: updated.period as Budget['period'],
      month: updated.month ?? undefined,
      spent: 0, remaining: updated.amount, percentage: 0,
    };
  }

  async deleteBudget(userId: string, id: string): Promise<boolean> {
    const existing = await prisma.budget.findFirst({ where: { id, userId } });
    if (!existing) return false;
    await prisma.budget.delete({ where: { id } });
    return true;
  }

  // ── Settings ──────────────────────────────────────────────────────────────

  async getSettings(userId: string): Promise<AppSettings> {
    let row = await prisma.settings.findUnique({ where: { userId } });
    const now = new Date().toISOString();
    if (!row) {
      const generatedApiKey = 'usr_key_' + uuidv4().replace(/-/g, '');
      row = await prisma.settings.create({
        data: { userId, apiKey: generatedApiKey, updatedAt: now },
      });
    } else if (!row.apiKey) {
      const generatedApiKey = 'usr_key_' + uuidv4().replace(/-/g, '');
      row = await prisma.settings.update({
        where: { userId },
        data: { apiKey: generatedApiKey, updatedAt: now },
      });
    }

    return {
      currency: row.currency,
      currencySymbol: row.currencySymbol,
      dateFormat: row.dateFormat,
      theme: row.theme,
      lastSync: now,
      monthlyReportEnabled: row.monthlyReportEnabled === 1,
      billRemindersEnabled: row.billRemindersEnabled !== 0,
      billReminderDaysBefore: row.billReminderDaysBefore ?? 2,
      apiKey: row.apiKey ?? undefined,
    };
  }

  async regenerateApiKey(userId: string): Promise<string> {
    const newApiKey = 'usr_key_' + uuidv4().replace(/-/g, '');
    await prisma.settings.upsert({
      where: { userId },
      update: { apiKey: newApiKey, updatedAt: new Date().toISOString() },
      create: { userId, apiKey: newApiKey, updatedAt: new Date().toISOString() },
    });
    return newApiKey;
  }

  async updateSettings(userId: string, data: Partial<AppSettings>): Promise<AppSettings> {
    const now = new Date().toISOString();
    const row = await prisma.settings.upsert({
      where: { userId },
      update: {
        ...(data.currency       !== undefined && { currency: data.currency }),
        ...(data.currencySymbol !== undefined && { currencySymbol: data.currencySymbol }),
        ...(data.dateFormat     !== undefined && { dateFormat: data.dateFormat }),
        ...(data.theme          !== undefined && { theme: data.theme }),
        ...(data.monthlyReportEnabled !== undefined && { monthlyReportEnabled: data.monthlyReportEnabled ? 1 : 0 }),
        ...(data.billRemindersEnabled !== undefined && { billRemindersEnabled: data.billRemindersEnabled ? 1 : 0 }),
        ...(data.billReminderDaysBefore !== undefined && { billReminderDaysBefore: data.billReminderDaysBefore }),
        updatedAt: now,
      },
      create: { 
        userId, 
        updatedAt: now,
        monthlyReportEnabled: data.monthlyReportEnabled ? 1 : 0,
        billRemindersEnabled: data.billRemindersEnabled !== false ? 1 : 0,
        billReminderDaysBefore: data.billReminderDaysBefore ?? 2,
      },
    });
    return {
      currency: row.currency,
      currencySymbol: row.currencySymbol,
      dateFormat: row.dateFormat,
      theme: row.theme,
      lastSync: now,
      monthlyReportEnabled: row.monthlyReportEnabled === 1,
      billRemindersEnabled: row.billRemindersEnabled !== 0,
      billReminderDaysBefore: row.billReminderDaysBefore ?? 2,
      apiKey: row.apiKey ?? undefined,
    };
  }

  async scanForAnomalies(userId: string): Promise<any[]> {
    const today = new Date();
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(today.getDate() - 90);
    const dateLimit = ninetyDaysAgo.toISOString().split('T')[0];

    const txns = await prisma.transaction.findMany({
      where: {
        userId,
        date: { gte: dateLimit },
        type: 'expense',
      },
      orderBy: { date: 'desc' },
    });

    const anomalies: any[] = [];

    // 1. Detect Duplicates: same date, description, amount, accountId
    const seen = new Map<string, any[]>();
    txns.forEach((t: any) => {
      const key = `${t.date}__${t.amount}__${t.description.trim().toLowerCase()}__${t.accountId}`;
      if (!seen.has(key)) {
        seen.set(key, []);
      }
      seen.get(key)!.push(t);
    });

    seen.forEach((group: any[], key: string) => {
      if (group.length > 1) {
        anomalies.push({
          type: 'duplicate',
          severity: 'warning',
          title: `Potential Duplicate Charge`,
          message: `Identical charge of $${group[0].amount.toFixed(2)} for "${group[0].description}" logged ${group.length} times on ${group[0].date}.`,
          transactions: group.map((g: any) => ({ id: g.id, date: g.date, description: g.description, amount: g.amount })),
        });
      }
    });

    // 2. Detect Spend Spikes: transaction is > 200% of category average in past 90 days
    const byCategory: Record<string, number[]> = {};
    txns.forEach((t: any) => {
      if (t.category) {
        if (!byCategory[t.category]) {
          byCategory[t.category] = [];
        }
        byCategory[t.category].push(t.amount);
      }
    });

    const categoryAverages: Record<string, number> = {};
    Object.entries(byCategory).forEach(([cat, amounts]) => {
      const sum = amounts.reduce((s, a) => s + a, 0);
      categoryAverages[cat] = sum / amounts.length;
    });

    // We check recent transactions (last 30 days) for spikes
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    const dateLimit30 = thirtyDaysAgo.toISOString().split('T')[0];
    const recentTxns = txns.filter((t: any) => t.date >= dateLimit30);

    const categories = await prisma.category.findMany({ where: { userId } });

    recentTxns.forEach((t: any) => {
      if (t.category && categoryAverages[t.category]) {
        const avg = categoryAverages[t.category];
        if (t.amount > avg * 2.0 && t.amount >= 50) {
          const catName = categories.find((c: any) => c.id === t.category)?.name ?? t.category;
          anomalies.push({
            type: 'spike',
            severity: 'info',
            title: `Unusual Spending Spike`,
            message: `Spent $${t.amount.toFixed(2)} on "${t.description}" (${catName}) which is 2x higher than your average charge of $${avg.toFixed(2)} in this category.`,
            transactions: [{ id: t.id, date: t.date, description: t.description, amount: t.amount }],
          });
        }
      }
    });

    return anomalies;
  }

  // ── Reports ───────────────────────────────────────────────────────────────

  private async _getFilteredTransactions(
    userId: string,
    dateFrom: string,
    dateTo: string,
    accountId?: string
  ): Promise<Transaction[]> {
    const today = new Date().toLocaleDateString('en-CA');
    const rows = await prisma.transaction.findMany({
      where: {
        userId,
        date: { gte: dateFrom, lte: dateTo <= today ? dateTo : today },
        ...(accountId && accountId !== 'all'
          ? { OR: [{ accountId }, { toAccountId: accountId }] }
          : {}),
      },
    });
    const txns = rows.map(rowToTransaction);
    try {
      const settings = await this.getSettings(userId);
      const primaryCurrency = settings.currency || 'USD';
      const accounts = await this.getAccounts(userId);
      const rates = await getExchangeRates();

      return txns.map((t: Transaction) => {
        const acc = accounts.find(a => a.id === t.accountId);
        const accCurrency = acc?.currency || 'USD';
        if (accCurrency.toUpperCase() !== primaryCurrency.toUpperCase()) {
          const fromRate = rates[accCurrency.toUpperCase()] || 1.0;
          const toRate = rates[primaryCurrency.toUpperCase()] || 1.0;
          const convertedAmount = (t.amount / fromRate) * toRate;
          return { ...t, amount: parseFloat(convertedAmount.toFixed(2)) };
        }
        return t;
      });
    } catch (err) {
      console.error('Error normalizing currency in getFilteredTransactions:', err);
      return txns;
    }
  }

  private _buildReport(filtered: Transaction[]) {
    const income   = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expenses = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const net      = income - expenses;
    const savingsRate = income > 0 ? (net / income) * 100 : (expenses > 0 ? -100 : 0);
    const fixedExpenses   = filtered.filter(t => t.type === 'expense' && t.isRecurring).reduce((s, t) => s + t.amount, 0);
    const variableExpenses = expenses - fixedExpenses;
    const fixedPct    = expenses > 0 ? Math.round((fixedExpenses / expenses) * 100) : 0;
    const variablePct = expenses > 0 ? Math.round((variableExpenses / expenses) * 100) : 0;

    const byCategory: Record<string, number> = {};
    filtered.filter(t => t.type === 'expense').forEach(t => {
      byCategory[t.category] = (byCategory[t.category] || 0) + t.amount;
    });

    return {
      totalIncome: income, totalExpenses: expenses, netBalance: net,
      transactionCount: filtered.length, savingsRate: Math.round(savingsRate * 10) / 10,
      fixedExpenses, variableExpenses, fixedPct, variablePct, categoryBreakdown: byCategory,
    };
  }

  async getMonthlyReport(userId: string, year: number, month: number, accountId?: string) {
    const monthStr   = String(month).padStart(2, '0');
    const dateFrom   = `${year}-${monthStr}-01`;
    const lastDay    = new Date(year, month, 0).getDate();
    const dateTo     = `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`;
    const filtered   = await this._getFilteredTransactions(userId, dateFrom, dateTo, accountId);
    return this._buildReport(filtered);
  }

  async getYearlyReport(userId: string, year: number, accountId?: string) {
    const filtered = await this._getFilteredTransactions(userId, `${year}-01-01`, `${year}-12-31`, accountId);

    const monthlyData = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const monthTxns = filtered.filter(t => new Date(t.date + 'T00:00:00').getMonth() + 1 === m);
      const income   = monthTxns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
      const expenses = monthTxns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
      return { month: m, income, expenses, net: income - expenses };
    });

    return { ...this._buildReport(filtered), monthlyBreakdown: monthlyData };
  }

  async getCategoryBreakdown(userId: string, dateFrom: string, dateTo: string) {
    const filtered = await this._getFilteredTransactions(userId, dateFrom, dateTo);
    const breakdown: Record<string, { income: number; expense: number; count: number }> = {};
    filtered.filter(t => t.type !== 'transfer').forEach(t => {
      if (!breakdown[t.category]) breakdown[t.category] = { income: 0, expense: 0, count: 0 };
      if (t.type === 'income' || t.type === 'expense') breakdown[t.category][t.type] += t.amount;
      breakdown[t.category].count++;
    });
    return Object.entries(breakdown).map(([category, data]) => ({ category, ...data }));
  }

  async getExecutiveReport(
    userId: string,
    startDate: string,
    endDate: string,
    accountId?: string,
    useAi = false
  ) {
    const filtered = await this._getFilteredTransactions(userId, startDate, endDate, accountId);
    const categories = await this.getCategories(userId);
    const report = this._buildReport(filtered);
    const { totalIncome: income, totalExpenses: expenses, netBalance: net, savingsRate, fixedExpenses, variableExpenses, fixedPct, variablePct, categoryBreakdown: byCategory } = report;

    const apiKey = process.env['GEMINI_API_KEY'];
    const topCategoriesText = Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([id, amt]) => `- ${categories.find(c => c.id === id)?.name ?? id}: $${amt.toFixed(2)}`)
      .join('\n');

    if (useAi && apiKey) {
      try {
        const prompt = `You are a professional financial auditor. Write a formal executive financial summary for the period (${startDate} to ${endDate}):\n\nMETRICS:\n- Income: $${income.toFixed(2)}\n- Expenses: $${expenses.toFixed(2)} (Fixed: $${fixedExpenses.toFixed(2)} [${fixedPct}%], Variable: $${variableExpenses.toFixed(2)} [${variablePct}%])\n- Net: $${net.toFixed(2)}\n- Savings Rate: ${savingsRate.toFixed(1)}%\n\nTOP CATEGORIES:\n${topCategoriesText || 'None'}\n\nReturn JSON: { "healthOverview": "...", "categoryAudit": "...", "runwayOutlook": "...", "recommendations": ["...","...","..."] }`;

        const response = await fetchGeminiWithRetry(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { responseMimeType: 'application/json' },
            }),
          }
        );
        if (response.ok) {
          const json = await response.json() as any;
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            const data = JSON.parse(text);
            if (data.healthOverview && data.categoryAudit && Array.isArray(data.recommendations)) {
              return { ...data, isAiGenerated: true };
            }
          }
        }
      } catch (err) {
        console.error('AI executive report failed:', err);
      }
    }

    // Heuristic fallback
    const recommendations = [
      `Review your top spending categories (${Object.keys(byCategory).slice(0, 2).map(id => categories.find(c => c.id === id)?.name ?? id).join(', ') || 'expenses'}) for savings opportunities.`,
      savingsRate >= 20 ? `Maintain your ${savingsRate.toFixed(0)}% savings rate by keeping investments consistent.`
        : savingsRate >= 0 ? `Aim to increase your savings rate from ${savingsRate.toFixed(0)}% toward the recommended 20% minimum.`
        : `Prioritize balancing your budget — your current negative savings rate of ${savingsRate.toFixed(0)}% is unsustainable.`,
      fixedPct > 50
        ? `Fixed expenses are ${fixedPct}% of total spend. Renegotiate recurring contracts or subscriptions.`
        : `Discretionary spending is high (${variablePct}%). Consider a weekly cash budget cap.`,
    ];

    return {
      healthOverview: net >= 0
        ? `Net cashflow for the period shows a surplus of $${net.toFixed(2)} with a ${savingsRate.toFixed(1)}% savings rate.`
        : `A deficit of $${Math.abs(net).toFixed(2)} was recorded. Spending exceeded income by ${Math.abs(savingsRate).toFixed(1)}%.`,
      categoryAudit: `Expenses totalled $${expenses.toFixed(2)}: $${fixedExpenses.toFixed(2)} fixed (${fixedPct}%) and $${variableExpenses.toFixed(2)} variable (${variablePct}%). Top categories: ${topCategoriesText || 'None'}.`,
      runwayOutlook: net > 0 && expenses > 0
        ? `With a surplus of $${net.toFixed(2)} and monthly expenses of ~$${(expenses).toFixed(2)}, this period's savings covers ${(net / expenses).toFixed(1)} months of typical spending.`
        : `No savings runway generated this period. Continuing at this rate will deplete reserves.`,
      recommendations,
      isAiGenerated: false,
    };
  }

  async getAiAdviceForPeriod(
    userId: string,
    startDate: string,
    endDate: string,
    prevStartDate: string,
    prevEndDate: string,
    useAi = false
  ) {
    const getPeriodStats = async (from: string, to: string) => {
      const txns = await this._getFilteredTransactions(userId, from, to);
      const income   = txns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
      const expenses = txns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
      const net = income - expenses;
      const savingsRate = income > 0 ? (net / income) * 100 : (expenses > 0 ? -100 : 0);
      const byCategory: Record<string, number> = {};
      txns.filter(t => t.type === 'expense').forEach(t => {
        byCategory[t.category] = (byCategory[t.category] || 0) + t.amount;
      });
      return { income, expenses, net, savingsRate, byCategory, txns };
    };

    const curr = await getPeriodStats(startDate, endDate);
    const prev = await getPeriodStats(prevStartDate, prevEndDate);
    const categories = await this.getCategories(userId);

    const apiKey = process.env['GEMINI_API_KEY'];
    if (useAi && apiKey) {
      try {
        const topCurr = Object.entries(curr.byCategory)
          .sort((a, b) => b[1] - a[1]).slice(0, 5)
          .map(([id, amt]) => `${categories.find(c => c.id === id)?.name ?? id}: $${amt.toFixed(2)}`).join(', ');
        const topPrev = Object.entries(prev.byCategory)
          .sort((a, b) => b[1] - a[1]).slice(0, 3)
          .map(([id, amt]) => `${categories.find(c => c.id === id)?.name ?? id}: $${amt.toFixed(2)}`).join(', ');

        const prompt = `Financial advisor for a personal finance app. Analyze spending changes and give actionable advice.

CURRENT PERIOD (${startDate} to ${endDate}):
- Income: $${curr.income.toFixed(2)}, Expenses: $${curr.expenses.toFixed(2)}, Net: $${curr.net.toFixed(2)}, Savings: ${curr.savingsRate.toFixed(1)}%
- Top expenses: ${topCurr || 'None'}

PREVIOUS PERIOD (${prevStartDate} to ${prevEndDate}):
- Income: $${prev.income.toFixed(2)}, Expenses: $${prev.expenses.toFixed(2)}, Net: $${prev.net.toFixed(2)}, Savings: ${prev.savingsRate.toFixed(1)}%
- Top expenses: ${topPrev || 'None'}

Return JSON: { "summary": "2-3 sentence comparison of the two periods", "advice": [ { "icon": "emoji", "title": "short title", "text": "1-2 sentence action", "type": "good|warn|info|bad" }, ... ] } — exactly 4 advice items.`;

        const response = await fetchGeminiWithRetry(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { responseMimeType: 'application/json' },
            }),
          }
        );
        if (response.ok) {
          const json = await response.json() as any;
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            const data = JSON.parse(text);
            if (data.summary && Array.isArray(data.advice)) {
              return { ...data, isAiGenerated: true };
            }
          }
        }
      } catch (err) {
        console.error('AI advice failed:', err);
      }
    }

    // Heuristic fallback
    const expChange = prev.expenses > 0 ? ((curr.expenses - prev.expenses) / prev.expenses) * 100 : 0;
    const advice = [
      {
        icon: curr.net >= 0 ? '✅' : '🚨',
        title: curr.net >= 0 ? 'Positive Cashflow' : 'Cashflow Deficit',
        text: curr.net >= 0
          ? `You saved $${curr.net.toFixed(2)} this period (${curr.savingsRate.toFixed(0)}% rate). Keep it up!`
          : `You spent $${Math.abs(curr.net).toFixed(2)} more than you earned. Review fixed commitments.`,
        type: curr.net >= 0 ? 'good' as const : 'bad' as const,
      },
      {
        icon: expChange <= 0 ? '📉' : '📈',
        title: 'Expense Trend',
        text: expChange <= 0
          ? `Expenses decreased ${Math.abs(expChange).toFixed(0)}% vs last period. Excellent discipline.`
          : `Expenses increased ${expChange.toFixed(0)}% vs last period. Identify the largest drivers.`,
        type: expChange <= 0 ? 'good' as const : 'warn' as const,
      },
      {
        icon: '🏦',
        title: 'Savings Rate',
        text: curr.savingsRate >= 20
          ? `Your ${curr.savingsRate.toFixed(0)}% savings rate exceeds the recommended 20% threshold.`
          : `Target a 20% savings rate. You are currently at ${curr.savingsRate.toFixed(0)}%.`,
        type: curr.savingsRate >= 20 ? 'good' as const : 'info' as const,
      },
      {
        icon: '🔍',
        title: 'Top Spending Area',
        text: Object.keys(curr.byCategory).length > 0
          ? `Your top expense category this period was ${categories.find(c => c.id === Object.entries(curr.byCategory).sort((a, b) => b[1] - a[1])[0]?.[0])?.name ?? 'uncategorized'}. Consider if this aligns with your priorities.`
          : `No expense data for this period.`,
        type: 'info' as const,
      },
    ];

    return {
      summary: `You earned $${curr.income.toFixed(2)} and spent $${curr.expenses.toFixed(2)} this period. ${expChange > 10 ? `Expenses rose ${expChange.toFixed(0)}% vs the previous period.` : expChange < -10 ? `Expenses dropped ${Math.abs(expChange).toFixed(0)}% vs the previous period.` : 'Spending was relatively stable vs the previous period.'}`,
      advice,
      isAiGenerated: false
    };
  }

  // ── Phase 3: Natural Language Logging & Smart Import ───────────────────────

  async parseNaturalLanguageLog(
    userId: string,
    sentence: string,
    clientDateStr?: string
  ): Promise<{
    amount: number | null;
    type: 'income' | 'expense' | 'transfer';
    description: string | null;
    date: string | null;
    categoryId: string | null;
  }> {
    const categories = await this.getCategories(userId);
    const today = clientDateStr ?? new Date().toISOString().split('T')[0];
    const apiKey = process.env['GEMINI_API_KEY'];
    if (!apiKey) {
      throw new Error('Gemini API key is not configured.');
    }

    const catList = categories.map(c => `- ${c.id}: ${c.name} (${c.type})`).join('\n');

    const prompt = `You are a financial parser for a personal finance application.
Parse the following natural language sentence describing a financial transaction.
Today is ${today}.

SENTENCE: "${sentence}"

CATEGORIES AVAILABLE:
${catList}

Extract:
1. amount: number (absolute value, e.g. 2500 for $2500)
2. type: 'income', 'expense', or 'transfer'. Words like 'received', 'salary', 'refund', 'earn', 'gift from' suggest income. Words like 'paid', 'spent', 'bought', 'bought for', 'lost' suggest expense. Words like 'transfer to', 'moved to' suggest transfer.
3. description: a clean merchant name or description (e.g. 'Walmart', 'salary', 'landlord', 'transfer between accounts').
4. date: YYYY-MM-DD. Calculate the date relative to today's date (${today}) if the user says 'today', 'yesterday', 'last monday', etc. If no date is mentioned, use today's date (${today}).
5. categoryId: map the transaction to the most appropriate category ID from the list above. If unsure, set to null.

You MUST return a JSON object with this exact structure:
{
  "amount": number | null,
  "type": "income" | "expense" | "transfer",
  "description": string | null,
  "date": "YYYY-MM-DD" | null,
  "categoryId": string | null
}
Return ONLY valid JSON. No Markdown formatting, no code block backticks, no other text.`;

    const response = await fetchGeminiWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 2000 },
        }),
      }
    );

    if (response.ok) {
      const json = await response.json() as any;
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (text) {
        try {
          return JSON.parse(text);
        } catch (e) {
          console.error('Failed to parse Gemini natural language response JSON:', text, e);
        }
      }
    }
    throw new Error('Could not parse sentence');
  }

  async saveBulkTransactions(
    userId: string,
    txns: Array<Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<Transaction[]> {
    const now = new Date().toISOString();
    const createdTxns = [];

    for (const t of txns) {
      const id = uuidv4();
      const dateStr = t.date;
      const amountVal = t.amount;
      const descStr = t.description;
      const rawDesc = t.rawDescription ?? descStr;
      const hash = `${userId}__${dateStr}__${amountVal.toFixed(2)}__${rawDesc}`;

      const dup = await prisma.transaction.findFirst({
        where: { userId, bankTransactionHash: hash }
      });
      if (dup) continue;

      const row = await prisma.transaction.create({
        data: {
          id,
          userId,
          type: t.type,
          amount: t.amount,
          category: t.category || null,
          description: descStr,
          date: dateStr,
          tags: serializeTags(t.tags),
          isRecurring: t.isRecurring ? 1 : 0,
          recurringFrequency: t.recurringFrequency ?? null,
          recurringId: t.recurringId ?? null,
          paymentMethod: t.paymentMethod ?? null,
          notes: t.notes ?? null,
          accountId: t.accountId,
          toAccountId: t.toAccountId ?? null,
          source: t.source ?? 'import',
          importId: t.importId ?? null,
          rawDescription: rawDesc,
          bankTransactionHash: hash,
          createdAt: now,
          updatedAt: now,
        }
      });
      createdTxns.push(rowToTransaction(row));
    }

    return createdTxns;
  }

  async findLocalHeuristicCategory(userId: string, description: string): Promise<string | null> {
    const normDesc = this.normalizeDescription(description);
    if (!normDesc) return null;

    const recentTxns = await prisma.transaction.findMany({
      where: { userId },
      take: 300,
      orderBy: { date: 'desc' },
      select: { description: true, category: true }
    });

    for (const txn of recentTxns) {
      if (txn.category && this.normalizeDescription(txn.description) === normDesc) {
        return txn.category;
      }
    }

    for (const txn of recentTxns) {
      if (txn.category) {
        const normTxnDesc = this.normalizeDescription(txn.description);
        if (normTxnDesc && (normDesc.includes(normTxnDesc) || normTxnDesc.includes(normDesc))) {
          return txn.category;
        }
      }
    }

    return null;
  }

  async predictCategoriesBatch(
    userId: string,
    items: Array<{ description: string; type: string }>
  ): Promise<Array<{ description: string; categoryId: string | null }>> {
    const categories = await this.getCategories(userId);
    const apiKey = process.env['GEMINI_API_KEY'];
    if (!apiKey || categories.length === 0 || items.length === 0) {
      return items.map(item => ({ description: item.description, categoryId: null }));
    }

    const catList = categories.map(c => `- ${c.id}: ${c.name} (${c.type})`).join('\n');
    const itemsList = items.map((item, idx) => `${idx + 1}. Description: "${item.description}", Type: ${item.type}`).join('\n');

    const prompt = `You are a financial transaction classification system.
Map each of the transaction descriptions listed below to the most appropriate category ID from the CATEGORIES list.

CATEGORIES AVAILABLE:
${catList}

TRANSACTIONS TO CLASSIFY:
${itemsList}

You MUST return a JSON array where each item represents one classified transaction in the exact order:
[
  {
    "description": "the original description",
    "categoryId": "the category ID or null if unsure"
  },
  ...
]
Return ONLY valid JSON. Do not include markdown code block formatting or backticks.`;

    try {
      const response = await fetchGeminiWithRetry(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 1000 },
          }),
        }
      );

      if (response.ok) {
        const json = await response.json() as any;
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text) {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed)) {
            return parsed.map((p: any) => ({
              description: p.description,
              categoryId: categories.find(c => c.id === p.categoryId)?.id ?? null
            }));
          }
        }
      }
    } catch (err) {
      console.error('Batch AI category classification failed:', err);
    }

    return items.map(item => {
      const descLower = item.description.toLowerCase();
      for (const cat of categories) {
        if (descLower.includes(cat.name.toLowerCase()) || descLower.includes(cat.id.toLowerCase())) {
          return { description: item.description, categoryId: cat.id };
        }
      }
      return { description: item.description, categoryId: null };
    });
  }

  async optimizeBudgets(userId: string): Promise<any> {
    const categories = await this.getCategories(userId);
    const budgets = await this.getBudgets(userId);
    const transactions = await prisma.transaction.findMany({
      where: { userId, type: 'expense' },
      orderBy: { date: 'desc' },
      take: 1000
    });

    const monthlySpend: Record<string, number> = {};
    if (transactions.length > 0) {
      const dates = transactions.map((t: any) => new Date(t.date));
      const maxDate = new Date(Math.max(...dates.map((d: Date) => d.getTime())));
      const minDate = new Date(Math.min(...dates.map((d: Date) => d.getTime())));
      const diffMonths = Math.max(1, Math.round((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24 * 30.4)));

      transactions.forEach((t: any) => {
        monthlySpend[t.category ?? ''] = (monthlySpend[t.category ?? ''] || 0) + t.amount;
      });
      Object.keys(monthlySpend).forEach(cat => {
        monthlySpend[cat] = monthlySpend[cat] / diffMonths;
      });
    }

    const discretionaryCategories = categories.filter(c => {
      const isFixed = ['housing', 'utilities', 'insurance', 'healthcare', 'taxes'].includes(c.id.toLowerCase()) || c.name.toLowerCase().includes('rent') || c.name.toLowerCase().includes('insurance') || c.name.toLowerCase().includes('utility');
      return c.type === 'expense' && !isFixed;
    }).map(c => c.id);

    const fixedCategories = categories.filter(c => {
      const isFixed = ['housing', 'utilities', 'insurance', 'healthcare', 'taxes'].includes(c.id.toLowerCase()) || c.name.toLowerCase().includes('rent') || c.name.toLowerCase().includes('insurance') || c.name.toLowerCase().includes('utility');
      return c.type === 'expense' && isFixed;
    }).map(c => c.id);

    const apiKey = process.env['GEMINI_API_KEY'];
    if (apiKey && budgets.length > 0) {
      try {
        const budgetStr = budgets.map(b => `- Category: ${b.categoryId} (${b.categoryName}), Current Budget Limit: $${b.amount}, Monthly Avg Spend: $${(monthlySpend[b.categoryId] || 0).toFixed(2)}`).join('\n');
        const discretionaryStr = categories.filter(c => discretionaryCategories.includes(c.id)).map(c => `- ${c.id}: ${c.name}`).join('\n');
        const fixedStr = categories.filter(c => fixedCategories.includes(c.id)).map(c => `- ${c.id}: ${c.name}`).join('\n');

        const prompt = `You are an expert AI Budget Optimizer.
The user wants to optimize their monthly budget. Analyze their current budgets and average spending, then propose 3 optimized budget plans: Conservative, Moderate, and Aggressive.

CRITICAL RULE:
Fixed expenses (Housing/Rent, Utilities, Insurance, Healthcare, Taxes) are frozen. Propose EXACTLY 0% cuts to these categories:
${fixedStr}

You may only suggest budget cuts to Discretionary categories:
${discretionaryStr}

Current Budgets & Historical Spending Context:
${budgetStr}

Generate 3 tiers:
1. "Conservative": Suggest small, easy-to-achieve cuts of 5% to 10% on discretionary categories.
2. "Moderate": Suggest balanced cuts of 15% to 20% on discretionary categories.
3. "Aggressive": Propose tight, frugal cuts of 30% to 45% on discretionary categories.

Each plan should have a friendly, encouraging explanation.

Your response MUST be JSON format matching this schema (do not include Markdown or code block fences):
{
  "plans": [
    {
      "name": "Conservative",
      "totalSavings": number,
      "description": "string describing the approach and major changes",
      "modifications": [
        {
          "categoryId": "string",
          "categoryName": "string",
          "currentAmount": number,
          "proposedAmount": number,
          "percentageCut": number
        }
      ]
    },
    ... (Moderate and Aggressive plans)
  ]
}`;

        const response = await fetchGeminiWithRetry(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 1000 },
            }),
          }
        );

        if (response.ok) {
          const json = await response.json() as any;
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (text) {
            const parsed = JSON.parse(text);
            if (parsed && Array.isArray(parsed.plans)) {
              return parsed;
            }
          }
        }
      } catch (err) {
        console.error('AI Budget Optimizer failed, using heuristic fallback:', err);
      }
    }

    const plans = ['Conservative', 'Moderate', 'Aggressive'].map(planName => {
      const cutRate = planName === 'Conservative' ? 0.08 : planName === 'Moderate' ? 0.18 : 0.35;
      let totalSavings = 0;
      const modifications: any[] = [];

      budgets.forEach(b => {
        const isDiscretionary = discretionaryCategories.includes(b.categoryId);
        if (isDiscretionary) {
          const cut = Math.round(b.amount * cutRate);
          const proposed = Math.max(10, b.amount - cut);
          const savings = b.amount - proposed;
          totalSavings += savings;

          modifications.push({
            categoryId: b.categoryId,
            categoryName: b.categoryName,
            currentAmount: b.amount,
            proposedAmount: proposed,
            percentageCut: Math.round(cutRate * 100)
          });
        } else {
          modifications.push({
            categoryId: b.categoryId,
            categoryName: b.categoryName,
            currentAmount: b.amount,
            proposedAmount: b.amount,
            percentageCut: 0
          });
        }
      });

      let desc = '';
      if (planName === 'Conservative') {
        desc = 'A gentle adjustment trimming minor discretionary costs (8% cut). Very easy to maintain.';
      } else if (planName === 'Moderate') {
        desc = 'A balanced 18% cut on dining out, shopping, and entertainment. Requires conscious choice but leaves plenty of room.';
      } else {
        desc = 'A strict 35% cut to maximize your savings rate. High effort, high reward. Ideal if you are aiming to reach a goal quickly.';
      }

      return {
        name: planName,
        totalSavings,
        description: desc,
        modifications
      };
    });

    return { plans };
  }

  async evaluateGoalBuddy(userId: string, goalId: string): Promise<any> {
    const goal = await prisma.goal.findFirst({ where: { id: goalId, userId } });
    if (!goal) throw new Error('Goal not found');

    const now = new Date();
    const reports = [];
    for (let i = 0; i < 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      try {
        const rep = await this.getMonthlyReport(userId, d.getFullYear(), d.getMonth() + 1);
        reports.push(rep);
      } catch {}
    }
    const avgSurplus = reports.length > 0
      ? reports.reduce((s, r) => s + r.netBalance, 0) / reports.length
      : 0;

    const categories = await this.getCategories(userId);

    const targetDate = new Date(goal.targetDate + 'T00:00:00');
    const today = new Date();
    const diffTime = targetDate.getTime() - today.getTime();
    const diffDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    const monthsRemaining = Math.max(1, Math.round(diffDays / 30.4));

    const remainingAmount = Math.max(0, goal.targetAmount - goal.currentAmount);
    const requiredMonthlySavings = monthsRemaining > 0 ? remainingAmount / monthsRemaining : remainingAmount;

    const isOffTrack = avgSurplus < requiredMonthlySavings;

    const apiKey = process.env['GEMINI_API_KEY'];
    if (apiKey) {
      try {
        const prompt = `You are a supportive, friendly personal finance buddy.
Analyze this savings goal and the user's current cashflow surplus, then give some friendly, gentle financial advice.

GOAL INFORMATION:
- Name: "${goal.name}"
- Target Amount: $${goal.targetAmount.toFixed(2)}
- Current Amount Saved: $${goal.currentAmount.toFixed(2)}
- Remaining Amount needed: $${remainingAmount.toFixed(2)}
- Target Date: ${goal.targetDate} (${monthsRemaining} months remaining)
- Required monthly savings to reach this goal on time: $${requiredMonthlySavings.toFixed(2)} / month

USER ACTUAL CASHFLOW CONTEXT:
- Average monthly surplus (income minus expenses) over last 3 months: $${avgSurplus.toFixed(2)} / month

STATUS:
- The user is ${isOffTrack ? 'OFF-TRACK' : 'ON-TRACK'}.
${isOffTrack ? `They have a cashflow deficit of $${(requiredMonthlySavings - avgSurplus).toFixed(2)} / month to meet this goal.` : `They have a surplus buffer of $${(avgSurplus - requiredMonthlySavings).toFixed(2)} / month!`}

Your job:
1. Write a short, friendly encouraging message (max 3 sentences) like a financial buddy.
2. If off-track, suggest concrete actions, e.g. extending the target date gently to a new date, or trimming some discretionary categories.
3. If on-track, celebrate with them and suggest a minor tip (e.g. automating savings).

Available discretionary categories you can mention:
${categories.filter(c => !['housing', 'utilities', 'insurance', 'healthcare', 'taxes'].includes(c.id.toLowerCase())).map(c => c.name).join(', ')}

Return JSON format matching this schema:
{
  "status": "on_track" | "off_track",
  "buddyMessage": "string containing your friendly advice",
  "suggestedActions": [
    "action string 1",
    "action string 2"
  ]
}`;

        const response = await fetchGeminiWithRetry(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 2000 },
            }),
          }
        );

        if (response.ok) {
          const json = await response.json() as any;
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (text) {
            const parsed = JSON.parse(text);
            if (parsed && parsed.buddyMessage) {
              return parsed;
            }
          }
        }
      } catch (err) {
        console.error('Goal Buddy AI failed, using fallback:', err);
      }
    }

    let buddyMessage = '';
    const suggestedActions = [];

    if (isOffTrack) {
      const deficit = requiredMonthlySavings - avgSurplus;
      buddyMessage = `Hey! I looked over your "${goal.name}" goal. Currently, you need to save $${requiredMonthlySavings.toFixed(0)}/mo, but your average surplus is $${avgSurplus.toFixed(0)}/mo. We're a bit behind, but we can totally fix this together!`;
      
      const extendedMonths = Math.ceil(remainingAmount / Math.max(10, avgSurplus));
      const extendedDate = new Date();
      extendedDate.setMonth(extendedDate.getMonth() + extendedMonths);
      const extendedDateStr = extendedDate.toISOString().split('T')[0];

      suggestedActions.push(`Extend the target date gently to ${extendedDateStr} to align with your current savings pace ($${avgSurplus.toFixed(0)}/mo).`);
      suggestedActions.push(`Try to trim discretionary spending (e.g., dining out or shopping) by ~$${deficit.toFixed(0)}/mo to stay on the current timeline.`);
    } else {
      buddyMessage = `Amazing job! You're saving $${avgSurplus.toFixed(0)}/mo on average, which easily covers the $${requiredMonthlySavings.toFixed(0)}/mo needed for your "${goal.name}" goal. You're fully on track to crush this!`;
      suggestedActions.push('Consider setting up an automated recurring transfer to your savings account on payday.');
      suggestedActions.push('If you feel comfortable, you could even pull the target date forward to finish early!');
    }

    return {
      status: isOffTrack ? 'off_track' : 'on_track',
      buddyMessage,
      suggestedActions
    };
  }

  // ── Bank Imports (future feature) ─────────────────────────────────────────

  async getBankImports(userId: string): Promise<BankImport[]> {
    const rows = await prisma.bankImport.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r: PrismaBankImportRow) => ({
      id: r.id,
      userId: r.userId,
      fileName: r.fileName,
      bankName: r.bankName ?? undefined,
      fileType: r.fileType,
      status: r.status as BankImport['status'],
      totalRows: r.totalRows,
      importedCount: r.importedCount,
      skippedCount: r.skippedCount,
      failedCount: r.failedCount,
      dateFrom: r.dateFrom ?? undefined,
      dateTo: r.dateTo ?? undefined,
      errorMessage: r.errorMessage ?? undefined,
      createdAt: r.createdAt,
      completedAt: r.completedAt ?? undefined,
    }));
  }

  async createBankImport(
    userId: string,
    data: Pick<BankImport, 'fileName' | 'bankName' | 'fileType'>
  ): Promise<BankImport> {
    const now = new Date().toISOString();
    const row = await prisma.bankImport.create({
      data: {
        id: uuidv4(), userId,
        fileName: data.fileName,
        bankName: data.bankName ?? null,
        fileType: data.fileType,
        status: 'pending',
        totalRows: 0,
        importedCount: 0,
        skippedCount: 0,
        failedCount: 0,
        createdAt: now,
      },
    });
    return {
      id: row.id,
      userId: row.userId,
      fileName: row.fileName,
      bankName: row.bankName ?? undefined,
      fileType: row.fileType,
      status: row.status as BankImport['status'],
      totalRows: row.totalRows,
      importedCount: row.importedCount,
      skippedCount: row.skippedCount,
      failedCount: row.failedCount,
      dateFrom: undefined,
      dateTo: undefined,
      errorMessage: undefined,
      createdAt: row.createdAt,
      completedAt: undefined,
    };

  }

  async updateBankImport(userId: string, id: string, data: Partial<BankImport>): Promise<BankImport | null> {
    const existing = await prisma.bankImport.findFirst({ where: { id, userId } });
    if (!existing) return null;
    const updated = await prisma.bankImport.update({
      where: { id },
      data: {
        ...(data.status        !== undefined && { status: data.status }),
        ...(data.totalRows     !== undefined && { totalRows: data.totalRows }),
        ...(data.importedCount !== undefined && { importedCount: data.importedCount }),
        ...(data.skippedCount  !== undefined && { skippedCount: data.skippedCount }),
        ...(data.failedCount   !== undefined && { failedCount: data.failedCount }),
        ...(data.dateFrom      !== undefined && { dateFrom: data.dateFrom }),
        ...(data.dateTo        !== undefined && { dateTo: data.dateTo }),
        ...(data.errorMessage  !== undefined && { errorMessage: data.errorMessage }),
        ...(data.completedAt   !== undefined && { completedAt: data.completedAt }),
      },
    });
    return {
      ...updated,
      status: updated.status as BankImport['status'],
      bankName: updated.bankName ?? undefined,
      dateFrom: updated.dateFrom ?? undefined,
      dateTo: updated.dateTo ?? undefined,
      errorMessage: updated.errorMessage ?? undefined,
      completedAt: updated.completedAt ?? undefined,
    };
  }

  // ── Goals CRUD ────────────────────────────────────────────────────────────

  async getGoals(userId: string): Promise<Goal[]> {
    const rows = await prisma.goal.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      targetAmount: r.targetAmount,
      targetDate: r.targetDate,
      currentAmount: r.currentAmount,
      accountId: r.accountId ?? undefined,
      createdAt: r.createdAt,
    }));
  }

  async createGoal(userId: string, data: Omit<Goal, 'id' | 'createdAt'>): Promise<Goal> {
    const now = new Date().toISOString();
    const id = uuidv4();
    const row = await prisma.goal.create({
      data: {
        id,
        userId,
        name: data.name,
        targetAmount: data.targetAmount,
        targetDate: data.targetDate,
        currentAmount: data.currentAmount ?? 0,
        accountId: data.accountId ?? null,
        createdAt: now,
      },
    });
    return {
      id: row.id,
      name: row.name,
      targetAmount: row.targetAmount,
      targetDate: row.targetDate,
      currentAmount: row.currentAmount,
      accountId: row.accountId ?? undefined,
      createdAt: row.createdAt,
    };
  }

  async updateGoal(userId: string, id: string, data: Partial<Goal>): Promise<Goal | null> {
    const existing = await prisma.goal.findFirst({ where: { id, userId } });
    if (!existing) return null;
    const updated = await prisma.goal.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.targetAmount !== undefined && { targetAmount: data.targetAmount }),
        ...(data.targetDate !== undefined && { targetDate: data.targetDate }),
        ...(data.currentAmount !== undefined && { currentAmount: data.currentAmount }),
        ...(data.accountId !== undefined && { accountId: data.accountId ?? null }),
      },
    });
    return {
      id: updated.id,
      name: updated.name,
      targetAmount: updated.targetAmount,
      targetDate: updated.targetDate,
      currentAmount: updated.currentAmount,
      accountId: updated.accountId ?? undefined,
      createdAt: updated.createdAt,
    };
  }

  async deleteGoal(userId: string, id: string): Promise<boolean> {
    const existing = await prisma.goal.findFirst({ where: { id, userId } });
    if (!existing) return false;
    await prisma.goal.delete({ where: { id } });
    return true;
  }

  async suggestCategory(userId: string, description: string, type: string): Promise<string | null> {
    const categories = await this.getCategories(userId);
    const recentTxns = await prisma.transaction.findMany({
      where: { userId, type },
      take: 100,
      orderBy: { date: 'desc' },
      select: { description: true, category: true },
    });

    const apiKey = process.env['GEMINI_API_KEY'];
    if (apiKey && categories.length > 0) {
      try {
        const catList = categories.map(c => `- ${c.id}: ${c.name} (${c.type})`).join('\n');
        const examples = recentTxns.slice(0, 15).map((t: any) => `- "${t.description}" -> ${t.category}`).join('\n');
        
        const prompt = `You are a financial classification system. Map a new transaction description to the most appropriate category ID from the list below.
        
CATEGORIES AVAILABLE:
${catList}

RECENT EXAMPLES FOR REFERENCE:
${examples || 'None'}

NEW TRANSACTION DESCRIPTION:
"${description}"
Type: ${type}

Respond with ONLY the exact category ID (e.g. food) from the list. If unsure, respond with: null`;

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { maxOutputTokens: 1000 },
            }),
          }
        );
        if (response.ok) {
          const json = await response.json() as any;
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (text) {
            const cleanId = text.replace(/['"`\s]/g, '');
            const matching = categories.find(c => c.id.toLowerCase() === cleanId.toLowerCase() || c.name.toLowerCase() === cleanId.toLowerCase());
            if (matching) return matching.id;
          }
        }
      } catch (err) {
        console.error('AI category suggestion failed:', err);
      }
    }

    // Heuristic fallback
    const descLower = description.toLowerCase();
    for (const cat of categories) {
      if (descLower.includes(cat.name.toLowerCase()) || descLower.includes(cat.id.toLowerCase())) {
        return cat.id;
      }
    }
    // Check recent exact description match
    const exactMatch = recentTxns.find((t: any) => t.description.toLowerCase() === descLower);
    if (exactMatch && exactMatch.category) return exactMatch.category;

    return null;
  }

  async auditComprehensive(userId: string): Promise<any> {
    try {
      const accounts = await this.getAccounts(userId);
      const settings = await this.getSettings(userId);
      const primaryCurrency = settings.currency || 'USD';
      const rates = await getExchangeRates();

      // Get all transactions for running balance calculation
      const allTxnsRows = await prisma.transaction.findMany({ where: { userId } });
      const allTxns = allTxnsRows.map(rowToTransaction);

      const balances: Record<string, number> = {};
      accounts.forEach((a: Account) => {
        balances[a.id] = Math.abs(a.initialBalance ?? 0);
      });

      allTxns.forEach((t: Transaction) => {
        if (t.type === 'income') {
          const acc = accounts.find((a: Account) => a.id === t.accountId);
          if (acc?.type === 'liability') {
            balances[t.accountId] = (balances[t.accountId] || 0) - t.amount;
          } else {
            balances[t.accountId] = (balances[t.accountId] || 0) + t.amount;
          }
        } else if (t.type === 'expense') {
          const acc = accounts.find((a: Account) => a.id === t.accountId);
          if (acc?.type === 'liability') {
            balances[t.accountId] = (balances[t.accountId] || 0) + t.amount;
          } else {
            balances[t.accountId] = (balances[t.accountId] || 0) - t.amount;
          }
        } else if (t.type === 'transfer') {
          const fromAcc = accounts.find((a: Account) => a.id === t.accountId);
          const toAcc = accounts.find((a: Account) => a.id === t.toAccountId);
          if (fromAcc?.type === 'liability') {
            balances[t.accountId] = (balances[t.accountId] || 0) + t.amount;
          } else {
            balances[t.accountId] = (balances[t.accountId] || 0) - t.amount;
          }
          if (t.toAccountId) {
            if (toAcc?.type === 'liability') {
              balances[t.toAccountId] = (balances[t.toAccountId] || 0) - t.amount;
            } else {
              balances[t.toAccountId] = (balances[t.toAccountId] || 0) + t.amount;
            }
          }
        }
      });

      // Add stock holdings to investment accounts
      accounts.forEach((a: Account) => {
        if (a.isInvestment && a.stockHoldings?.length) {
          const mktVal = a.stockHoldings.reduce((sum: number, h: StockHolding) => sum + h.shares * h.price, 0);
          balances[a.id] = (balances[a.id] || 0) + mktVal;
        }
      });

      let netWorth = 0;
      let totalCashAssets = 0;
      let totalInvestmentAssets = 0;
      let totalLiabilities = 0;
      let totalStockHoldingsValue = 0;

      accounts.forEach((a: Account) => {
        const bal = balances[a.id] || 0;
        const accCurrency = a.currency || 'USD';
        let convertedBal = bal;
        if (accCurrency.toUpperCase() !== primaryCurrency.toUpperCase()) {
          const fromRate = rates[accCurrency.toUpperCase()] || 1.0;
          const toRate = rates[primaryCurrency.toUpperCase()] || 1.0;
          convertedBal = (bal / fromRate) * toRate;
        }

        if (a.type === 'asset') {
          netWorth += convertedBal;
          if (a.isInvestment) {
            totalInvestmentAssets += convertedBal;
          } else {
            totalCashAssets += convertedBal;
          }
        } else {
          netWorth -= convertedBal;
          totalLiabilities += convertedBal;
        }

        if (a.stockHoldings?.length) {
          a.stockHoldings.forEach((h: StockHolding) => {
            let convertedHolding = h.shares * h.price;
            if (accCurrency.toUpperCase() !== primaryCurrency.toUpperCase()) {
              const fromRate = rates[accCurrency.toUpperCase()] || 1.0;
              const toRate = rates[primaryCurrency.toUpperCase()] || 1.0;
              convertedHolding = (convertedHolding / fromRate) * toRate;
            }
            totalStockHoldingsValue += convertedHolding;
          });
        }
      });

      // 6-month historical averages
      const today = new Date().toLocaleDateString('en-CA');
      const dFrom = new Date();
      dFrom.setMonth(dFrom.getMonth() - 6);
      const dateFrom = dFrom.toLocaleDateString('en-CA');
      
      const sixMonthTxns = await this._getFilteredTransactions(userId, dateFrom, today);
      const categories = await this.getCategories(userId);

      const totalIncome = sixMonthTxns.filter((t: Transaction) => t.type === 'income').reduce((s: number, t: Transaction) => s + t.amount, 0);
      const totalExpenses = sixMonthTxns.filter((t: Transaction) => t.type === 'expense').reduce((s: number, t: Transaction) => s + t.amount, 0);
      const avgMonthlyIncome = totalIncome / 6;
      const avgMonthlyExpense = totalExpenses / 6;

      // Group expenses by category
      const categorySpendMap: Record<string, number> = {};
      sixMonthTxns.filter((t: Transaction) => t.type === 'expense').forEach((t: Transaction) => {
        categorySpendMap[t.category || ''] = (categorySpendMap[t.category || ''] || 0) + t.amount;
      });

      // Fixed vs Discretionary
      const fixedCats = ['housing', 'utilities', 'insurance', 'healthcare', 'taxes'];
      const isFixed = (catId: string, desc: string): boolean => {
        const cId = catId.toLowerCase();
        const d = desc.toLowerCase();
        return fixedCats.includes(cId) || d.includes('rent') || d.includes('insurance') || d.includes('utility');
      };

      const categoryBreakdownList = categories.map((cat: Category) => {
        const totalSpend = categorySpendMap[cat.id] || 0;
        const avgMonthlySpend = totalSpend / 6;
        const type = isFixed(cat.id, cat.name) ? 'fixed' : 'discretionary';
        return {
          id: cat.id,
          name: cat.name,
          fixedOrDiscretionary: type,
          totalSpend,
          avgMonthlySpend
        };
      }).filter((c: any) => c.totalSpend > 0);

      // Budgets
      const budgets = await this.getBudgets(userId);
      const budgetSummary = budgets.map((b: Budget) => ({
        categoryName: b.categoryName,
        categoryId: b.categoryId,
        amount: b.amount,
        period: b.period
      }));

      // Subscription/Bill spikes (price creeps) or transaction clusters
      const groups: Record<string, { amounts: number[], dates: string[], category: string }> = {};
      sixMonthTxns.filter((t: Transaction) => t.type === 'expense').forEach((t: Transaction) => {
        const norm = this.normalizeDescription(t.description);
        if (norm.length >= 3) {
          if (!groups[norm]) groups[norm] = { amounts: [], dates: [], category: t.category || '' };
          groups[norm].amounts.push(t.amount);
          groups[norm].dates.push(t.date);
        }
      });

      const priceCreeps: any[] = [];
      Object.entries(groups).forEach(([desc, data]: [string, any]) => {
        if (data.amounts.length >= 2) {
          const sorted = data.amounts.map((amt: number, idx: number) => ({ amt, date: data.dates[idx] })).sort((a: any, b: any) => a.date.localeCompare(b.date));
          const first = sorted[0].amt;
          const last = sorted[sorted.length - 1].amt;
          if (last > first && (last - first) > 1.0) {
            priceCreeps.push({
              description: desc,
              category: data.category,
              firstPrice: first,
              lastPrice: last,
              increase: last - first,
              percentIncrease: ((last - first) / first) * 100
            });
          }
        }
      });

      // Prepare metadata for Gemini
      const metadata = {
        primaryCurrency,
        netWorth: parseFloat(netWorth.toFixed(2)),
        totalCashAssets: parseFloat(totalCashAssets.toFixed(2)),
        totalInvestmentAssets: parseFloat(totalInvestmentAssets.toFixed(2)),
        totalLiabilities: parseFloat(totalLiabilities.toFixed(2)),
        totalStockHoldingsValue: parseFloat(totalStockHoldingsValue.toFixed(2)),
        avgMonthlyIncome: parseFloat(avgMonthlyIncome.toFixed(2)),
        avgMonthlyExpense: parseFloat(avgMonthlyExpense.toFixed(2)),
        categoryBreakdown: categoryBreakdownList.map(c => ({
          name: c.name,
          type: c.fixedOrDiscretionary,
          avgMonthlySpend: parseFloat(c.avgMonthlySpend.toFixed(2))
        })),
        budgets: budgetSummary,
        potentialPriceCreeps: priceCreeps.slice(0, 5)
      };

      const apiKey = process.env['GEMINI_API_KEY'];
      if (apiKey) {
        const prompt = `You are an elite AI wealth advisor and forensic financial auditor. Analyze the user's financial profile below and generate a detailed diagnostics report.

FINANCIAL PROFILE METRICS:
- Primary Currency: ${metadata.primaryCurrency}
- Net Worth: ${primaryCurrency} ${metadata.netWorth}
- Cash Assets: ${primaryCurrency} ${metadata.totalCashAssets}
- Stock Investment Portfolio Value: ${primaryCurrency} ${metadata.totalInvestmentAssets} (Stock holdings market value: ${primaryCurrency} ${metadata.totalStockHoldingsValue})
- Total Debt/Liabilities: ${primaryCurrency} ${metadata.totalLiabilities}
- 6-Month Average Monthly Income: ${primaryCurrency} ${metadata.avgMonthlyIncome}
- 6-Month Average Monthly Expense: ${primaryCurrency} ${metadata.avgMonthlyExpense}

BUDGET CONSTRAINTS:
${metadata.budgets.length > 0 ? JSON.stringify(metadata.budgets, null, 2) : 'No budgets configured.'}

CATEGORY SPENDING BREAKDOWN (6-MONTH AVERAGES):
${JSON.stringify(metadata.categoryBreakdown, null, 2)}

POTENTIAL PRICE CREEPS OR SUBSCRIPTION HIKES IDENTIFIED:
${JSON.stringify(metadata.potentialPriceCreeps, null, 2)}

DIAGNOSTICS REQUIREMENTS:
1. Identify "What am I doing wrong" (wrong):
   - Find leaks, price creeps, budget breaches (where average spend exceeds budget), low savings rates, or bad asset allocation (e.g. cash is too high/low, debt is too high).
   - Set severity: "high" (serious leakage, credit card debt, budget breach) or "medium" (minor leaks, small creep).
2. Identify "Where can I save" (opportunities):
   - Offer specific, actionable saving opportunities (e.g., cancel unused subscriptions, cook at home more, renegotiate utility prices, reduce discretionary spending in specific categories).
   - Each opportunity MUST have a numeric "savings" value (estimated monthly savings) and a "difficulty" ('Easy' | 'Medium' | 'Hard').
3. Create strategic next steps (todo):
   - Clear, short list of 3-5 next actions (e.g., Build a 6-month runway of ${primaryCurrency} xxx, transfer cash to investments, target high-interest credit card debt, create a budget for dining out).

You MUST respond with a JSON object matching this schema exactly:
{
  "wrong": [
    { "type": "subscription_hike | anomaly | budget_breach | high_discretionary | low_savings", "text": "Detailed critique with numbers and category/merchant name", "severity": "high | medium" }
  ],
  "opportunities": [
    { "id": "unique_id_string", "title": "Opportunity Title", "description": "Actionable explanation", "savings": number, "difficulty": "Easy|Medium|Hard" }
  ],
  "todo": [
    "Next step 1",
    "Next step 2",
    "Next step 3"
  ]
}

Ensure the response contains ONLY the valid JSON matching the schema, with no markdown formatting wrappers (like \`\`\`json) outside it.`;

        const response = await fetchGeminiWithRetry(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { responseMimeType: 'application/json' },
            }),
          }
        );

        if (response.ok) {
          const json = await response.json() as any;
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            const data = JSON.parse(text);
            if (Array.isArray(data.wrong) && Array.isArray(data.opportunities) && Array.isArray(data.todo)) {
              return data;
            }
          }
        }
      }
    } catch (err) {
      console.error('AI comprehensive diagnostics failed:', err);
    }

    // Heuristic Fallback in case of error or missing API key
    const mockWrong = [];
    const mockOpportunities = [];
    const mockTodo = [];

    // Fallback static advice
    mockWrong.push({
      type: 'low_savings',
      text: `Manual analysis shows spending needs review. Ensure your fixed expenses do not crowd out savings.`,
      severity: 'medium'
    });
    mockOpportunities.push({
      id: 'opp_subs',
      title: 'Review Subscriptions',
      description: 'Audit digital streaming services and cancel unused memberships.',
      savings: 45,
      difficulty: 'Easy'
    }, {
      id: 'opp_dining',
      title: 'Reduce Dining Out by 20%',
      description: 'Prepare meals at home during weekdays to save on restaurant costs.',
      savings: 80,
      difficulty: 'Medium'
    });
    mockTodo.push(
      `Build a 3 to 6-month cash emergency runway.`,
      `Create category budgets for discretionary expenses.`,
      `Invest surplus cash into long-term market index funds.`
    );

    return {
      wrong: mockWrong,
      opportunities: mockOpportunities,
      todo: mockTodo
    };
  }

  // ── Smart Subscription/Bill Detector ───────────────────────────────────────

  async detectRecurringBills(userId: string): Promise<any[]> {
    const transactions = await prisma.transaction.findMany({
      where: { userId, type: { in: ['income', 'expense'] } },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });

    if (transactions.length < 1) return [];

    const existingSchedules = await this.getRecurringSchedules(userId);
    const existingNormalized = new Set(
      existingSchedules.map(s => this.normalizeDescription(s.description))
    );

    // Fetch user dismissed suggestions
    const dismissed = await prisma.dismissedBill.findMany({
      where: { userId }
    });
    const dismissedNormalized = new Set(
      dismissed.map((d: any) => d.description)
    );

    const categories = await this.getCategories(userId);
    const categoryMap = new Map<string, string>();
    categories.forEach(c => categoryMap.set(c.id, c.name.toLowerCase()));

    const groups: Record<string, any[]> = {};
    transactions.forEach((t: any) => {
      const norm = this.normalizeDescription(t.description);
      if (norm.length >= 3) {
        if (!groups[norm]) groups[norm] = [];
        groups[norm].push(t);
      }
    });

    const suggestions: any[] = [];

    const addDays = (dateStr: string, days: number): string => {
      const d = new Date(dateStr + 'T00:00:00');
      d.setDate(d.getDate() + days);
      return d.toISOString().split('T')[0];
    };

    const recurringKeywords = [
      'insurance', 'rent', 'netflix', 'spotify', 'gym', 'internet', 'phone', 'mobile', 
      'electricity', 'hydro', 'utility', 'utilities', 'bill', 'subscription', 'prime', 
      'youtube', 'google', 'icloud', 'adobe', 'microsoft', 'zoom', 'disney', 'apple', 
      'mortgage', 'automative loan', 'car payment'
    ];

    const highConfidenceSubKeywords = [
      'netflix', 'spotify', 'youtube', 'disney', 'prime', 'icloud', 'apple', 'google', 'adobe', 'microsoft', 'zoom', 'github', 'chatgpt', 'openai'
    ];

    const matchesKeyword = (desc: string): boolean => {
      const lower = desc.toLowerCase();
      return recurringKeywords.some(kw => lower.includes(kw));
    };

    const isHighConfidenceSub = (desc: string): boolean => {
      const lower = desc.toLowerCase();
      return highConfidenceSubKeywords.some(kw => lower.includes(kw));
    };

    const matchesCategory = (catId: string, catName?: string): boolean => {
      const idLower = catId.toLowerCase();
      if (idLower === 'subscriptions' || idLower === 'utilities' || idLower === 'bills' || idLower === 'housing') return true;
      if (catName) {
        const nameLower = catName.toLowerCase();
        return nameLower.includes('subscription') || nameLower.includes('utility') || nameLower.includes('bill') || nameLower.includes('rent') || nameLower.includes('housing');
      }
      return false;
    };

    for (const [normDesc, txns] of Object.entries(groups)) {
      if (existingNormalized.has(normDesc)) continue;
      if (dismissedNormalized.has(normDesc)) continue;

      let suggestionAdded = false;

      // 1. Statistical check for groups with at least 2 transactions
      if (txns.length >= 2) {
        const intervals: number[] = [];
        for (let i = 1; i < txns.length; i++) {
          const d1 = new Date(txns[i - 1].date + 'T00:00:00').getTime();
          const d2 = new Date(txns[i].date + 'T00:00:00').getTime();
          const diffDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
          intervals.push(diffDays);
        }

        const avgInterval = intervals.reduce((s, x) => s + x, 0) / intervals.length;
        
        let consistent = true;
        if (intervals.length >= 2) {
          for (const interval of intervals) {
            if (Math.abs(interval - avgInterval) > 4) {
              consistent = false;
              break;
            }
          }
        }

        if (consistent) {
          let frequency: 'weekly' | 'monthly' | 'yearly' | null = null;
          let targetInterval = 30;

          if (avgInterval >= 5 && avgInterval <= 9) {
            frequency = 'weekly';
            targetInterval = 7;
          } else if (avgInterval >= 11 && avgInterval <= 16) {
            frequency = 'weekly';
            targetInterval = 14;
          } else if (avgInterval >= 25 && avgInterval <= 34) {
            frequency = 'monthly';
            targetInterval = 30;
          } else if (avgInterval >= 340 && avgInterval <= 380) {
            frequency = 'yearly';
            targetInterval = 365;
          }

          if (frequency) {
            const amounts = txns.map(t => t.amount);
            const minAmount = Math.min(...amounts);
            const maxAmount = Math.max(...amounts);
            const avgAmount = amounts.reduce((s, x) => s + x, 0) / amounts.length;

            const amtDiff = maxAmount - minAmount;
            const amtDiffPct = maxAmount > 0 ? (amtDiff / maxAmount) * 100 : 0;
            
            if (amtDiff <= 5 || amtDiffPct <= 12) {
              const categoriesCount: Record<string, number> = {};
              const accountsCount: Record<string, number> = {};
              txns.forEach(t => {
                categoriesCount[t.category] = (categoriesCount[t.category] || 0) + 1;
                accountsCount[t.accountId] = (accountsCount[t.accountId] || 0) + 1;
              });

              const mostCommonCategory = Object.entries(categoriesCount).sort((a, b) => b[1] - a[1])[0][0];
              const mostCommonAccount = Object.entries(accountsCount).sort((a, b) => b[1] - a[1])[0][0];

              const latestTxn = txns[txns.length - 1];
              const nextDue = addDays(latestTxn.date, targetInterval);

              suggestions.push({
                description: latestTxn.description,
                type: latestTxn.type,
                amount: Math.round(avgAmount * 100) / 100,
                category: mostCommonCategory,
                accountId: mostCommonAccount,
                frequency,
                startDate: latestTxn.date,
                nextDueDate: nextDue,
                matchCount: txns.length,
                confidence: 'high',
              });
              suggestionAdded = true;
            }
          }
        }
      }

      // 2. Keyword/category fallback check if not suggested statistically
      if (!suggestionAdded && txns.length >= 1) {
        const latestTxn = txns[txns.length - 1];
        const catName = categoryMap.get(latestTxn.category);
        
        const hasKeywordMatch = matchesKeyword(latestTxn.description);
        const hasCategoryMatch = matchesCategory(latestTxn.category, catName);
        
        if (hasKeywordMatch || hasCategoryMatch) {
          if (txns.length === 1) {
            if (isHighConfidenceSub(latestTxn.description)) {
              const nextDue = addDays(latestTxn.date, 30);
              suggestions.push({
                description: latestTxn.description,
                type: latestTxn.type,
                amount: latestTxn.amount,
                category: latestTxn.category,
                accountId: latestTxn.accountId,
                frequency: 'monthly',
                startDate: latestTxn.date,
                nextDueDate: nextDue,
                matchCount: txns.length,
                confidence: 'low',
              });
            }
          } else {
            const nextDue = addDays(latestTxn.date, 30);
            suggestions.push({
              description: latestTxn.description,
              type: latestTxn.type,
              amount: latestTxn.amount,
              category: latestTxn.category,
              accountId: latestTxn.accountId,
              frequency: 'monthly',
              startDate: latestTxn.date,
              nextDueDate: nextDue,
              matchCount: txns.length,
              confidence: 'medium',
            });
          }
        }
      }
    }

    return suggestions;
  }

  async dismissRecurringBill(userId: string, description: string): Promise<boolean> {
    const norm = this.normalizeDescription(description);
    if (!norm) return false;
    
    const existing = await prisma.dismissedBill.findFirst({
      where: { userId, description: norm }
    });
    if (existing) return true;

    await prisma.dismissedBill.create({
      data: {
        id: uuidv4(),
        userId,
        description: norm,
        createdAt: new Date().toISOString()
      }
    });
    return true;
  }

  async undismissRecurringBill(userId: string, description: string): Promise<boolean> {
    const norm = this.normalizeDescription(description);
    if (!norm) return false;

    await prisma.dismissedBill.deleteMany({
      where: { userId, description: norm }
    });
    return true;
  }

  async getSavingsAdvisor(userId: string): Promise<any> {
    const accounts = await this.getAccounts(userId);
    const transactionsRows = await prisma.transaction.findMany({ where: { userId } });
    const transactions = transactionsRows.map(rowToTransaction);
    const schedules = await prisma.recurringSchedule.findMany({
      where: { userId, isActive: 1 }
    });

    // 1. Calculate running balances
    const balances: Record<string, number> = {};
    accounts.forEach((a: any) => {
      balances[a.id] = a.initialBalance ?? 0;
    });

    transactions.forEach((t: any) => {
      if (t.type === 'income') {
        const acc = accounts.find((a: any) => a.id === t.accountId);
        if (acc?.type === 'liability') {
          balances[t.accountId] = (balances[t.accountId] || 0) - t.amount;
        } else {
          balances[t.accountId] = (balances[t.accountId] || 0) + t.amount;
        }
      } else if (t.type === 'expense') {
        const acc = accounts.find((a: any) => a.id === t.accountId);
        if (acc?.type === 'liability') {
          balances[t.accountId] = (balances[t.accountId] || 0) + t.amount;
        } else {
          balances[t.accountId] = (balances[t.accountId] || 0) - t.amount;
        }
      } else if (t.type === 'transfer') {
        const fromAcc = accounts.find((a: any) => a.id === t.accountId);
        const toAcc = accounts.find((a: any) => a.id === t.toAccountId);
        if (fromAcc?.type === 'liability') {
          balances[t.accountId] = (balances[t.accountId] || 0) + t.amount;
        } else {
          balances[t.accountId] = (balances[t.accountId] || 0) - t.amount;
        }
        if (t.toAccountId) {
          if (toAcc?.type === 'liability') {
            balances[t.toAccountId] = (balances[t.toAccountId] || 0) - t.amount;
          } else {
            balances[t.toAccountId] = (balances[t.toAccountId] || 0) + t.amount;
          }
        }
      }
    });

    // 2. Identify checking and savings accounts
    const analyzedAccounts = accounts.map((a: any) => {
      const isSavings = a.name.toLowerCase().includes('savings') || a.name.toLowerCase().includes('save') || a.isInvestment === 1;
      return {
        id: a.id,
        name: a.name,
        type: a.type,
        currency: a.currency,
        isSavings,
        balance: Math.round((balances[a.id] ?? 0) * 100) / 100
      };
    });

    // 3. Process upcoming schedules (lookahead: 30 days)
    const today = new Date();
    const lookaheadDate = new Date();
    lookaheadDate.setDate(today.getDate() + 30);

    const upcomingBills = schedules.filter((s: any) => {
      if (s.type !== 'expense') return false;
      const due = new Date(s.nextDueDate + 'T00:00:00');
      return due >= today && due <= lookaheadDate;
    });

    // 4. Calculate projected daily discretionary spending per account based on last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

    const recentTxns = transactions.filter((t: any) => {
      return t.type === 'expense' && t.date >= thirtyDaysAgoStr && !t.isRecurring;
    });

    const dailySpendingMap: Record<string, number> = {};
    recentTxns.forEach((t: any) => {
      dailySpendingMap[t.accountId] = (dailySpendingMap[t.accountId] || 0) + t.amount;
    });
    // Convert to daily rate
    Object.keys(dailySpendingMap).forEach(accId => {
      dailySpendingMap[accId] = dailySpendingMap[accId] / 30;
    });

    // 5. Analyze each account's safe savings and shortfalls
    const accountDetails = analyzedAccounts.map((acc: any) => {
      const accBills = upcomingBills.filter((s: any) => s.accountId === acc.id).map((s: any) => {
        const due = new Date(s.nextDueDate + 'T00:00:00');
        const diffMs = due.getTime() - today.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        return {
          id: s.id,
          description: s.description,
          amount: s.amount,
          nextDueDate: s.nextDueDate,
          daysRemaining: diffDays
        };
      });

      const billsTotal = accBills.reduce((sum: number, b: any) => sum + b.amount, 0);
      const dailyRate = dailySpendingMap[acc.id] || 0;
      const projectedSpending = Math.round(dailyRate * 15 * 100) / 100;
      const buffer = 100; // static safety buffer of 100 CAD
      const currentBalance = acc.balance;

      let safeToSave = 0;
      let shortfall = 0;

      if (!acc.isSavings && acc.type === 'asset') {
        const reserved = billsTotal + projectedSpending + buffer;
        if (currentBalance > reserved) {
          safeToSave = Math.round((currentBalance - reserved) * 100) / 100;
        } else {
          shortfall = Math.round((reserved - currentBalance) * 100) / 100;
        }
      }

      return {
        ...acc,
        upcomingBills: accBills,
        upcomingBillsTotal: Math.round(billsTotal * 100) / 100,
        projectedSpending,
        safetyBuffer: buffer,
        safeToSave,
        shortfall
      };
    });

    // 6. Generate Recommendations
    const globalRecommendations: any[] = [];

    const shortfalls = accountDetails.filter(a => a.shortfall > 0);
    const surpluses = accountDetails.filter(a => a.safeToSave > 0);
    const savingsAccounts = accountDetails.filter(a => a.isSavings);

    shortfalls.forEach(acc => {
      const earliestBill = acc.upcomingBills.sort((a: any, b: any) => a.daysRemaining - b.daysRemaining)[0];
      const billMsg = earliestBill 
        ? `due in ${earliestBill.daysRemaining} days (${earliestBill.description})`
        : `due soon`;

      const source = surpluses.find(s => s.balance > acc.shortfall) || 
                     accountDetails.find(s => s.isSavings && s.balance > acc.shortfall) ||
                     surpluses[0] ||
                     accountDetails.find(s => s.isSavings && s.balance > 0);
      if (source) {
        globalRecommendations.push({
          type: 'warning',
          title: `Shortfall Risk: ${acc.name}`,
          message: `Warning: ${acc.name} has a projected shortfall of $${acc.shortfall} to cover upcoming bills and basic spending. Transfer $${acc.shortfall} from ${source.name} to avoid a bounced payment!`,
          action: {
            fromAccountId: source.id,
            toAccountId: acc.id,
            amount: acc.shortfall,
            type: 'topup'
          }
        });
      } else {
        globalRecommendations.push({
          type: 'warning',
          title: `Shortfall Risk: ${acc.name}`,
          message: `Warning: ${acc.name} has a projected shortfall of $${acc.shortfall} to cover upcoming bills ${billMsg}. Deposit cash or top up soon!`,
        });
      }
    });

    surpluses.forEach(acc => {
      const targetSavings = savingsAccounts[0];
      if (targetSavings) {
        globalRecommendations.push({
          type: 'success',
          title: `Safe to Save: ${acc.name}`,
          message: `You have $${acc.safeToSave} in excess cash sitting in ${acc.name} that won't be needed for bills or daily spending in the next 15 days. Move it to ${targetSavings.name}!`,
          action: {
            fromAccountId: acc.id,
            toAccountId: targetSavings.id,
            amount: acc.safeToSave,
            type: 'savings'
          }
        });
      } else {
        globalRecommendations.push({
          type: 'success',
          title: `Safe to Save: ${acc.name}`,
          message: `You have $${acc.safeToSave} in excess cash sitting in ${acc.name} that won't be needed for bills or daily spending in the next 15 days. Move it to a savings goal!`,
        });
      }
    });

    if (globalRecommendations.length === 0) {
      globalRecommendations.push({
        type: 'info',
        title: 'Perfect Cash Flow Balance',
        message: 'Your accounts are perfectly balanced. All checking accounts have enough cash to cover the next 15 days of upcoming bills and discretionary spending.'
      });
    }

    return {
      accounts: accountDetails,
      globalRecommendations
    };
  }

  async executeSavingsTransfer(
    userId: string,
    fromAccountId: string,
    toAccountId: string,
    amount: number,
    type: 'savings' | 'topup'
  ): Promise<any> {
    const fromAcc = await prisma.account.findFirst({ where: { id: fromAccountId, userId } });
    const toAcc = await prisma.account.findFirst({ where: { id: toAccountId, userId } });
    if (!fromAcc || !toAcc) throw new Error('Invalid accounts');

    const now = new Date().toISOString();
    const desc = type === 'savings' 
      ? `Smart Savings Allocation: ${fromAcc.name} ➔ ${toAcc.name}`
      : `Smart Balance Topup: ${fromAcc.name} ➔ ${toAcc.name}`;

    const txn = await prisma.transaction.create({
      data: {
        id: uuidv4(),
        userId,
        type: 'transfer',
        amount,
        description: desc,
        date: now.split('T')[0],
        accountId: fromAccountId,
        toAccountId: toAccountId,
        source: 'manual',
        createdAt: now,
        updatedAt: now
      }
    });

    return rowToTransaction(txn);
  }

  async allocateSavingsToGoal(
    userId: string,
    goalId: string,
    fromAccountId: string,
    amount: number
  ): Promise<any> {
    const goal = await prisma.goal.findFirst({ where: { id: goalId, userId } });
    if (!goal) throw new Error('Goal not found');

    const fromAcc = await prisma.account.findFirst({ where: { id: fromAccountId, userId } });
    if (!fromAcc) throw new Error('Source account not found');

    let toAccountId = goal.accountId;
    if (!toAccountId) {
      const allAccs = await this.getAccounts(userId);
      const savingsAcc = allAccs.find((a: any) => a.name.toLowerCase().includes('savings') || a.name.toLowerCase().includes('save') || a.isInvestment === 1);
      if (savingsAcc) {
        toAccountId = savingsAcc.id;
      } else {
        toAccountId = fromAccountId;
      }
    }

    const toAcc = await prisma.account.findFirst({ where: { id: toAccountId, userId } });
    if (!toAcc) throw new Error('Target savings account not found');

    const now = new Date().toISOString();

    const txn = await prisma.transaction.create({
      data: {
        id: uuidv4(),
        userId,
        type: 'transfer',
        amount,
        description: `Goal Allocation: ${goal.name}`,
        date: now.split('T')[0],
        accountId: fromAccountId,
        toAccountId,
        source: 'manual',
        createdAt: now,
        updatedAt: now
      }
    });

    const updatedGoal = await prisma.goal.update({
      where: { id: goalId },
      data: { currentAmount: goal.currentAmount + amount }
    });

    return {
      transaction: rowToTransaction(txn),
      goal: updatedGoal
    };
  }


  normalizeDescription(desc: string): string {
    if (!desc) return '';
    return desc
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[0-9]/g, '')
      .replace(/\b(at|in|on|to|from|for|of|with|by|the|an|a)\b/gi, '')
      .replace(/\b(purchase|txn|payment|charge|recurring|subscription|direct debit|dd)\b/gi, '')
      .replace(/(?:[^a-zA-Z\s]|^)(?:com|co|net|org|edu|gov|io|app)(?:\b|$)/gi, '')
      .replace(/[^a-z\s]/gi, '')
      .trim();
  }
}

// Singleton instance — shared across all API routes
export const dbService = new DbService();

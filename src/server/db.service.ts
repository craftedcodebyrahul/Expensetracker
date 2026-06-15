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
}
interface PrismaCategoryRow {
  id: string; userId: string; name: string; type: string;
  icon: string; color: string; budget: number | null; createdAt: string;
}
interface PrismaAccountRow {
  id: string; userId: string; name: string; type: string;
  initialBalance: number; createdAt: string;
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

export interface Account {
  id: string;
  name: string;
  type: 'asset' | 'liability';
  currency?: string;
  initialBalance?: number;
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
}

export interface AppSettings {
  currency: string;
  currencySymbol: string;
  dateFormat: string;
  theme: string;
  lastSync: string;
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
  };
}

/** Advance a YYYY-MM-DD date string by a frequency */
function advanceDateByFrequency(dateStr: string, frequency: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const originalDay = date.getDate();
  if (frequency === 'daily')   { date.setDate(date.getDate() + 1); }
  else if (frequency === 'weekly')  { date.setDate(date.getDate() + 7); }
  else if (frequency === 'monthly') {
    date.setMonth(date.getMonth() + 1);
    if (date.getDate() !== originalDay) date.setDate(0); // handle month-end
  }
  else if (frequency === 'yearly') { date.setFullYear(date.getFullYear() + 1); }
  return date.toISOString().split('T')[0];
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
    const updated = await prisma.transaction.update({
      where: { id },
      data: {
        ...(data.type        !== undefined && { type: data.type }),
        ...(data.amount      !== undefined && { amount: data.amount }),
        ...(data.category    !== undefined && { category: data.category }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.date        !== undefined && { date: data.date }),
        ...(data.tags        !== undefined && { tags: serializeTags(data.tags) }),
        ...(data.isRecurring !== undefined && { isRecurring: data.isRecurring ? 1 : 0 }),
        ...(data.recurringFrequency !== undefined && { recurringFrequency: data.recurringFrequency }),
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
    const rows = await prisma.account.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      type: r.type as Account['type'],
      currency: r.currency || 'USD',
      initialBalance: r.initialBalance,
      createdAt: r.createdAt,
    }));
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
        createdAt: now,
      },
    });
    return { ...row, type: row.type as Account['type'], currency: row.currency };
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
      },
    });
    return { ...updated, type: updated.type as Account['type'], currency: updated.currency };
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
    if (!row) {
      // Auto-create settings row if missing (should be seeded on first login)
      row = await prisma.settings.create({
        data: { userId, updatedAt: new Date().toISOString() },
      });
    }
    return {
      currency: row.currency,
      currencySymbol: row.currencySymbol,
      dateFormat: row.dateFormat,
      theme: row.theme,
      lastSync: new Date().toISOString(),
    };
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
        updatedAt: now,
      },
      create: { userId, updatedAt: now },
    });
    return {
      currency: row.currency,
      currencySymbol: row.currencySymbol,
      dateFormat: row.dateFormat,
      theme: row.theme,
      lastSync: now,
    };
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
    accountId?: string
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

    if (apiKey) {
      try {
        const prompt = `You are a professional financial auditor. Write a formal executive financial summary for the period (${startDate} to ${endDate}):\n\nMETRICS:\n- Income: $${income.toFixed(2)}\n- Expenses: $${expenses.toFixed(2)} (Fixed: $${fixedExpenses.toFixed(2)} [${fixedPct}%], Variable: $${variableExpenses.toFixed(2)} [${variablePct}%])\n- Net: $${net.toFixed(2)}\n- Savings Rate: ${savingsRate.toFixed(1)}%\n\nTOP CATEGORIES:\n${topCategoriesText || 'None'}\n\nReturn JSON: { "healthOverview": "...", "categoryAudit": "...", "runwayOutlook": "...", "recommendations": ["...","...","..."] }`;

        const response = await fetch(
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
    prevEndDate: string
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
    if (apiKey) {
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

        const response = await fetch(
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
            if (data.summary && Array.isArray(data.advice)) return data;
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
    };
  }

  // ── AI Chat Copilot ───────────────────────────────────────────────────────

  async getAiChatResponse(
    userId: string,
    chatHistory: Array<{ role: 'user' | 'model'; text: string }>
  ): Promise<{ response: string }> {
    const apiKey = process.env['GEMINI_API_KEY'];
    if (!apiKey) {
      return { response: 'AI Copilot is unavailable because the GEMINI_API_KEY is not configured on the server. Please add it to your environment file.' };
    }

    try {
      // 1. Gather live financial context
      const accounts = await this.getAccounts(userId);
      const budgets = await this.getBudgets(userId);
      const categories = await this.getCategories(userId);
      const recentTxns = await prisma.transaction.findMany({
        where: { userId },
        take: 20,
        orderBy: [
          { date: 'desc' },
          { createdAt: 'desc' }
        ],
      });

      const settings = await this.getSettings(userId);
      const currency = settings.currency || 'USD';

      // Format accounts context
      const accountsStr = accounts.map((a: any) => `- ${a.name}: $${(a.initialBalance ?? 0).toFixed(2)} (${a.type})`).join('\n');
      
      // Format budgets context
      const budgetsStr = budgets.map((b: any) => {
        return `- Category: ${b.categoryName || b.categoryId}, Limit $${b.amount.toFixed(2)}, Period: ${b.period}, Spent: $${b.spent.toFixed(2)}`;
      }).join('\n');

      // Format recent transactions context
      const txnsStr = recentTxns.map((t: any) => {
        const catName = categories.find(c => c.id === t.category)?.name ?? t.category;
        return `- ${t.date}: ${t.type === 'income' ? '+' : t.type === 'expense' ? '-' : ''}$${t.amount.toFixed(2)} | ${t.description} (${catName})`;
      }).join('\n');

      const systemInstruction = `You are TCFlow Copilot, an expert AI personal financial advisor integrated inside the TCFlow (FinTrack Pro) app.
Your tone is encouraging, professional, analytical, and friendly. Always format amounts in ${currency}.
Use markdown (bold, bullet lists) to make recommendations easy to scan. Be concise.

Below is the user's live financial data for context:

ACCOUNTS:
${accountsStr || 'No accounts created.'}

BUDGETS:
${budgetsStr || 'No budgets set.'}

RECENT TRANSACTIONS (Last 20):
${txnsStr || 'No recent transactions logged.'}

Guidelines:
1. Provide concrete suggestions. If spending is high in a category, give advice.
2. If asked about math (e.g. totals), calculate it accurately based on the transactions list.
3. Do not make up accounts or transactions not listed above. Refer strictly to this context.`;

      // Map history to Gemini API format
      const contents = chatHistory.map(msg => ({
        role: msg.role === 'model' ? 'model' : 'user',
        parts: [{ text: msg.text }]
      }));

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemInstruction }] },
            contents,
            generationConfig: { maxOutputTokens: 800 },
          }),
        }
      );

      if (response.ok) {
        const json = await response.json() as any;
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          return { response: text };
        }
      }
      throw new Error(`Gemini API returned status ${response.status}`);
    } catch (err: any) {
      console.error('Gemini Chat error:', err);
      return { response: `I encountered an error connecting to the AI service: ${err?.message || 'Unknown error'}. Please try again later.` };
    }
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
              generationConfig: { maxOutputTokens: 20 },
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

  // ── Smart Subscription/Bill Detector ───────────────────────────────────────

  async detectRecurringBills(userId: string): Promise<any[]> {
    const transactions = await prisma.transaction.findMany({
      where: { userId, type: { in: ['income', 'expense'] } },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });

    if (transactions.length < 2) return [];

    const existingSchedules = await this.getRecurringSchedules(userId);
    const existingNormalized = new Set(
      existingSchedules.map(s => this.normalizeDescription(s.description))
    );

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

    for (const [normDesc, txns] of Object.entries(groups)) {
      if (txns.length < 2) continue;
      if (existingNormalized.has(normDesc)) continue;

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

      if (!consistent) continue;

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

      if (!frequency) continue;

      const amounts = txns.map(t => t.amount);
      const minAmount = Math.min(...amounts);
      const maxAmount = Math.max(...amounts);
      const avgAmount = amounts.reduce((s, x) => s + x, 0) / amounts.length;

      const amtDiff = maxAmount - minAmount;
      const amtDiffPct = maxAmount > 0 ? (amtDiff / maxAmount) * 100 : 0;
      
      if (amtDiff > 5 && amtDiffPct > 12) continue;

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
      });
    }

    return suggestions;
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

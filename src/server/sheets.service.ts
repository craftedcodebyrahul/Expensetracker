import { google, sheets_v4 } from 'googleapis';
import type { Auth } from 'googleapis';
import { v4 as uuidv4 } from 'uuid';
import { parseLocalDate } from './date.utils.js';

// ── Caching Layer ───────────────────────────────────────────────────────────

interface CacheEntry {
  data: any;
  timestamp: number;
}

const globalCache = new Map<string, CacheEntry>();
const processingLocks = new Map<string, Promise<any>>();
const CACHE_TTL_MS = 60 * 1000; // 60-second TTL

function getCached<T>(spreadsheetId: string, key: string): T | null {
  const cacheKey = `${spreadsheetId}__${key}`;
  const entry = globalCache.get(cacheKey);
  if (entry && (Date.now() - entry.timestamp) < CACHE_TTL_MS) {
    return entry.data as T;
  }
  return null;
}

function setCached<T>(spreadsheetId: string, key: string, data: T): void {
  const cacheKey = `${spreadsheetId}__${key}`;
  globalCache.set(cacheKey, { data, timestamp: Date.now() });
}

function invalidateCache(spreadsheetId: string, key: string): void {
  const cacheKey = `${spreadsheetId}__${key}`;
  globalCache.delete(cacheKey);
}


// ── Types ─────────────────────────────────────────────────────────────────────

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
  recurringId?: string;    // UUID shared by all occurrences of the same recurring series
  paymentMethod?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  accountId: string;
  toAccountId?: string;
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
  initialBalance?: number;
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
  spent: number;
  remaining: number;
  percentage: number;
  createdAt: string;
}

export interface RecurringSchedule {
  id: string;
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  category: string;
  description: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  startDate: string; // YYYY-MM-DD
  nextDueDate: string; // YYYY-MM-DD
  accountId: string;
  toAccountId?: string;
  createdAt: string;
}

export interface AppSettings {
  currency: string;
  currencySymbol: string;
  dateFormat: string;
  theme: string;
  spreadsheetId: string;
  lastSync: string;
}

// ── Sheet names ───────────────────────────────────────────────────────────────

const SHEETS = {
  TRANSACTIONS: 'Transactions',
  CATEGORIES: 'Categories',
  BUDGETS: 'Budgets',
  SETTINGS: 'Settings',
  ACCOUNTS: 'Accounts',
  RECURRING: 'Recurring',
};

// ── Headers ───────────────────────────────────────────────────────────────────

const TRANSACTION_HEADERS = [
  'id', 'type', 'amount', 'category', 'description', 'date',
  'tags', 'isRecurring', 'recurringFrequency', 'recurringId', 'paymentMethod', 'notes',
  'createdAt', 'updatedAt', 'accountId', 'toAccountId'
];

const CATEGORY_HEADERS = ['id', 'name', 'type', 'icon', 'color', 'budget', 'createdAt'];
const BUDGET_HEADERS = ['id', 'categoryId', 'categoryName', 'amount', 'period', 'month', 'year', 'createdAt'];
const SETTINGS_HEADERS = ['key', 'value'];
const ACCOUNT_HEADERS = ['id', 'name', 'type', 'createdAt', 'initialBalance'];
const RECURRING_HEADERS = [
  'id', 'type', 'amount', 'category', 'description', 'frequency',
  'startDate', 'nextDueDate', 'accountId', 'toAccountId', 'createdAt'
];


// ── SheetsService ─────────────────────────────────────────────────────────────

export class SheetsService {
  private sheets: sheets_v4.Sheets;
  private spreadsheetId: string;

  /**
   * Accepts either:
   *  - an OAuth2 client (for per-user Google login flow)
   *  - a file path string (for legacy service-account mode)
   */
  constructor(authOrPath: Auth.OAuth2Client | string, spreadsheetId: string) {
    let auth: Auth.OAuth2Client | InstanceType<typeof google.auth.GoogleAuth>;
    if (typeof authOrPath === 'string') {
      auth = new google.auth.GoogleAuth({
        keyFile: authOrPath,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
    } else {
      auth = authOrPath;
    }
    this.sheets = google.sheets({ version: 'v4', auth: auth as any });
    this.spreadsheetId = spreadsheetId;
  }

  // ── Initialization ──────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    const meta = await this.sheets.spreadsheets.get({ spreadsheetId: this.spreadsheetId });
    const existingSheets = meta.data.sheets?.map(s => s.properties?.title) ?? [];

    const sheetsToCreate = Object.values(SHEETS).filter(s => !existingSheets.includes(s));

    if (sheetsToCreate.length > 0) {
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          requests: sheetsToCreate.map(title => ({
            addSheet: { properties: { title } }
          }))
        }
      });
    }

    // Ensure headers exist
    await this.ensureHeaders(SHEETS.TRANSACTIONS, TRANSACTION_HEADERS);
    await this.ensureHeaders(SHEETS.CATEGORIES, CATEGORY_HEADERS);
    await this.ensureHeaders(SHEETS.BUDGETS, BUDGET_HEADERS);
    await this.ensureHeaders(SHEETS.SETTINGS, SETTINGS_HEADERS);
    await this.ensureHeaders(SHEETS.ACCOUNTS, ACCOUNT_HEADERS);
    await this.ensureHeaders(SHEETS.RECURRING, RECURRING_HEADERS);

    // Seed default categories if the sheet is empty (new user)
    await this.seedDefaultCategories();
    // Seed default accounts if the sheet is empty (new user)
    await this.seedDefaultAccounts();
  }

  private async ensureHeaders(sheet: string, headers: string[]): Promise<void> {
    const range = `${sheet}!A1:${this.colLetter(headers.length)}1`;
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range,
    });
    if (!res.data.values || res.data.values.length === 0 || res.data.values[0].length < headers.length) {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range,
        valueInputOption: 'RAW',
        requestBody: { values: [headers] },
      });
    }
  }

  private async seedDefaultCategories(): Promise<void> {
    // Only seed if the Categories sheet has no data rows yet
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEETS.CATEGORIES}!A:G`,
    });
    const rows = res.data.values ?? [];
    if (rows.length > 1) return; // already has data

    const now = new Date().toISOString();
    const defaults: Array<[string, string, string, string, string, string, string]> = [
      // ── Expense categories ──────────────────────────────────────────────────
      ['food',          'Food & Dining',       'expense', '🍽️', '#FF6384', '', now],
      ['transport',     'Transportation',      'expense', '🚗', '#36A2EB', '', now],
      ['housing',       'Housing & Rent',      'expense', '🏠', '#FFCE56', '', now],
      ['utilities',     'Utilities',           'expense', '💡', '#4BC0C0', '', now],
      ['healthcare',    'Healthcare',          'expense', '🏥', '#9966FF', '', now],
      ['entertainment', 'Entertainment',       'expense', '🎬', '#FF9F40', '', now],
      ['shopping',      'Shopping',            'expense', '🛍️', '#FF6384', '', now],
      ['education',     'Education',           'expense', '📚', '#36A2EB', '', now],
      ['travel',        'Travel',              'expense', '✈️', '#4BC0C0', '', now],
      ['subscriptions', 'Subscriptions',       'expense', '📱', '#9966FF', '', now],
      ['insurance',     'Insurance',           'expense', '🛡️', '#FFCE56', '', now],
      ['groceries',     'Groceries',           'expense', '🛒', '#8BC34A', '', now],
      ['dining_out',    'Dining Out',          'expense', '🍕', '#FF5722', '', now],
      ['fitness',       'Fitness & Sports',    'expense', '🏋️', '#00BCD4', '', now],
      ['personal_care', 'Personal Care',       'expense', '💅', '#E91E63', '', now],
      ['pets',          'Pets',                'expense', '🐾', '#795548', '', now],
      ['gifts_given',   'Gifts Given',         'expense', '🎁', '#9C27B0', '', now],
      ['taxes',         'Taxes & Fees',        'expense', '🧾', '#607D8B', '', now],
      ['other_expense', 'Other Expenses',      'expense', '💸', '#C9CBCF', '', now],
      // ── Income categories ───────────────────────────────────────────────────
      ['salary',        'Salary',              'income',  '💼', '#4CAF50', '', now],
      ['freelance',     'Freelance',           'income',  '💻', '#8BC34A', '', now],
      ['investment',    'Investment Returns',  'income',  '📈', '#00BCD4', '', now],
      ['rental',        'Rental Income',       'income',  '🏘️', '#FF9800', '', now],
      ['business',      'Business Income',     'income',  '🏢', '#9C27B0', '', now],
      ['bonus',         'Bonus',               'income',  '🎯', '#F44336', '', now],
      ['gift_received', 'Gifts Received',      'income',  '🎁', '#E91E63', '', now],
      ['refund',        'Refunds',             'income',  '↩️', '#00BCD4', '', now],
      ['side_hustle',   'Side Hustle',         'income',  '⚡', '#FF9800', '', now],
      ['other_income',  'Other Income',        'income',  '💰', '#607D8B', '', now],
    ];

    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEETS.CATEGORIES}!A:G`,
      valueInputOption: 'RAW',
      requestBody: { values: defaults },
    });

    console.log(`✅ Seeded ${defaults.length} default categories`);
  }

  private async seedDefaultAccounts(): Promise<void> {
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEETS.ACCOUNTS}!A:E`,
    });
    const rows = res.data.values ?? [];
    if (rows.length > 1) return;

    const now = new Date().toISOString();
    const defaults = [
      ['chequing', 'Chequing Account', 'asset', now, 0],
      ['cash_overseas', 'Overseas Cash', 'asset', now, 0],
      ['credit_card', 'Credit Card', 'liability', now, 0],
      ['debt_line', 'Debt Line', 'liability', now, 0],
    ];

    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEETS.ACCOUNTS}!A:E`,
      valueInputOption: 'RAW',
      requestBody: { values: defaults },
    });

    console.log(`✅ Seeded ${defaults.length} default accounts`);
  }

  // ── Transactions ────────────────────────────────────────────────────────────

  async getTransactions(clientDateStr?: string): Promise<Transaction[]> {
    const lockKey = this.spreadsheetId;
    
    // Serialise concurrent reads to prevent race conditions during recurring processing
    while (processingLocks.has(lockKey)) {
      await processingLocks.get(lockKey);
    }
    
    let resolveLock: (() => void) | undefined;
    const lockPromise = new Promise<void>((resolve) => {
      resolveLock = resolve;
    });
    processingLocks.set(lockKey, lockPromise);
    
    try {
      const raw = await this.getRawTransactions();
      await this.processRecurringSchedules(raw, clientDateStr);
      return await this.getRawTransactions();
    } finally {
      processingLocks.delete(lockKey);
      if (resolveLock) resolveLock();
    }
  }

  private async getRawTransactions(): Promise<Transaction[]> {
    const cached = getCached<Transaction[]>(this.spreadsheetId, 'transactions');
    if (cached) return cached;

    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEETS.TRANSACTIONS}!A:P`,
    });
    const rows = res.data.values ?? [];
    if (rows.length <= 1) return [];
    const transactions = rows.slice(1).map(r => this.rowToTransaction(r)).filter(Boolean) as Transaction[];
    setCached(this.spreadsheetId, 'transactions', transactions);
    return transactions;
  }

  async getTransactionById(id: string): Promise<Transaction | null> {
    const all = await this.getRawTransactions();
    return all.find(t => t.id === id) ?? null;
  }

  async createTransaction(data: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>): Promise<Transaction> {
    const now = new Date().toISOString();
    const transaction: Transaction = {
      ...data,
      id: uuidv4(),
      // Auto-assign a recurringId when creating a new recurring transaction that doesn't have one yet
      recurringId: data.isRecurring ? (data.recurringId || uuidv4()) : undefined,
      createdAt: now,
      updatedAt: now,
    };
    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEETS.TRANSACTIONS}!A:P`,
      valueInputOption: 'RAW',
      requestBody: { values: [this.transactionToRow(transaction)] },
    });
    invalidateCache(this.spreadsheetId, 'transactions');
    return transaction;
  }

  async updateTransaction(id: string, data: Partial<Transaction>): Promise<Transaction | null> {
    const { rowIndex, transaction } = await this.findTransactionRow(id);
    if (!transaction || rowIndex < 0) return null;

    const updated: Transaction = { ...transaction, ...data, id, updatedAt: new Date().toISOString() };
    const range = `${SHEETS.TRANSACTIONS}!A${rowIndex + 1}:P${rowIndex + 1}`;
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: { values: [this.transactionToRow(updated)] },
    });
    invalidateCache(this.spreadsheetId, 'transactions');
    return updated;
  }

  async deleteTransaction(id: string): Promise<boolean> {
    const { rowIndex } = await this.findTransactionRow(id);
    if (rowIndex < 0) return false;
    await this.deleteRow(SHEETS.TRANSACTIONS, rowIndex);
    invalidateCache(this.spreadsheetId, 'transactions');
    return true;
  }

  async stopRecurringSeries(recurringId: string): Promise<boolean> {
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEETS.TRANSACTIONS}!A:P`,
    });
    const rows = res.data.values ?? [];
    if (rows.length <= 1) return false;
    const updatedRows = [...rows];
    let count = 0;
    for (let i = 1; i < rows.length; i++) {
      const t = this.rowToTransaction(rows[i]);
      if (t && t.recurringId === recurringId) {
        t.isRecurring = false;
        t.updatedAt = new Date().toISOString();
        updatedRows[i] = this.transactionToRow(t);
        count++;
      }
    }
    if (count > 0) {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${SHEETS.TRANSACTIONS}!A1:P${rows.length}`,
        valueInputOption: 'RAW',
        requestBody: { values: updatedRows },
      });
      invalidateCache(this.spreadsheetId, 'transactions');
      return true;
    }
    return false;
  }

  async deleteRecurringSeries(recurringId: string): Promise<boolean> {
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEETS.TRANSACTIONS}!A:P`,
    });
    const rows = res.data.values ?? [];
    if (rows.length <= 1) return false;
    const header = rows[0];
    const dataRows = rows.slice(1);
    const filteredDataRows = dataRows.filter(r => {
      const t = this.rowToTransaction(r);
      return !t || t.recurringId !== recurringId;
    });

    await this.sheets.spreadsheets.values.clear({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEETS.TRANSACTIONS}!A:P`,
    });
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEETS.TRANSACTIONS}!A1:P${filteredDataRows.length + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values: [header, ...filteredDataRows] },
    });
    invalidateCache(this.spreadsheetId, 'transactions');
    return true;
  }

  private async findTransactionRow(id: string): Promise<{ rowIndex: number; transaction: Transaction | null }> {
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEETS.TRANSACTIONS}!A:P`,
    });
    const rows = res.data.values ?? [];
    const idx = rows.findIndex((r, i) => i > 0 && r[0] === id);
    return { rowIndex: idx, transaction: idx >= 0 ? this.rowToTransaction(rows[idx]) : null };
  }

  private rowToTransaction(row: any[]): Transaction | null {
    if (!row || !row[0]) return null;
    return {
      id: row[0] ?? '',
      type: (row[1] as 'income' | 'expense' | 'transfer') ?? 'expense',
      amount: parseFloat(row[2]) || 0,
      category: row[3] ?? '',
      description: row[4] ?? '',
      date: row[5] ?? '',
      tags: row[6] ? row[6].split(',').filter(Boolean) : [],
      isRecurring: row[7] === 'true',
      recurringFrequency: row[8] || undefined,
      recurringId: row[9] || undefined,
      paymentMethod: row[10] || undefined,
      notes: row[11] || undefined,
      createdAt: row[12] ?? '',
      updatedAt: row[13] ?? '',
      accountId: row[14] ?? '',
      toAccountId: row[15] || undefined,
    };
  }

  private transactionToRow(t: Transaction): any[] {
    return [
      t.id, t.type, t.amount, t.category, t.description, t.date,
      t.tags.join(','), t.isRecurring.toString(), t.recurringFrequency ?? '',
      t.recurringId ?? '', t.paymentMethod ?? '', t.notes ?? '',
      t.createdAt, t.updatedAt,
      t.accountId ?? '', t.toAccountId ?? ''
    ];
  }

  // ── Accounts ──────────────────────────────────────────────────────────────

  async getAccounts(): Promise<Account[]> {
    const cached = getCached<Account[]>(this.spreadsheetId, 'accounts');
    if (cached) return cached;

    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEETS.ACCOUNTS}!A:E`,
    });
    const rows = res.data.values ?? [];
    if (rows.length <= 1) return [];
    const accounts = rows.slice(1).map(r => this.rowToAccount(r)).filter(Boolean) as Account[];
    setCached(this.spreadsheetId, 'accounts', accounts);
    return accounts;
  }

  private rowToAccount(row: any[]): Account | null {
    if (!row || !row[0]) return null;
    return {
      id: row[0],
      name: row[1],
      type: row[2] as 'asset' | 'liability',
      createdAt: row[3] ?? '',
      initialBalance: row[4] ? parseFloat(row[4]) : 0,
    };
  }

  private accountToRow(a: Account): any[] {
    return [a.id, a.name, a.type, a.createdAt ?? '', a.initialBalance ?? 0];
  }

  async createAccount(data: Omit<Account, 'id' | 'createdAt'>): Promise<Account> {
    const account: Account = { ...data, id: uuidv4(), createdAt: new Date().toISOString() };
    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEETS.ACCOUNTS}!A:E`,
      valueInputOption: 'RAW',
      requestBody: { values: [this.accountToRow(account)] },
    });
    invalidateCache(this.spreadsheetId, 'accounts');
    return account;
  }

  async updateAccount(id: string, data: Partial<Account>): Promise<Account | null> {
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEETS.ACCOUNTS}!A:E`,
    });
    const rows = res.data.values ?? [];
    const idx = rows.findIndex((r, i) => i > 0 && r[0] === id);
    if (idx < 0) return null;
    const existing = this.rowToAccount(rows[idx])!;
    const updated: Account = { ...existing, ...data, id };
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEETS.ACCOUNTS}!A${idx + 1}:E${idx + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values: [this.accountToRow(updated)] },
    });
    invalidateCache(this.spreadsheetId, 'accounts');
    return updated;
  }

  async deleteAccount(id: string): Promise<boolean> {
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEETS.ACCOUNTS}!A:E`,
    });
    const rows = res.data.values ?? [];
    const idx = rows.findIndex((r, i) => i > 0 && r[0] === id);
    if (idx < 0) return false;
    await this.deleteRow(SHEETS.ACCOUNTS, idx);
    invalidateCache(this.spreadsheetId, 'accounts');
    return true;
  }

  // ── Recurring Schedules ───────────────────────────────────────────────────

  async getRecurringSchedules(): Promise<RecurringSchedule[]> {
    const cached = getCached<RecurringSchedule[]>(this.spreadsheetId, 'recurringSchedules');
    if (cached) return cached;

    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEETS.RECURRING}!A:K`,
    });
    const rows = res.data.values ?? [];
    if (rows.length <= 1) return [];
    const schedules = rows.slice(1).map(r => this.rowToRecurringSchedule(r)).filter(Boolean) as RecurringSchedule[];
    setCached(this.spreadsheetId, 'recurringSchedules', schedules);
    return schedules;
  }

  private rowToRecurringSchedule(row: any[]): RecurringSchedule | null {
    if (!row || !row[0]) return null;
    return {
      id: row[0],
      type: row[1] as any,
      amount: parseFloat(row[2]) || 0,
      category: row[3] ?? '',
      description: row[4] ?? '',
      frequency: row[5] as any,
      startDate: row[6] ?? '',
      nextDueDate: row[7] ?? '',
      accountId: row[8] ?? '',
      toAccountId: row[9] || undefined,
      createdAt: row[10] ?? '',
    };
  }

  private recurringScheduleToRow(s: RecurringSchedule): any[] {
    return [
      s.id,
      s.type,
      s.amount,
      s.category,
      s.description,
      s.frequency,
      s.startDate,
      s.nextDueDate,
      s.accountId,
      s.toAccountId ?? '',
      s.createdAt
    ];
  }

  async createRecurringSchedule(data: Omit<RecurringSchedule, 'id' | 'createdAt'>): Promise<RecurringSchedule> {
    const schedule: RecurringSchedule = {
      ...data,
      id: uuidv4(),
      createdAt: new Date().toISOString()
    };
    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEETS.RECURRING}!A:K`,
      valueInputOption: 'RAW',
      requestBody: { values: [this.recurringScheduleToRow(schedule)] },
    });
    invalidateCache(this.spreadsheetId, 'recurringSchedules');
    return schedule;
  }

  async updateRecurringSchedule(id: string, data: Partial<RecurringSchedule>): Promise<RecurringSchedule | null> {
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEETS.RECURRING}!A:K`,
    });
    const rows = res.data.values ?? [];
    const idx = rows.findIndex((r, i) => i > 0 && r[0] === id);
    if (idx < 0) return null;
    const existing = this.rowToRecurringSchedule(rows[idx])!;
    const updated: RecurringSchedule = { ...existing, ...data, id };
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEETS.RECURRING}!A${idx + 1}:K${idx + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values: [this.recurringScheduleToRow(updated)] },
    });
    invalidateCache(this.spreadsheetId, 'recurringSchedules');
    return updated;
  }

  async deleteRecurringSchedule(id: string): Promise<boolean> {
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEETS.RECURRING}!A:K`,
    });
    const rows = res.data.values ?? [];
    const idx = rows.findIndex((r, i) => i > 0 && r[0] === id);
    if (idx < 0) return false;
    await this.deleteRow(SHEETS.RECURRING, idx);
    invalidateCache(this.spreadsheetId, 'recurringSchedules');
    return true;
  }

  advanceDateByFrequency(dateStr: string, frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'): string {
    const date = parseLocalDate(dateStr);
    if (frequency === 'daily') {
      date.setDate(date.getDate() + 1);
    } else if (frequency === 'weekly') {
      date.setDate(date.getDate() + 7);
    } else if (frequency === 'monthly') {
      const originalDay = date.getDate();
      date.setMonth(date.getMonth() + 1);
      if (date.getDate() !== originalDay) {
        date.setDate(0);
      }
    } else if (frequency === 'yearly') {
      date.setFullYear(date.getFullYear() + 1);
    }
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /**
   * Scans all existing recurring transactions (isRecurring=true with a recurringId)
   * and auto-generates missed occurrences up to today.
   * Uses the recurringId to group series and find the latest date per series.
   * Prevents duplicates by checking if an occurrence for that date already exists.
   */
  async processRecurringSchedules(existingTransactions: Transaction[], todayStr?: string): Promise<void> {
    const today = todayStr || new Date().toLocaleDateString('en-CA');

    // Only consider recurring transactions that have a recurringId
    const recurringTxns = existingTransactions.filter(t => t.isRecurring && t.recurringId && t.recurringFrequency);
    if (recurringTxns.length === 0) return;

    // Build a set of existing (recurringId + date) to prevent duplicates
    const existingKeys = new Set<string>();
    existingTransactions.forEach(t => {
      if (t.recurringId) existingKeys.add(`${t.recurringId}__${t.date}`);
    });

    // Group by recurringId → find the latest date per series
    const groups = new Map<string, Transaction>();
    recurringTxns.forEach(t => {
      const existing = groups.get(t.recurringId!);
      if (!existing || t.date > existing.date) {
        groups.set(t.recurringId!, t);
      }
    });

    const newRows: any[][] = [];

    for (const [recurringId, latestTxn] of groups.entries()) {
      let nextDate = this.advanceDateByFrequency(latestTxn.date, latestTxn.recurringFrequency! as any);

      while (nextDate <= today) {
        const key = `${recurringId}__${nextDate}`;
        if (!existingKeys.has(key)) {
          // Generate new occurrence
          const now = new Date().toISOString();
          const newTxn: Transaction = {
            ...latestTxn,
            id: uuidv4(),
            date: nextDate,
            createdAt: now,
            updatedAt: now,
          };
          newRows.push(this.transactionToRow(newTxn));
          existingKeys.add(key); // prevent duplicate within this same run
        }
        nextDate = this.advanceDateByFrequency(nextDate, latestTxn.recurringFrequency! as any);
      }
    }

    if (newRows.length > 0) {
      console.log(`[Recurring] Auto-posting ${newRows.length} recurring transaction(s)`);
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${SHEETS.TRANSACTIONS}!A:P`,
        valueInputOption: 'RAW',
        requestBody: { values: newRows },
      });
      invalidateCache(this.spreadsheetId, 'transactions');
    }
  }

  // ── Categories ──────────────────────────────────────────────────────────────

  async getCategories(): Promise<Category[]> {
    const cached = getCached<Category[]>(this.spreadsheetId, 'categories');
    if (cached) return cached;

    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEETS.CATEGORIES}!A:G`,
    });
    const rows = res.data.values ?? [];
    if (rows.length <= 1) return [];
    const categories = rows.slice(1).map(r => this.rowToCategory(r)).filter(Boolean) as Category[];
    setCached(this.spreadsheetId, 'categories', categories);
    return categories;
  }

  async createCategory(data: Omit<Category, 'id' | 'createdAt'>): Promise<Category> {
    const category: Category = { ...data, id: uuidv4(), createdAt: new Date().toISOString() };
    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEETS.CATEGORIES}!A:G`,
      valueInputOption: 'RAW',
      requestBody: { values: [this.categoryToRow(category)] },
    });
    invalidateCache(this.spreadsheetId, 'categories');
    return category;
  }

  async updateCategory(id: string, data: Partial<Category>): Promise<Category | null> {
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEETS.CATEGORIES}!A:G`,
    });
    const rows = res.data.values ?? [];
    const idx = rows.findIndex((r, i) => i > 0 && r[0] === id);
    if (idx < 0) return null;
    const existing = this.rowToCategory(rows[idx])!;
    const updated: Category = { ...existing, ...data, id };
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEETS.CATEGORIES}!A${idx + 1}:G${idx + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values: [this.categoryToRow(updated)] },
    });
    invalidateCache(this.spreadsheetId, 'categories');
    return updated;
  }

  async deleteCategory(id: string): Promise<boolean> {
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEETS.CATEGORIES}!A:G`,
    });
    const rows = res.data.values ?? [];
    const idx = rows.findIndex((r, i) => i > 0 && r[0] === id);
    if (idx < 0) return false;
    await this.deleteRow(SHEETS.CATEGORIES, idx);
    invalidateCache(this.spreadsheetId, 'categories');
    return true;
  }

  private rowToCategory(row: any[]): Category | null {
    if (!row || !row[0]) return null;
    return {
      id: row[0], name: row[1], type: row[2] as any,
      icon: row[3], color: row[4],
      budget: row[5] ? parseFloat(row[5]) : undefined,
      createdAt: row[6] ?? '',
    };
  }

  private categoryToRow(c: Category): any[] {
    return [c.id, c.name, c.type, c.icon, c.color, c.budget ?? '', c.createdAt];
  }

  // ── Budgets ─────────────────────────────────────────────────────────────────

  async getRawBudgets(): Promise<Budget[]> {
    const cached = getCached<Budget[]>(this.spreadsheetId, 'budgets');
    if (cached) return cached;

    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEETS.BUDGETS}!A:H`,
    });
    const rows = res.data.values ?? [];
    if (rows.length <= 1) return [];
    const budgets = rows.slice(1).map(r => this.rowToBudget(r)).filter(Boolean) as Budget[];
    setCached(this.spreadsheetId, 'budgets', budgets);
    return budgets;
  }

  async getBudgets(year?: number, month?: number): Promise<Budget[]> {
    const transactions = await this.getTransactions();
    const rawBudgets = await this.getRawBudgets();
    if (rawBudgets.length === 0) return [];

    return rawBudgets
      .filter((b): b is Budget => {
        // Year must match
        if (year && b!.year !== year) return false;
        // Monthly budget: only show for its specific month
        if (b!.month !== undefined && month && b!.month !== month) return false;
        // Yearly budget (no month set): show for every month of that year
        // i.e. don't filter it out when a specific month is requested
        return true;
      })
      .map(b => {
        // For yearly budgets shown in a specific month view, compute spent
        // only for that month so the progress bar is meaningful
        const filterYear  = year  ?? b!.year;
        const filterMonth = b!.month ?? month ?? (new Date().getMonth() + 1); // use budget's own month, or the requested month, or current month

        const todayStr = new Date().toLocaleDateString('en-CA');
        const spent = transactions
          .filter(t => {
            if (t.type !== 'expense' || t.category !== b!.categoryId) return false;
            if (t.date > todayStr) return false;
            const d = parseLocalDate(t.date);
            if (d.getFullYear() !== filterYear) return false;
            // Enforce monthly filtering for all budgets
            const targetMonth = b!.month !== undefined ? b!.month : filterMonth;
            if (d.getMonth() + 1 !== targetMonth) return false;
            return true;
          })
          .reduce((s, t) => s + t.amount, 0);

        const remaining  = b!.amount - spent;
        const percentage = b!.amount > 0 ? Math.round((spent / b!.amount) * 100) : 0;
        return { ...b!, spent, remaining, percentage };
      });
  }

  async createBudget(data: Omit<Budget, 'id' | 'spent' | 'remaining' | 'percentage' | 'createdAt'>): Promise<Budget> {
    const budget: Budget = {
      ...data, id: uuidv4(), spent: 0, remaining: data.amount, percentage: 0,
      createdAt: new Date().toISOString()
    };
    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEETS.BUDGETS}!A:H`,
      valueInputOption: 'RAW',
      requestBody: { values: [this.budgetToRow(budget)] },
    });
    invalidateCache(this.spreadsheetId, 'budgets');
    return budget;
  }

  async updateBudget(id: string, data: Partial<Budget>): Promise<Budget | null> {
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEETS.BUDGETS}!A:H`,
    });
    const rows = res.data.values ?? [];
    const idx = rows.findIndex((r, i) => i > 0 && r[0] === id);
    if (idx < 0) return null;
    const existing = this.rowToBudget(rows[idx])!;
    const updated: Budget = { ...existing, ...data, id };
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEETS.BUDGETS}!A${idx + 1}:H${idx + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values: [this.budgetToRow(updated)] },
    });
    invalidateCache(this.spreadsheetId, 'budgets');
    return updated;
  }

  async deleteBudget(id: string): Promise<boolean> {
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEETS.BUDGETS}!A:H`,
    });
    const rows = res.data.values ?? [];
    const idx = rows.findIndex((r, i) => i > 0 && r[0] === id);
    if (idx < 0) return false;
    await this.deleteRow(SHEETS.BUDGETS, idx);
    invalidateCache(this.spreadsheetId, 'budgets');
    return true;
  }

  private rowToBudget(row: any[]): Budget | null {
    if (!row || !row[0]) return null;
    return {
      id: row[0], categoryId: row[1], categoryName: row[2],
      amount: parseFloat(row[3]) || 0,
      period: row[4] as 'monthly' | 'yearly',
      month: row[5] ? parseInt(row[5]) : undefined,
      year: parseInt(row[6]) || new Date().getFullYear(),
      spent: 0, remaining: 0, percentage: 0,
      createdAt: row[7] ?? '',
    };
  }

  private budgetToRow(b: Budget): any[] {
    return [b.id, b.categoryId, b.categoryName, b.amount, b.period, b.month ?? '', b.year, b.createdAt];
  }

  // ── Settings ────────────────────────────────────────────────────────────────

  async getSettings(): Promise<AppSettings> {
    const cached = getCached<AppSettings>(this.spreadsheetId, 'settings');
    if (cached) return cached;

    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEETS.SETTINGS}!A:B`,
    });
    const rows = res.data.values ?? [];
    const map: Record<string, string> = {};
    rows.slice(1).forEach(r => { if (r[0]) map[r[0]] = r[1] ?? ''; });
    const settings = {
      currency: map['currency'] ?? 'USD',
      currencySymbol: map['currencySymbol'] ?? '$',
      dateFormat: map['dateFormat'] ?? 'MM/dd/yyyy',
      theme: map['theme'] ?? 'dark',
      spreadsheetId: this.spreadsheetId,
      lastSync: new Date().toISOString(),
    };
    setCached(this.spreadsheetId, 'settings', settings);
    return settings;
  }

  async updateSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
    const current = await this.getSettings();
    const merged = { ...current, ...settings };
    const rows = Object.entries(merged).map(([k, v]) => [k, v]);
    await this.sheets.spreadsheets.values.clear({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEETS.SETTINGS}!A:B`,
    });
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEETS.SETTINGS}!A1:B${rows.length + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values: [SETTINGS_HEADERS, ...rows] },
    });
    invalidateCache(this.spreadsheetId, 'settings');
    return merged;
  }

  // ── Reports ─────────────────────────────────────────────────────────────────

  async getMonthlyReport(year: number, month: number, accountId?: string) {
    const transactions = await this.getTransactions();
    const todayStr = new Date().toLocaleDateString('en-CA');
    const filtered = transactions.filter(t => {
      if (t.date > todayStr) return false;
      const d = parseLocalDate(t.date);
      const matchesDate = d.getFullYear() === year && d.getMonth() + 1 === month;
      const matchesAccount = !accountId || accountId === 'all' || t.accountId === accountId || t.toAccountId === accountId;
      return matchesDate && matchesAccount;
    });
    return this.buildReport(filtered);
  }

  async getYearlyReport(year: number, accountId?: string) {
    const transactions = await this.getTransactions();
    const todayStr = new Date().toLocaleDateString('en-CA');
    const filtered = transactions.filter(t => {
      if (t.date > todayStr) return false;
      const matchesDate = parseLocalDate(t.date).getFullYear() === year;
      const matchesAccount = !accountId || accountId === 'all' || t.accountId === accountId || t.toAccountId === accountId;
      return matchesDate && matchesAccount;
    });

    const monthlyData = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const monthTxns = filtered.filter(t => parseLocalDate(t.date).getMonth() + 1 === m);
      const income = monthTxns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
      const expenses = monthTxns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
      return { month: m, income, expenses, net: income - expenses };
    });

    return { ...this.buildReport(filtered), monthlyBreakdown: monthlyData };
  }

  async getExecutiveReport(
    startDate: string,
    endDate: string,
    accountId?: string
  ): Promise<{
    healthOverview: string;
    categoryAudit: string;
    recommendations: string[];
    runwayOutlook: string;
    isAiGenerated: boolean;
  }> {
    const transactions = await this.getTransactions();
    const categories = await this.getCategories();
    const todayStr = new Date().toLocaleDateString('en-CA');

    const filtered = transactions.filter(t => {
      if (t.date > todayStr) return false;
      const matchesDate = t.date >= startDate && t.date <= endDate;
      const matchesAccount = !accountId || accountId === 'all' || t.accountId === accountId || t.toAccountId === accountId;
      return matchesDate && matchesAccount;
    });

    const income = filtered.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const expenses = filtered.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const net = income - expenses;
    const savingsRate = income > 0 ? (net / income) * 100 : (expenses > 0 ? -100 : 0);

    const fixedExpenses = filtered.filter(t => t.type === 'expense' && t.isRecurring).reduce((sum, t) => sum + t.amount, 0);
    const variableExpenses = expenses - fixedExpenses;
    const fixedPct = expenses > 0 ? Math.round((fixedExpenses / expenses) * 100) : 0;
    const variablePct = expenses > 0 ? Math.round((variableExpenses / expenses) * 100) : 0;

    const byCategory: Record<string, number> = {};
    filtered.filter(t => t.type === 'expense').forEach(t => {
      byCategory[t.category] = (byCategory[t.category] || 0) + t.amount;
    });

    const topCategoriesText = Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, amt]) => {
        const catName = categories.find(c => c.id === id)?.name ?? id;
        return `- ${catName}: $${amt.toFixed(2)}`;
      })
      .join('\n');

    const apiKey = process.env['GEMINI_API_KEY'];

    if (apiKey) {
      try {
        const prompt = `You are a professional financial auditor. Write a formal, structured executive financial summary for a client's report period (${startDate} to ${endDate}):

METRICS SUMMARY:
- Total Income: $${income.toFixed(2)}
- Total Expenses: $${expenses.toFixed(2)} (Fixed/Recurring: $${fixedExpenses.toFixed(2)} [${fixedPct}%], Discretionary/Variable: $${variableExpenses.toFixed(2)} [${variablePct}%])
- Net Cashflow: $${net.toFixed(2)}
- Savings Rate: ${savingsRate.toFixed(1)}%
${accountId && accountId !== 'all' ? `- Filtered to Account: ${accountId}` : ''}

TOP CATEGORIES:
${topCategoriesText || 'None'}

Please conduct a formal audit and return a JSON object with:
1. "healthOverview": A professional 3-4 sentence evaluation of their cashflow health, evaluating whether they are living within their means, savings safety, and net flow.
2. "categoryAudit": A 2-3 sentence analysis of their expense allocations, specifically addressing the balance between Fixed commitments vs Discretionary spending, and highlighting the highest categories.
3. "runwayOutlook": A 2-3 sentence runway and buffer assessment. If net savings are positive, describe how many months of typical expenses this period's savings can cover. If in deficit, warn about runway drain.
4. "recommendations": An array of exactly 3 specific, high-value, actionable financial advisory actions the client should take to improve their cashflow in the next period.
`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' }
          })
        });

        if (response.ok) {
          const json = await response.json() as any;
          const responseText = json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (responseText) {
            const data = JSON.parse(responseText);
            if (data.healthOverview && data.categoryAudit && Array.isArray(data.recommendations) && data.runwayOutlook) {
              return { ...data, isAiGenerated: true };
            }
          }
        }
      } catch (err) {
        console.error('Failed to generate AI executive report:', err);
      }
    }

    // Heuristic fallback
    const recommendations = [
      `Review your top categories (${Object.keys(byCategory).slice(0, 2).map(id => categories.find(c => c.id === id)?.name ?? id).join(', ') || 'expenses'}) to identify discretionary items you can reduce.`,
      savingsRate >= 20 
        ? `Maintain your current savings rate of ${savingsRate.toFixed(0)}% by keeping investments consistent.`
        : savingsRate >= 0
          ? `Aim to increase your savings rate from ${savingsRate.toFixed(0)}% towards the recommended 20% by cutting variable expenses.`
          : `Prioritize balancing your budget. Stop discretionary spending immediately to reverse the negative savings rate of ${savingsRate.toFixed(0)}%.`,
      fixedPct > 50
        ? `Your fixed commitments represent ${fixedPct}% of expenses. Try renegotiating recurring contracts or subscriptions to free up cash.`
        : `Your fixed spending is low (${fixedPct}%). You have high discretionary spending (${variablePct}%). Consider setting weekly cash spending limits.`
    ];

    const healthOverview = net >= 0
      ? `The cashflow audit for the selected period shows a positive net cashflow of $${net.toFixed(2)} with a savings rate of ${savingsRate.toFixed(1)}%. The client is successfully maintaining cash inflows above outflows, which supports wealth building and capital reserves.`
      : `The cashflow audit reveals a deficit of $${Math.abs(net).toFixed(2)} for the period. Spending exceeded inflows by ${Math.abs(savingsRate).toFixed(1)}%, indicating that the client is relying on savings or debt lines to fund their spending. Structural expense reductions are advised.`;

    const categoryAudit = expenses > 0
      ? `Total expenses equaled $${expenses.toFixed(2)}, consisting of $${fixedExpenses.toFixed(2)} in fixed commitments (${fixedPct}%) and $${variableExpenses.toFixed(2)} in variable discretionary transactions (${variablePct}%). The top categories causing capital outflow were led by:\n${topCategoriesText || 'None'}.`
      : `No expense transactions were recorded during this period, resulting in a 100% savings allocation.`;

    const runwayOutlook = net > 0 && expenses > 0
      ? `With monthly expenses averaging $${(expenses / (Math.max(filtered.length, 1) / 30)).toFixed(2)} and a net surplus of $${net.toFixed(2)}, this period's savings alone establish a runway buffer of ${(net / expenses).toFixed(1)} months of emergency spending coverage.`
      : `Due to the net cashflow deficit, there is no savings runway generated this period. Continuing at this rate will progressively deplete existing capital reserves.`;

    return {
      healthOverview,
      categoryAudit,
      recommendations,
      runwayOutlook,
      isAiGenerated: false
    };
  }

  async getCategoryBreakdown(dateFrom: string, dateTo: string) {
    const transactions = await this.getTransactions();
    const filtered = transactions.filter(t => t.type !== 'transfer' && t.date >= dateFrom && t.date <= dateTo);
    const breakdown: Record<string, { income: number; expense: number; count: number }> = {};
    filtered.forEach(t => {
      if (!breakdown[t.category]) breakdown[t.category] = { income: 0, expense: 0, count: 0 };
      if (t.type === 'income' || t.type === 'expense') {
        breakdown[t.category][t.type] += t.amount;
      }
      breakdown[t.category].count++;
    });
    return Object.entries(breakdown).map(([category, data]) => ({ category, ...data }));
  }

  async getAiAdviceForPeriod(
    startDate: string,
    endDate: string,
    prevStartDate: string,
    prevEndDate: string
  ): Promise<{ summary: string; advice: Array<{ icon: string; title: string; text: string; type: 'good' | 'warn' | 'info' | 'bad' }> }> {
    const transactions = await this.getTransactions();
    const categories = await this.getCategories();

    // Helper to sum and group transactions
    const getPeriodStats = (start: string, end: string) => {
      const txns = transactions.filter(t => t.date >= start && t.date <= end);
      const income = txns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
      const expenses = txns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
      const net = income - expenses;
      const savingsRate = income > 0 ? (net / income) * 100 : (expenses > 0 ? -100 : 0);
      
      const byCategory: Record<string, number> = {};
      txns.filter(t => t.type === 'expense').forEach(t => {
        byCategory[t.category] = (byCategory[t.category] || 0) + t.amount;
      });

      return { income, expenses, net, savingsRate, byCategory, txns };
    };

    const curr = getPeriodStats(startDate, endDate);
    const prev = getPeriodStats(prevStartDate, prevEndDate);

    const apiKey = process.env['GEMINI_API_KEY'];

    if (apiKey) {
      try {
        // Build category summary
        const topCategoriesText = Object.entries(curr.byCategory)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([id, amt]) => {
            const catName = categories.find(c => c.id === id)?.name ?? id;
            return `- ${catName}: $${amt.toFixed(2)}`;
          })
          .join('\n');

        const categoryChangesText = Object.entries(curr.byCategory)
          .map(([id, currAmt]) => {
            const prevAmt = prev.byCategory[id] ?? 0;
            const catName = categories.find(c => c.id === id)?.name ?? id;
            if (prevAmt === 0) return `- ${catName}: $${currAmt.toFixed(2)} (New spending)`;
            const diffPct = ((currAmt - prevAmt) / prevAmt) * 100;
            return `- ${catName}: ${diffPct >= 0 ? '+' : ''}${diffPct.toFixed(0)}% (from $${prevAmt.toFixed(2)} to $${currAmt.toFixed(2)})`;
          })
          .join('\n');

        const prompt = `You are a personal financial advisor. Analyze the user's transaction metrics for the selected period compared to the previous period of identical length:

SELECTED PERIOD (${startDate} to ${endDate}):
- Total Income: $${curr.income.toFixed(2)}
- Total Expenses: $${curr.expenses.toFixed(2)}
- Net Cashflow: $${curr.net.toFixed(2)}
- Savings Rate: ${curr.savingsRate.toFixed(1)}%

PREVIOUS PERIOD (${prevStartDate} to ${prevEndDate}):
- Total Income: $${prev.income.toFixed(2)}
- Total Expenses: $${prev.expenses.toFixed(2)}
- Net Cashflow: $${prev.net.toFixed(2)}
- Savings Rate: ${prev.savingsRate.toFixed(1)}%

TOP EXPENSE CATEGORIES THIS PERIOD:
${topCategoriesText || 'None'}

CATEGORY SPENDING CHANGES (Period-over-Period):
${categoryChangesText || 'None'}

Analyze this data and return a JSON object with:
1. "summary": A short 2-3 sentence paragraph summarizing their financial situation, noting important wins or risks (e.g. if spending decreased or if they are in deficit).
2. "advice": An array of 3 to 5 actionable advice objects:
   - "icon": A single emoji matching the topic.
   - "title": A short 2-4 word bold header.
   - "text": 1-2 sentences of specific advice (e.g., "Dining out has increased by 40%. Try limiting restaurant visits to save money.").
   - "type": "good" | "warn" | "info" | "bad".
`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' }
          })
        });

        if (response.ok) {
          const json = await response.json() as any;
          const responseText = json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (responseText) {
            const data = JSON.parse(responseText);
            if (data.summary && Array.isArray(data.advice)) {
              return data;
            }
          }
        }
      } catch (err) {
        console.error('Failed to query Gemini API:', err);
      }
    }

    // Heuristic Fallback Advisor
    const adviceList: Array<{ icon: string; title: string; text: string; type: 'good' | 'warn' | 'info' | 'bad' }> = [];

    // 1. Savings Rate Advice
    if (curr.savingsRate >= 20) {
      adviceList.push({
        icon: '🌟',
        title: 'Excellent Savings Rate',
        text: `Your savings rate is ${curr.savingsRate.toFixed(1)}% this period, exceeding the benchmark of 20%. Great job building wealth!`,
        type: 'good'
      });
    } else if (curr.savingsRate >= 0) {
      adviceList.push({
        icon: '💡',
        title: 'Increase Your Savings',
        text: `You saved ${curr.savingsRate.toFixed(1)}% of your income. Trimming minor expenses in top categories can push you towards the 20% target.`,
        type: 'info'
      });
    } else {
      adviceList.push({
        icon: '⚠️',
        title: 'Spending Deficit',
        text: `You spent $${Math.abs(curr.net).toFixed(2)} more than your income. Review your expenses and set budget limits to stop the cash drain.`,
        type: 'bad'
      });
    }

    // 2. Spending Trend Advice
    if (curr.expenses > prev.expenses && prev.expenses > 0) {
      const pct = ((curr.expenses - prev.expenses) / prev.expenses) * 100;
      adviceList.push({
        icon: '📈',
        title: 'Expenses Increased',
        text: `Your spending rose by ${pct.toFixed(0)}% compared to the previous period. Check category breakdowns for spikes.`,
        type: 'warn'
      });
    } else if (curr.expenses < prev.expenses && prev.expenses > 0) {
      const pct = ((prev.expenses - curr.expenses) / prev.expenses) * 100;
      adviceList.push({
        icon: '✂️',
        title: 'Spending Decreased',
        text: `Nice work! You reduced your total expenses by ${pct.toFixed(0)}% compared to the previous period.`,
        type: 'good'
      });
    }

    // 3. Category Spikes
    let spikeFound = false;
    for (const [id, currAmt] of Object.entries(curr.byCategory)) {
      const prevAmt = prev.byCategory[id] ?? 0;
      if (currAmt > 50 && prevAmt > 0) {
        const diffPct = ((currAmt - prevAmt) / prevAmt) * 100;
        if (diffPct > 20) {
          const catName = categories.find(c => c.id === id)?.name ?? id;
          adviceList.push({
            icon: '🔍',
            title: `${catName} Spike`,
            text: `Spending on ${catName} jumped by ${diffPct.toFixed(0)}% (from $${prevAmt.toFixed(2)} to $${currAmt.toFixed(2)}).`,
            type: 'warn'
          });
          spikeFound = true;
          break; // just show one category spike to keep list clean
        }
      }
    }

    // 4. Budget/Runway Heuristics
    if (curr.net > 0 && curr.expenses > 0) {
      const runway = curr.net / curr.expenses;
      if (runway >= 6) {
        adviceList.push({
          icon: '🛡️',
          title: 'Strong Runway Buffer',
          text: `The net savings from this period alone can cover ${runway.toFixed(1)} months of average expenses.`,
          type: 'good'
        });
      }
    }

    const summary = curr.net >= 0
      ? `Your cashflow is positive with a net surplus of $${curr.net.toFixed(2)}. Your savings rate was ${curr.savingsRate.toFixed(1)}%.`
      : `You had a cashflow deficit of $${Math.abs(curr.net).toFixed(2)} this period. Expenses exceeded your income by ${Math.abs(curr.savingsRate).toFixed(1)}%.`;

    return {
      summary,
      advice: adviceList.slice(0, 4)
    };
  }

  private buildReport(transactions: Transaction[]) {
    const income   = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const categoryBreakdown: Record<string, number> = {};
    transactions.forEach(t => {
      if (t.type === 'expense') {
        categoryBreakdown[t.category] = (categoryBreakdown[t.category] || 0) + t.amount;
      }
    });

    // Savings rate: capped at -100% when spending exceeds income
    // Formula: (income - expenses) / income * 100
    // Edge cases: no income → -100% if expenses exist, 0% if no activity
    let savingsRate = 0;
    if (income > 0) {
      savingsRate = ((income - expenses) / income) * 100;
      savingsRate = Math.max(savingsRate, -100); // floor at -100%
    } else if (expenses > 0) {
      savingsRate = -100; // spending with zero income
    }

    return {
      totalIncome: income,
      totalExpenses: expenses,
      netBalance: income - expenses,
      transactionCount: transactions.length,
      categoryBreakdown,
      savingsRate: Math.round(savingsRate * 10) / 10, // 1 decimal place
    };
  }

  // ── Utilities ───────────────────────────────────────────────────────────────

  private async deleteRow(sheetName: string, rowIndex: number): Promise<void> {
    const meta = await this.sheets.spreadsheets.get({ spreadsheetId: this.spreadsheetId });
    const sheet = meta.data.sheets?.find(s => s.properties?.title === sheetName);
    if (!sheet?.properties?.sheetId) return;

    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId: sheet.properties.sheetId,
              dimension: 'ROWS',
              startIndex: rowIndex,
              endIndex: rowIndex + 1,
            }
          }
        }]
      }
    });
  }

  private colLetter(n: number): string {
    let result = '';
    while (n > 0) {
      const rem = (n - 1) % 26;
      result = String.fromCharCode(65 + rem) + result;
      n = Math.floor((n - 1) / 26);
    }
    return result;
  }
}

import { google, sheets_v4 } from 'googleapis';
import type { Auth } from 'googleapis';
import { v4 as uuidv4 } from 'uuid';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Transaction {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  category: string;
  description: string;
  date: string;
  tags: string[];
  isRecurring: boolean;
  recurringFrequency?: string;
  paymentMethod?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
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
};

// ── Headers ───────────────────────────────────────────────────────────────────

const TRANSACTION_HEADERS = [
  'id', 'type', 'amount', 'category', 'description', 'date',
  'tags', 'isRecurring', 'recurringFrequency', 'paymentMethod', 'notes',
  'createdAt', 'updatedAt'
];

const CATEGORY_HEADERS = ['id', 'name', 'type', 'icon', 'color', 'budget', 'createdAt'];
const BUDGET_HEADERS = ['id', 'categoryId', 'categoryName', 'amount', 'period', 'month', 'year', 'createdAt'];
const SETTINGS_HEADERS = ['key', 'value'];

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
  }

  private async ensureHeaders(sheet: string, headers: string[]): Promise<void> {
    const range = `${sheet}!A1:${this.colLetter(headers.length)}1`;
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range,
    });
    if (!res.data.values || res.data.values.length === 0) {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range,
        valueInputOption: 'RAW',
        requestBody: { values: [headers] },
      });
    }
  }

  // ── Transactions ────────────────────────────────────────────────────────────

  async getTransactions(): Promise<Transaction[]> {
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEETS.TRANSACTIONS}!A:M`,
    });
    const rows = res.data.values ?? [];
    if (rows.length <= 1) return [];
    return rows.slice(1).map(r => this.rowToTransaction(r)).filter(Boolean) as Transaction[];
  }

  async getTransactionById(id: string): Promise<Transaction | null> {
    const all = await this.getTransactions();
    return all.find(t => t.id === id) ?? null;
  }

  async createTransaction(data: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>): Promise<Transaction> {
    const now = new Date().toISOString();
    const transaction: Transaction = {
      ...data,
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
    };
    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEETS.TRANSACTIONS}!A:M`,
      valueInputOption: 'RAW',
      requestBody: { values: [this.transactionToRow(transaction)] },
    });
    return transaction;
  }

  async updateTransaction(id: string, data: Partial<Transaction>): Promise<Transaction | null> {
    const { rowIndex, transaction } = await this.findTransactionRow(id);
    if (!transaction || rowIndex < 0) return null;

    const updated: Transaction = { ...transaction, ...data, id, updatedAt: new Date().toISOString() };
    const range = `${SHEETS.TRANSACTIONS}!A${rowIndex + 1}:M${rowIndex + 1}`;
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: { values: [this.transactionToRow(updated)] },
    });
    return updated;
  }

  async deleteTransaction(id: string): Promise<boolean> {
    const { rowIndex } = await this.findTransactionRow(id);
    if (rowIndex < 0) return false;
    await this.deleteRow(SHEETS.TRANSACTIONS, rowIndex);
    return true;
  }

  private async findTransactionRow(id: string): Promise<{ rowIndex: number; transaction: Transaction | null }> {
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEETS.TRANSACTIONS}!A:M`,
    });
    const rows = res.data.values ?? [];
    const idx = rows.findIndex((r, i) => i > 0 && r[0] === id);
    return { rowIndex: idx, transaction: idx >= 0 ? this.rowToTransaction(rows[idx]) : null };
  }

  private rowToTransaction(row: any[]): Transaction | null {
    if (!row || !row[0]) return null;
    return {
      id: row[0] ?? '',
      type: (row[1] as 'income' | 'expense') ?? 'expense',
      amount: parseFloat(row[2]) || 0,
      category: row[3] ?? '',
      description: row[4] ?? '',
      date: row[5] ?? '',
      tags: row[6] ? row[6].split(',').filter(Boolean) : [],
      isRecurring: row[7] === 'true',
      recurringFrequency: row[8] || undefined,
      paymentMethod: row[9] || undefined,
      notes: row[10] || undefined,
      createdAt: row[11] ?? '',
      updatedAt: row[12] ?? '',
    };
  }

  private transactionToRow(t: Transaction): any[] {
    return [
      t.id, t.type, t.amount, t.category, t.description, t.date,
      t.tags.join(','), t.isRecurring.toString(), t.recurringFrequency ?? '',
      t.paymentMethod ?? '', t.notes ?? '', t.createdAt, t.updatedAt
    ];
  }

  // ── Categories ──────────────────────────────────────────────────────────────

  async getCategories(): Promise<Category[]> {
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEETS.CATEGORIES}!A:G`,
    });
    const rows = res.data.values ?? [];
    if (rows.length <= 1) return [];
    return rows.slice(1).map(r => this.rowToCategory(r)).filter(Boolean) as Category[];
  }

  async createCategory(data: Omit<Category, 'id' | 'createdAt'>): Promise<Category> {
    const category: Category = { ...data, id: uuidv4(), createdAt: new Date().toISOString() };
    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEETS.CATEGORIES}!A:G`,
      valueInputOption: 'RAW',
      requestBody: { values: [this.categoryToRow(category)] },
    });
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

  async getBudgets(year?: number, month?: number): Promise<Budget[]> {
    const transactions = await this.getTransactions();
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEETS.BUDGETS}!A:H`,
    });
    const rows = res.data.values ?? [];
    if (rows.length <= 1) return [];

    return rows.slice(1)
      .map(r => this.rowToBudget(r))
      .filter(Boolean)
      .filter((b): b is Budget => {
        if (year && b!.year !== year) return false;
        if (month && b!.month !== month) return false;
        return true;
      })
      .map(b => {
        // Compute spent from transactions
        const spent = transactions
          .filter(t => {
            if (t.type !== 'expense' || t.category !== b!.categoryId) return false;
            const d = new Date(t.date);
            if (year && d.getFullYear() !== year) return false;
            if (month && d.getMonth() + 1 !== month) return false;
            return true;
          })
          .reduce((s, t) => s + t.amount, 0);
        const remaining = b!.amount - spent;
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
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEETS.SETTINGS}!A:B`,
    });
    const rows = res.data.values ?? [];
    const map: Record<string, string> = {};
    rows.slice(1).forEach(r => { if (r[0]) map[r[0]] = r[1] ?? ''; });
    return {
      currency: map['currency'] ?? 'USD',
      currencySymbol: map['currencySymbol'] ?? '$',
      dateFormat: map['dateFormat'] ?? 'MM/dd/yyyy',
      theme: map['theme'] ?? 'dark',
      spreadsheetId: this.spreadsheetId,
      lastSync: new Date().toISOString(),
    };
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
    return merged;
  }

  // ── Reports ─────────────────────────────────────────────────────────────────

  async getMonthlyReport(year: number, month: number) {
    const transactions = await this.getTransactions();
    const filtered = transactions.filter(t => {
      const d = new Date(t.date);
      return d.getFullYear() === year && d.getMonth() + 1 === month;
    });
    return this.buildReport(filtered);
  }

  async getYearlyReport(year: number) {
    const transactions = await this.getTransactions();
    const filtered = transactions.filter(t => new Date(t.date).getFullYear() === year);

    const monthlyData = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const monthTxns = filtered.filter(t => new Date(t.date).getMonth() + 1 === m);
      const income = monthTxns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
      const expenses = monthTxns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
      return { month: m, income, expenses, net: income - expenses };
    });

    return { ...this.buildReport(filtered), monthlyBreakdown: monthlyData };
  }

  async getCategoryBreakdown(dateFrom: string, dateTo: string) {
    const transactions = await this.getTransactions();
    const filtered = transactions.filter(t => t.date >= dateFrom && t.date <= dateTo);
    const breakdown: Record<string, { income: number; expense: number; count: number }> = {};
    filtered.forEach(t => {
      if (!breakdown[t.category]) breakdown[t.category] = { income: 0, expense: 0, count: 0 };
      breakdown[t.category][t.type] += t.amount;
      breakdown[t.category].count++;
    });
    return Object.entries(breakdown).map(([category, data]) => ({ category, ...data }));
  }

  private buildReport(transactions: Transaction[]) {
    const income = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const categoryBreakdown: Record<string, number> = {};
    transactions.forEach(t => {
      categoryBreakdown[t.category] = (categoryBreakdown[t.category] || 0) + t.amount;
    });
    return {
      totalIncome: income,
      totalExpenses: expenses,
      netBalance: income - expenses,
      transactionCount: transactions.length,
      categoryBreakdown,
      savingsRate: income > 0 ? ((income - expenses) / income) * 100 : 0,
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

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Transaction, TransactionFilter, Category, Budget, Account, Goal, RecurringSchedule, ChatMessage, DetectedBill } from '../models';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private baseUrl = '/api';

  // ── Transactions ──────────────────────────────────────────────────────────

  getTransactions(filter?: TransactionFilter): Observable<ApiResponse<Transaction[]>> {
    let params = new HttpParams();
    if (filter) {
      if (filter.type && filter.type !== 'all') params = params.set('type', filter.type);
      if (filter.category) params = params.set('category', filter.category);
      if (filter.dateFrom) params = params.set('dateFrom', filter.dateFrom);
      if (filter.dateTo) params = params.set('dateTo', filter.dateTo);
      if (filter.search) params = params.set('search', filter.search);
      if (filter.minAmount != null) params = params.set('minAmount', filter.minAmount.toString());
      if (filter.maxAmount != null) params = params.set('maxAmount', filter.maxAmount.toString());
    }
    const clientDate = new Date().toLocaleDateString('en-CA');
    params = params.set('clientDate', clientDate);
    return this.http.get<ApiResponse<Transaction[]>>(`${this.baseUrl}/transactions`, { params });
  }

  getTransaction(id: string): Observable<ApiResponse<Transaction>> {
    return this.http.get<ApiResponse<Transaction>>(`${this.baseUrl}/transactions/${id}`);
  }

  createTransaction(transaction: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>): Observable<ApiResponse<Transaction>> {
    return this.http.post<ApiResponse<Transaction>>(`${this.baseUrl}/transactions`, transaction);
  }

  updateTransaction(id: string, transaction: Partial<Transaction>): Observable<ApiResponse<Transaction>> {
    return this.http.put<ApiResponse<Transaction>>(`${this.baseUrl}/transactions/${id}`, transaction);
  }

  deleteTransaction(id: string): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(`${this.baseUrl}/transactions/${id}`);
  }

  stopRecurringSeries(recurringId: string): Observable<ApiResponse<void>> {
    return this.http.post<ApiResponse<void>>(`${this.baseUrl}/transactions/recurring/${recurringId}/stop`, {});
  }

  deleteRecurringSeries(recurringId: string): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(`${this.baseUrl}/transactions/recurring/${recurringId}`);
  }


  // ── Categories ────────────────────────────────────────────────────────────

  getCategories(): Observable<ApiResponse<Category[]>> {
    return this.http.get<ApiResponse<Category[]>>(`${this.baseUrl}/categories`);
  }

  createCategory(category: Omit<Category, 'id' | 'createdAt'>): Observable<ApiResponse<Category>> {
    return this.http.post<ApiResponse<Category>>(`${this.baseUrl}/categories`, category);
  }

  updateCategory(id: string, category: Partial<Category>): Observable<ApiResponse<Category>> {
    return this.http.put<ApiResponse<Category>>(`${this.baseUrl}/categories/${id}`, category);
  }

  deleteCategory(id: string, reassignTo?: string): Observable<ApiResponse<void>> {
    let params = new HttpParams();
    if (reassignTo) params = params.set('reassignTo', reassignTo);
    return this.http.delete<ApiResponse<void>>(`${this.baseUrl}/categories/${id}`, { params });
  }

  // ── Budgets ───────────────────────────────────────────────────────────────

  getBudgets(year?: number, month?: number): Observable<ApiResponse<Budget[]>> {
    let params = new HttpParams();
    if (year) params = params.set('year', year.toString());
    if (month) params = params.set('month', month.toString());
    return this.http.get<ApiResponse<Budget[]>>(`${this.baseUrl}/budgets`, { params });
  }

  createBudget(budget: Omit<Budget, 'id' | 'spent' | 'remaining' | 'percentage' | 'createdAt'>): Observable<ApiResponse<Budget>> {
    return this.http.post<ApiResponse<Budget>>(`${this.baseUrl}/budgets`, budget);
  }

  updateBudget(id: string, budget: Partial<Budget>): Observable<ApiResponse<Budget>> {
    return this.http.put<ApiResponse<Budget>>(`${this.baseUrl}/budgets/${id}`, budget);
  }

  deleteBudget(id: string): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(`${this.baseUrl}/budgets/${id}`);
  }

  // ── Reports ───────────────────────────────────────────────────────────────

  getMonthlyReport(year: number, month: number, accountId?: string): Observable<ApiResponse<any>> {
    let params = new HttpParams().set('year', year.toString()).set('month', month.toString());
    if (accountId) params = params.set('accountId', accountId);
    return this.http.get<ApiResponse<any>>(`${this.baseUrl}/reports/monthly`, { params });
  }

  getYearlyReport(year: number, accountId?: string): Observable<ApiResponse<any>> {
    let params = new HttpParams().set('year', year.toString());
    if (accountId) params = params.set('accountId', accountId);
    return this.http.get<ApiResponse<any>>(`${this.baseUrl}/reports/yearly`, { params });
  }

  getExecutiveReport(startDate: string, endDate: string, accountId?: string): Observable<ApiResponse<any>> {
    let params = new HttpParams().set('startDate', startDate).set('endDate', endDate);
    if (accountId) params = params.set('accountId', accountId);
    return this.http.get<ApiResponse<any>>(`${this.baseUrl}/reports/executive`, { params });
  }

  getCategoryBreakdown(dateFrom: string, dateTo: string): Observable<ApiResponse<any>> {
    return this.http.get<ApiResponse<any>>(`${this.baseUrl}/reports/categories`, {
      params: new HttpParams().set('dateFrom', dateFrom).set('dateTo', dateTo)
    });
  }

  getAiAdvice(startDate: string, endDate: string, prevStartDate: string, prevEndDate: string): Observable<ApiResponse<{ summary: string; advice: any[] }>> {
    const params = new HttpParams()
      .set('startDate', startDate)
      .set('endDate', endDate)
      .set('prevStartDate', prevStartDate)
      .set('prevEndDate', prevEndDate);
    return this.http.get<ApiResponse<{ summary: string; advice: any[] }>>(`${this.baseUrl}/reports/ai-advice`, { params });
  }

  sendAiChatMessage(messages: ChatMessage[]): Observable<ApiResponse<{ response: string }>> {
    return this.http.post<ApiResponse<{ response: string }>>(`${this.baseUrl}/reports/ai-chat`, { messages });
  }

  // ── Accounts ──────────────────────────────────────────────────────────────

  getAccounts(): Observable<ApiResponse<Account[]>> {
    return this.http.get<ApiResponse<Account[]>>(`${this.baseUrl}/accounts`);
  }

  createAccount(account: Omit<Account, 'id' | 'createdAt'>): Observable<ApiResponse<Account>> {
    return this.http.post<ApiResponse<Account>>(`${this.baseUrl}/accounts`, account);
  }

  updateAccount(id: string, account: Partial<Account>): Observable<ApiResponse<Account>> {
    return this.http.put<ApiResponse<Account>>(`${this.baseUrl}/accounts/${id}`, account);
  }

  deleteAccount(id: string): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(`${this.baseUrl}/accounts/${id}`);
  }

  // ── Settings ──────────────────────────────────────────────────────────────

  getSettings(): Observable<ApiResponse<any>> {
    return this.http.get<ApiResponse<any>>(`${this.baseUrl}/settings`);
  }

  updateSettings(settings: any): Observable<ApiResponse<any>> {
    return this.http.put<ApiResponse<any>>(`${this.baseUrl}/settings`, settings);
  }

  syncStatus(): Observable<ApiResponse<{ connected: boolean; provider: string; lastSync: string }>> {
    return this.http.get<ApiResponse<any>>(`${this.baseUrl}/sync/status`);
  }

  // ── Goals ──────────────────────────────────────────────────────────────────

  getGoals(): Observable<ApiResponse<Goal[]>> {
    return this.http.get<ApiResponse<Goal[]>>(`${this.baseUrl}/goals`);
  }

  createGoal(goal: Omit<Goal, 'id' | 'createdAt'>): Observable<ApiResponse<Goal>> {
    return this.http.post<ApiResponse<Goal>>(`${this.baseUrl}/goals`, goal);
  }

  updateGoal(id: string, goal: Partial<Goal>): Observable<ApiResponse<Goal>> {
    return this.http.put<ApiResponse<Goal>>(`${this.baseUrl}/goals/${id}`, goal);
  }

  deleteGoal(id: string): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(`${this.baseUrl}/goals/${id}`);
  }

  // ── Exchange Rates ──────────────────────────────────────────────────────────

  getExchangeRates(): Observable<ApiResponse<Record<string, number>>> {
    return this.http.get<ApiResponse<Record<string, number>>>(`${this.baseUrl}/exchange-rates`);
  }

  // ── AI Suggest Category ─────────────────────────────────────────────────────

  suggestCategory(description: string, type: string): Observable<ApiResponse<{ categoryId: string | null }>> {
    const params = new HttpParams().set('description', description).set('type', type);
    return this.http.get<ApiResponse<{ categoryId: string | null }>>(`${this.baseUrl}/ai/suggest-category`, { params });
  }

  // ── PDF Audit Printable ────────────────────────────────────────────────────

  getExportPdfAudit(startDate: string, endDate: string, accountId?: string): Observable<ApiResponse<{ markdown: string }>> {
    let params = new HttpParams().set('startDate', startDate).set('endDate', endDate);
    if (accountId) params = params.set('accountId', accountId);
    return this.http.get<ApiResponse<{ markdown: string }>>(`${this.baseUrl}/reports/pdf-audit`, { params });
  }

  // ── Recurring Schedules ───────────────────────────────────────────────────

  getRecurringSchedules(): Observable<ApiResponse<RecurringSchedule[]>> {
    return this.http.get<ApiResponse<RecurringSchedule[]>>(`${this.baseUrl}/recurring`);
  }

  createRecurringSchedule(schedule: Omit<RecurringSchedule, 'id' | 'createdAt'>): Observable<ApiResponse<RecurringSchedule>> {
    return this.http.post<ApiResponse<RecurringSchedule>>(`${this.baseUrl}/recurring`, schedule);
  }

  updateRecurringSchedule(id: string, schedule: Partial<RecurringSchedule>): Observable<ApiResponse<RecurringSchedule>> {
    return this.http.put<ApiResponse<RecurringSchedule>>(`${this.baseUrl}/recurring/${id}`, schedule);
  }

  deleteRecurringSchedule(id: string): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(`${this.baseUrl}/recurring/${id}`);
  }

  detectRecurringBills(): Observable<ApiResponse<DetectedBill[]>> {
    return this.http.get<ApiResponse<DetectedBill[]>>(`${this.baseUrl}/recurring/detect`);
  }
}

import { Injectable, inject, signal, computed, Injector } from '@angular/core';
import { ApiService } from './api.service';
import { Transaction, TransactionFilter, TransactionSummary } from '../models';
import { tap, catchError, of } from 'rxjs';
import { SettingsService } from './settings.service';
import { AccountService } from './account.service';

@Injectable({ providedIn: 'root' })
export class TransactionService {
  private api = inject(ApiService);
  private injector = inject(Injector);

  // State signals
  readonly transactions = signal<Transaction[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly filter = signal<TransactionFilter>({ type: 'all', page: 1, limit: 50 });
  readonly serverSummary = signal<TransactionSummary | null>(null);
  readonly pagination = signal<{ totalItems: number; totalPages: number; page: number; limit: number }>({
    totalItems: 0,
    totalPages: 1,
    page: 1,
    limit: 50
  });

  readonly postedTransactions = computed(() => {
    const todayStr = new Date().toLocaleDateString('en-CA');
    return this.transactions().filter(t => t.date <= todayStr);
  });

  readonly normalizedTransactions = computed(() => {
    const txns = this.transactions();
    const settingsService = this.injector.get(SettingsService);
    const accountService = this.injector.get(AccountService);
    const primaryCurrency = settingsService.currency();
    const rates = accountService.exchangeRates();
    const accounts = accountService.accounts();

    return txns.map(t => {
      const acc = accounts.find(a => a.id === t.accountId);
      const accCurrency = acc?.currency || 'USD';
      if (accCurrency.toUpperCase() !== primaryCurrency.toUpperCase() && Object.keys(rates).length > 0) {
        const fromRate = rates[accCurrency.toUpperCase()] || 1.0;
        const toRate = rates[primaryCurrency.toUpperCase()] || 1.0;
        const convertedAmount = (t.amount / fromRate) * toRate;
        return { ...t, amount: parseFloat(convertedAmount.toFixed(2)) };
      }
      return t;
    });
  });

  readonly postedNormalizedTransactions = computed(() => {
    const todayStr = new Date().toLocaleDateString('en-CA');
    return this.normalizedTransactions().filter(t => t.date <= todayStr);
  });

  readonly filteredTransactions = computed(() => {
    const txns = this.transactions();
    const f = this.filter();
    return txns
      .filter(t => {
        if (f.accountId && t.accountId !== f.accountId && t.toAccountId !== f.accountId) return false;
        if (f.type && f.type !== 'all' && t.type !== f.type) return false;
        if (f.category && t.category !== f.category) return false;
        if (f.dateFrom && t.date < f.dateFrom) return false;
        if (f.dateTo && t.date > f.dateTo) return false;
        if (f.search) {
          const q = f.search.toLowerCase();
          if (!t.description.toLowerCase().includes(q) &&
              !t.category.toLowerCase().includes(q) &&
              !(t.notes?.toLowerCase().includes(q))) return false;
        }
        if (f.minAmount != null && t.amount < f.minAmount) return false;
        if (f.maxAmount != null && t.amount > f.maxAmount) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.date !== b.date) {
          return b.date.localeCompare(a.date);
        }
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });
  });

  readonly summary = computed<TransactionSummary>(() => {
    if (this.serverSummary()) {
      return this.serverSummary()!;
    }
    const txns = this.filteredTransactions();
    const settingsService = this.injector.get(SettingsService);
    const accountService = this.injector.get(AccountService);
    const primaryCurrency = settingsService.currency();
    const rates = accountService.exchangeRates();
    const accounts = accountService.accounts();

    const normalizedTxns = txns.map(t => {
      const acc = accounts.find(a => a.id === t.accountId);
      const accCurrency = acc?.currency || 'USD';
      if (accCurrency.toUpperCase() !== primaryCurrency.toUpperCase() && Object.keys(rates).length > 0) {
        const fromRate = rates[accCurrency.toUpperCase()] || 1.0;
        const toRate = rates[primaryCurrency.toUpperCase()] || 1.0;
        const convertedAmount = (t.amount / fromRate) * toRate;
        return { ...t, amount: parseFloat(convertedAmount.toFixed(2)) };
      }
      return t;
    });

    const income   = normalizedTxns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expenses = normalizedTxns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const categoryCount: Record<string, number> = {};
    normalizedTxns.filter(t => t.type === 'expense').forEach(t => { categoryCount[t.category] = (categoryCount[t.category] || 0) + t.amount; });
    const topCategory = Object.entries(categoryCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    const incomeExpenseTxns = normalizedTxns.filter(t => t.type !== 'transfer');
    const avgTransaction = incomeExpenseTxns.length ? incomeExpenseTxns.reduce((s, t) => s + t.amount, 0) / incomeExpenseTxns.length : 0;

    return {
      totalIncome: income,
      totalExpenses: expenses,
      netBalance: income - expenses,
      transactionCount: this.pagination().totalItems || normalizedTxns.length,
      avgTransaction,
      topCategory
    };
  });

  readonly recentTransactions = computed(() =>
    [...this.postedTransactions()]
      .sort((a, b) => {
        if (a.date !== b.date) {
          return b.date.localeCompare(a.date);
        }
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      })
      .slice(0, 10)
  );

  loadTransactions(filterOverride?: TransactionFilter) {
    this.loading.set(true);
    this.error.set(null);
    const activeFilter = filterOverride || this.filter();
    return this.api.getTransactions(activeFilter).pipe(
      tap(res => {
        if (res.success) {
          if (res.data && res.data.transactions && res.data.pagination) {
            this.transactions.set(res.data.transactions);
            this.pagination.set(res.data.pagination);
            if (res.data.summary) {
              this.serverSummary.set(res.data.summary);
            }
          } else if (res.data && Array.isArray(res.data.transactions)) {
            this.transactions.set(res.data.transactions);
            if (res.data.summary) {
              this.serverSummary.set(res.data.summary);
            }
          } else if (Array.isArray(res.data)) {
            this.transactions.set(res.data);
            this.pagination.set({
              totalItems: res.data.length,
              totalPages: 1,
              page: 1,
              limit: res.data.length || 50
            });
          }
        }
        this.loading.set(false);
      }),
      catchError(err => {
        this.error.set(err.message || 'Failed to load transactions');
        this.loading.set(false);
        return of(null);
      })
    );
  }

  createTransaction(data: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) {
    this.loading.set(true);
    return this.api.createTransaction(data).pipe(
      tap(res => {
        if (res.success) {
          this.transactions.update(txns => [res.data, ...txns]);
          try { this.injector.get(AccountService).loadAccounts().subscribe(); } catch {}
        }
        this.loading.set(false);
      }),
      catchError(err => {
        this.error.set(err.message || 'Failed to create transaction');
        this.loading.set(false);
        return of(null);
      })
    );
  }

  updateTransaction(id: string, data: Partial<Transaction>) {
    return this.api.updateTransaction(id, data).pipe(
      tap(res => {
        if (res.success) {
          this.transactions.update(txns =>
            txns.map(t => t.id === id ? res.data : t)
          );
          try { this.injector.get(AccountService).loadAccounts().subscribe(); } catch {}
        }
      }),
      catchError(err => {
        this.error.set(err.message || 'Failed to update transaction');
        return of(null);
      })
    );
  }

  deleteTransaction(id: string) {
    return this.api.deleteTransaction(id).pipe(
      tap(res => {
        if (res.success) {
          this.transactions.update(txns => txns.filter(t => t.id !== id));
          try { this.injector.get(AccountService).loadAccounts().subscribe(); } catch {}
        }
      }),
      catchError(err => {
        this.error.set(err.message || 'Failed to delete transaction');
        return of(null);
      })
    );
  }

  stopRecurringSeries(recurringId: string) {
    this.loading.set(true);
    return this.api.stopRecurringSeries(recurringId).pipe(
      tap(res => {
        if (res.success) {
          this.transactions.update(txns =>
            txns.map(t => t.recurringId === recurringId ? { ...t, isRecurring: false } : t)
          );
        }
        this.loading.set(false);
      }),
      catchError(err => {
        this.error.set(err.message || 'Failed to stop recurring series');
        this.loading.set(false);
        return of(null);
      })
    );
  }

  deleteRecurringSeries(recurringId: string) {
    this.loading.set(true);
    return this.api.deleteRecurringSeries(recurringId).pipe(
      tap(res => {
        if (res.success) {
          this.transactions.update(txns => txns.filter(t => t.recurringId !== recurringId));
        }
        this.loading.set(false);
      }),
      catchError(err => {
        this.error.set(err.message || 'Failed to delete recurring series');
        this.loading.set(false);
        return of(null);
      })
    );
  }

  setFilter(filter: TransactionFilter) {
    this.filter.set(filter);
    this.loadTransactions().subscribe();
  }

  updateFilter(partial: Partial<TransactionFilter>) {
    // Reset page to 1 on filter changes unless explicitly page navigation
    const newPage = partial.page !== undefined ? partial.page : 1;
    this.filter.update(f => ({ ...f, ...partial, page: newPage }));
    this.loadTransactions().subscribe();
  }

  setPage(page: number) {
    const totalPages = this.pagination().totalPages || 1;
    const validPage = Math.max(1, Math.min(page, totalPages));
    this.updateFilter({ page: validPage });
  }

  setLimit(limit: number) {
    this.updateFilter({ limit, page: 1 });
  }

  exportToCsv(): void {
    this.api.getTransactions({ ...this.filter(), limit: 'all' }).subscribe(res => {
      const txns = res.success ? (Array.isArray(res.data) ? res.data : (res.data.transactions || [])) : this.transactions();
      const headers = ['Date', 'Type', 'Category', 'Description', 'Amount', 'Account', 'Transfer To', 'Tags', 'Notes', 'Recurring', 'Frequency'];
      const rows = txns.map((t: Transaction) => [
        t.date, t.type, t.category || '', t.description,
        t.amount.toString(), t.accountId, t.toAccountId || '',
        (t.tags || []).join(';'), t.notes || '',
        t.isRecurring ? 'Yes' : 'No', t.recurringFrequency || ''
      ]);
      const csv = [headers, ...rows].map((r: string[]) => r.map((c: string) => `"${c}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transactions-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }
}

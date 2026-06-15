import { Injectable, inject, signal, computed } from '@angular/core';
import { ApiService } from './api.service';
import { Transaction, TransactionFilter, TransactionSummary } from '../models';
import { tap, catchError, of } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class TransactionService {
  private api = inject(ApiService);

  // State signals
  readonly transactions = signal<Transaction[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly filter = signal<TransactionFilter>({ type: 'all' });

  readonly postedTransactions = computed(() => {
    const todayStr = new Date().toLocaleDateString('en-CA');
    return this.transactions().filter(t => t.date <= todayStr);
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
    const txns = this.filteredTransactions();
    const income   = txns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expenses = txns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    // topCategory: only count expense transactions for a meaningful spending breakdown
    const categoryCount: Record<string, number> = {};
    txns.filter(t => t.type === 'expense').forEach(t => { categoryCount[t.category] = (categoryCount[t.category] || 0) + t.amount; });
    const topCategory = Object.entries(categoryCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    // avgTransaction: exclude transfers since they are not real income/expense events
    const incomeExpenseTxns = txns.filter(t => t.type !== 'transfer');
    const avgTransaction = incomeExpenseTxns.length ? incomeExpenseTxns.reduce((s, t) => s + t.amount, 0) / incomeExpenseTxns.length : 0;

    return {
      totalIncome: income,
      totalExpenses: expenses,
      netBalance: income - expenses,
      transactionCount: txns.length,
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

  loadTransactions(filter?: TransactionFilter) {
    this.loading.set(true);
    this.error.set(null);
    return this.api.getTransactions(filter).pipe(
      tap(res => {
        if (res.success) this.transactions.set(res.data);
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
  }

  updateFilter(partial: Partial<TransactionFilter>) {
    this.filter.update(f => ({ ...f, ...partial }));
  }

  exportToCsv(): void {
    const txns = this.filteredTransactions();
    const headers = ['Date', 'Type', 'Category', 'Description', 'Amount', 'Account', 'Transfer To', 'Tags', 'Notes', 'Recurring', 'Frequency'];
    const rows = txns.map(t => [
      t.date, t.type, t.category, t.description,
      t.amount.toString(), t.accountId, t.toAccountId || '',
      t.tags.join(';'), t.notes || '',
      t.isRecurring ? 'Yes' : 'No', t.recurringFrequency || ''
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

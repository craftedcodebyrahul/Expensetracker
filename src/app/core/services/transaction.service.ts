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

  // Computed
  readonly filteredTransactions = computed(() => {
    const txns = this.transactions();
    const f = this.filter();
    return txns.filter(t => {
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
    });
  });

  readonly summary = computed<TransactionSummary>(() => {
    const txns = this.filteredTransactions();
    const income   = txns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expenses = txns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const categoryCount: Record<string, number> = {};
    txns.forEach(t => { categoryCount[t.category] = (categoryCount[t.category] || 0) + t.amount; });
    const topCategory = Object.entries(categoryCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';

    // avgTransaction = average of individual transaction amounts (not combined)
    const avgTransaction = txns.length ? txns.reduce((s, t) => s + t.amount, 0) / txns.length : 0;

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
    [...this.transactions()]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
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

  setFilter(filter: TransactionFilter) {
    this.filter.set(filter);
  }

  updateFilter(partial: Partial<TransactionFilter>) {
    this.filter.update(f => ({ ...f, ...partial }));
  }

  exportToCsv(): void {
    const txns = this.filteredTransactions();
    const headers = ['Date', 'Type', 'Category', 'Description', 'Amount', 'Payment Method', 'Tags', 'Notes'];
    const rows = txns.map(t => [
      t.date, t.type, t.category, t.description,
      t.amount.toString(), t.paymentMethod || '',
      t.tags.join(';'), t.notes || ''
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

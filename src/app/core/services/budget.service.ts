import { Injectable, inject, signal, computed } from '@angular/core';
import { ApiService } from './api.service';
import { Budget, BudgetAlert } from '../models';
import { tap, catchError, of } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class BudgetService {
  private api = inject(ApiService);

  readonly budgets = signal<Budget[]>([]);
  readonly loading = signal(false);

  readonly budgetAlerts = computed<BudgetAlert[]>(() =>
    this.budgets()
      .filter(b => b.amount > 0)
      .map(b => ({
        categoryId: b.categoryId,
        categoryName: b.categoryName,
        budgetAmount: b.amount,
        spentAmount: b.spent,
        percentage: b.percentage,
        status: b.percentage >= 100 ? 'exceeded' : b.percentage >= 80 ? 'warning' : 'safe'
      } as BudgetAlert))
      .sort((a, b) => b.percentage - a.percentage)
  );

  readonly totalBudgeted = computed(() =>
    this.budgets().reduce((s, b) => s + b.amount, 0)
  );

  readonly totalSpent = computed(() =>
    this.budgets().reduce((s, b) => s + b.spent, 0)
  );

  loadBudgets(year?: number, month?: number) {
    this.loading.set(true);
    return this.api.getBudgets(year, month).pipe(
      tap(res => {
        if (res.success) this.budgets.set(res.data);
        this.loading.set(false);
      }),
      catchError(() => {
        this.loading.set(false);
        return of(null);
      })
    );
  }

  createBudget(data: Omit<Budget, 'id' | 'spent' | 'remaining' | 'percentage' | 'createdAt'>) {
    return this.api.createBudget(data).pipe(
      tap(res => {
        if (res.success) this.budgets.update(b => [...b, res.data]);
      }),
      catchError(err => of(null))
    );
  }

  updateBudget(id: string, data: Partial<Budget>) {
    return this.api.updateBudget(id, data).pipe(
      tap(res => {
        if (res.success) {
          this.budgets.update(bs => bs.map(b => b.id === id ? res.data : b));
        }
      }),
      catchError(err => of(null))
    );
  }

  deleteBudget(id: string) {
    return this.api.deleteBudget(id).pipe(
      tap(res => {
        if (res.success) this.budgets.update(bs => bs.filter(b => b.id !== id));
      }),
      catchError(err => of(null))
    );
  }
}

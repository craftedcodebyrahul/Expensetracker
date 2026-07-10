import { Injectable, inject, signal, computed } from '@angular/core';
import { ApiService } from './api.service';
import { RecurringService } from './recurring.service';
import { TransactionService } from './transaction.service';
import { CategoryService } from './category.service';
import { Budget, BudgetAlert } from '../models';
import { parseLocalDate } from '../../shared/utils/date.utils';
import { tap, catchError, of } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class BudgetService {
  private api = inject(ApiService);
  private recurringService = inject(RecurringService);
  private txnService = inject(TransactionService);
  private categoryService = inject(CategoryService);

  readonly budgets = signal<Budget[]>([]);
  readonly loading = signal(false);
  readonly loadedYear = signal<number>(new Date().getFullYear());
  readonly loadedMonth = signal<number>(new Date().getMonth() + 1);

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

  readonly unbudgetedSpentCategories = computed(() => {
    const explicitBudgets = this.budgets();
    const txns = this.txnService.postedNormalizedTransactions();
    const y = this.loadedYear();
    const m = this.loadedMonth() - 1; // 0-indexed for Date

    // Group actual expenses by category
    const spentByCategory: Record<string, number> = {};
    txns.filter(t => {
      const d = parseLocalDate(t.date);
      return t.type === 'expense' && d.getFullYear() === y && d.getMonth() === m;
    }).forEach(t => {
      if (t.category) {
        spentByCategory[t.category] = (spentByCategory[t.category] || 0) + t.amount;
      }
    });

    const budgetedCategoryIds = new Set(explicitBudgets.map(b => b.categoryId));
    const items: Array<Budget & { isUnbudgeted: boolean }> = [];

    // For any category with spending but no set budget, create a virtual budget item
    for (const [catId, spent] of Object.entries(spentByCategory)) {
      if (!budgetedCategoryIds.has(catId)) {
        const cat = this.categoryService.getCategoryById(catId);
        items.push({
          id: `unbudgeted_${catId}`,
          categoryId: catId,
          categoryName: cat?.name ?? catId,
          amount: 0,
          period: 'monthly',
          month: this.loadedMonth(),
          year: this.loadedYear(),
          spent,
          remaining: 0,
          percentage: 0,
          createdAt: new Date().toISOString(),
          isUnbudgeted: true
        });
      }
    }

    return items.sort((a, b) => b.spent - a.spent);
  });

  readonly totalUnplannedExpenses = computed(() =>
    this.unbudgetedSpentCategories().reduce((s, c) => s + c.spent, 0)
  );

  readonly monthlyScheduledBills = computed(() => {
    const year = this.loadedYear();
    const month = this.loadedMonth() - 1; // 0-indexed for Date
    const schedules = this.recurringService.schedules().filter(s => s.type === 'expense');

    const bills: Array<{
      id: string;
      description: string;
      amount: number;
      category: string;
      frequency: string;
      dueDate: Date;
      formattedDueDate: string;
      isPaid: boolean;
    }> = [];

    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Check transaction history to see if they've paid this recurring schedule in this month
    const txns = this.txnService.postedNormalizedTransactions();
    const paidDescriptions = new Set(
      txns.filter(t => {
        const d = parseLocalDate(t.date);
        return t.type === 'expense' && d.getFullYear() === year && d.getMonth() === month;
      }).map(t => t.description.toLowerCase().trim())
    );

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month, day);
      const cellTime = d.getTime();

      for (const s of schedules) {
        const start = new Date(s.startDate + 'T00:00:00');
        const startTime = start.getTime();

        if (cellTime < startTime) continue;

        // Check if schedule falls on this day
        let matches = false;
        if (s.frequency === 'daily') {
          matches = true;
        } else if (s.frequency === 'weekly') {
          matches = d.getDay() === start.getDay();
        } else if (s.frequency === 'biweekly') {
          const diffDays = Math.round((cellTime - startTime) / (24 * 60 * 60 * 1000));
          matches = diffDays % 14 === 0;
        } else if (s.frequency === 'monthly') {
          matches = d.getDate() === start.getDate();
        } else if (s.frequency === 'yearly') {
          matches = d.getMonth() === start.getMonth() && d.getDate() === start.getDate();
        }

        if (matches) {
          // Check if paid: does any transaction description match the schedule description?
          const isPaid = paidDescriptions.has(s.description.toLowerCase().trim());
          bills.push({
            id: `${s.id}_${day}`,
            description: s.description,
            amount: s.amount,
            category: s.category,
            frequency: s.frequency,
            dueDate: d,
            formattedDueDate: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            isPaid
          });
        }
      }
    }

    // Sort bills by due date ascending
    return bills.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  });

  readonly totalRecurringScheduledUnbudgeted = computed(() => {
    const year = this.loadedYear();
    const month = this.loadedMonth() - 1; // 0-indexed for Date
    const budgetedCategoryIds = new Set(this.budgets().map(b => b.categoryId));
    
    // Filter active expense schedules where category is NOT budgeted
    const schedules = this.recurringService.schedules().filter(s => 
      s.type === 'expense' && 
      (!s.category || !budgetedCategoryIds.has(s.category))
    );

    let total = 0;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month, day);
      const cellTime = d.getTime();

      for (const s of schedules) {
        const start = new Date(s.startDate + 'T00:00:00');
        const startTime = start.getTime();

        if (cellTime < startTime) continue;

        let matches = false;
        if (s.frequency === 'daily') matches = true;
        else if (s.frequency === 'weekly') matches = d.getDay() === start.getDay();
        else if (s.frequency === 'biweekly') {
          const diffDays = Math.round((cellTime - startTime) / (1000 * 60 * 60 * 24));
          matches = diffDays >= 0 && diffDays % 14 === 0;
        } else if (s.frequency === 'monthly') {
          const targetDay = start.getDate();
          const lastDay = new Date(year, month + 1, 0).getDate();
          if (targetDay > lastDay) {
            matches = d.getDate() === lastDay;
          } else {
            matches = d.getDate() === targetDay;
          }
        } else if (s.frequency === 'yearly') {
          matches = d.getDate() === start.getDate() && d.getMonth() === start.getMonth();
        }

        if (matches) {
          total += s.amount;
        }
      }
    }
    return total;
  });

  readonly totalPlannedOutflow = computed(() =>
    this.totalBudgeted() + this.totalRecurringScheduledUnbudgeted()
  );

  readonly totalActualExpenses = computed(() => {
    const txns = this.txnService.postedNormalizedTransactions();
    const y = this.loadedYear();
    const m = this.loadedMonth() - 1; // 0-indexed for Date
    return txns
      .filter(t => {
        const d = parseLocalDate(t.date);
        return t.type === 'expense' && d.getFullYear() === y && d.getMonth() === m;
      })
      .reduce((s, t) => s + t.amount, 0);
  });

  readonly monthProgressPercentage = computed(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-12
    const targetYear = this.loadedYear();
    const targetMonth = this.loadedMonth();

    if (targetYear < currentYear || (targetYear === currentYear && targetMonth < currentMonth)) {
      return 100; // Past month is fully elapsed
    }
    if (targetYear > currentYear || (targetYear === currentYear && targetMonth > currentMonth)) {
      return 0; // Future month has not started
    }
    // Current month
    const day = now.getDate();
    const totalDays = new Date(currentYear, currentMonth, 0).getDate();
    return Math.round((day / totalDays) * 100);
  });

  readonly pacingPercentage = computed(() => {
    const planned = this.totalPlannedOutflow();
    if (planned <= 0) return 0;
    return Math.round((this.totalActualExpenses() / planned) * 100);
  });

  readonly pacingStatus = computed(() => {
    const planned = this.totalPlannedOutflow();
    const spent = this.totalActualExpenses();
    if (planned === 0) {
      return {
        status: 'no_budget',
        label: 'No planned spending',
        description: 'Set monthly budget limits or recurring bills to track your pacing.',
        class: 'status-muted',
        icon: '🎯'
      };
    }

    const spentPct = this.pacingPercentage();
    const timePct = this.monthProgressPercentage();

    if (spentPct > 100) {
      return {
        status: 'exceeded',
        label: 'Over Budget',
        description: `You've exceeded your monthly planned outflow of $${planned.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} by ${(spent - planned).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} (${spentPct}% spent).`,
        class: 'status-danger',
        icon: '🚨'
      };
    }

    // Pacing comparison
    const diff = spentPct - timePct;
    if (diff > 15) {
      return {
        status: 'warning_fast',
        label: 'Pacing Fast',
        description: `You've spent ${spentPct}% of your planned outflow ($${spent.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}), but we are only ${timePct}% through the month.`,
        class: 'status-warning',
        icon: '⚠️'
      };
    } else if (diff > 0) {
      return {
        status: 'warning_slight',
        label: 'Pacing Slightly Ahead',
        description: `You've spent ${spentPct}% of planned outflow vs ${timePct}% of time elapsed.`,
        class: 'status-info',
        icon: '📉'
      };
    } else {
      return {
        status: 'safe',
        label: 'In Safe Zone',
        description: `Great job! You've spent only ${spentPct}% of planned outflow ($${spent.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}), well below the ${timePct}% of time elapsed.`,
        class: 'status-success',
        icon: '💚'
      };
    }
  });

  loadBudgets(year?: number, month?: number) {
    this.loading.set(true);
    const y = year ?? new Date().getFullYear();
    const m = month ?? (new Date().getMonth() + 1);
    this.loadedYear.set(y);
    this.loadedMonth.set(m);
    return this.api.getBudgets(y, m).pipe(
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

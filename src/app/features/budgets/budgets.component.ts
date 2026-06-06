import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BudgetService } from '../../core/services/budget.service';
import { CategoryService } from '../../core/services/category.service';
import { ToastService } from '../../core/services/toast.service';
import { HeaderComponent } from '../../layout/header.component';
import { CurrencyFormatPipe } from '../../shared/pipes/currency-format.pipe';
import { Budget } from '../../core/models';

@Component({
  selector: 'app-budgets',
  standalone: true,
  imports: [CommonModule, FormsModule, HeaderComponent, CurrencyFormatPipe],
  template: `
    <app-header title="Budgets" subtitle="Set spending limits and track your goals">
      <button class="btn btn-primary btn-sm" (click)="openForm()">+ Set Budget</button>
    </app-header>

    <div class="budgets-page">

      <!-- Period Selector -->
      <div class="period-selector card">
        <div class="period-controls">
          <button class="btn btn-ghost btn-sm" (click)="prevMonth()">‹</button>
          <span class="period-label">{{ monthName }} {{ selectedYear }}</span>
          <button class="btn btn-ghost btn-sm" (click)="nextMonth()">›</button>
        </div>
        <div class="period-summary">
          <span class="ps-item">
            <span class="ps-label">Budgeted</span>
            <span class="ps-value">{{ budgetService.totalBudgeted() | currencyFormat }}</span>
          </span>
          <span class="ps-divider">|</span>
          <span class="ps-item">
            <span class="ps-label">Spent</span>
            <span class="ps-value text-expense">{{ budgetService.totalSpent() | currencyFormat }}</span>
          </span>
          <span class="ps-divider">|</span>
          <span class="ps-item">
            <span class="ps-label">Remaining</span>
            <span class="ps-value text-income">{{ (budgetService.totalBudgeted() - budgetService.totalSpent()) | currencyFormat }}</span>
          </span>
        </div>
      </div>

      <!-- Budget Cards Grid -->
      @if (budgetService.loading()) {
        <div class="budgets-grid">
          @for (i of [1,2,3,4,5,6]; track i) {
            <div class="skeleton" style="height: 160px; border-radius: 12px;"></div>
          }
        </div>
      } @else if (budgetService.budgets().length === 0) {
        <div class="card empty-state">
          <span class="empty-icon">🎯</span>
          <h3>No budgets set</h3>
          <p>Set monthly spending limits to stay on track with your financial goals.</p>
          <button class="btn btn-primary" (click)="openForm()">+ Set Your First Budget</button>
        </div>
      } @else {
        <div class="budgets-grid">
          @for (budget of budgetService.budgets(); track budget.id) {
            <div class="budget-card" [class.exceeded]="budget.percentage >= 100"
                 [class.warning]="budget.percentage >= 80 && budget.percentage < 100">
              <div class="bc-header">
                <div class="bc-category">
                  <span class="bc-icon">{{ getCategoryIcon(budget.categoryId) }}</span>
                  <div class="bc-title">
                    <span class="bc-name">{{ budget.categoryName }}</span>

                  </div>
                </div>
                <div class="bc-actions">
                  <button class="btn btn-ghost btn-icon btn-sm" (click)="editBudget(budget)" aria-label="Edit budget">✏️</button>
                  <button class="btn btn-ghost btn-icon btn-sm" (click)="confirmDelete(budget)" aria-label="Delete budget">🗑️</button>
                </div>
              </div>

              <div class="bc-amounts">
                <span class="bc-spent" [class.text-expense]="budget.percentage >= 100">
                  {{ budget.spent | currencyFormat }}
                </span>
                <span class="bc-of">of {{ budget.amount | currencyFormat }}</span>
              </div>

              <div class="progress-bar" style="height: 8px;">
                <div class="progress-fill"
                     [style.width.%]="Math.min(budget.percentage, 100)"
                     [style.background]="budget.percentage >= 100 ? 'var(--accent-red)' :
                                         budget.percentage >= 80 ? 'var(--accent-yellow)' :
                                         'var(--accent-green)'">
                </div>
              </div>

              <div class="bc-footer">
                <span class="bc-pct" [class.text-expense]="budget.percentage >= 100"
                      [style.color]="budget.percentage >= 80 && budget.percentage < 100 ? 'var(--accent-yellow)' : ''">
                  {{ budget.percentage }}% used
                </span>
                <span class="bc-remaining" [class.text-income]="budget.remaining >= 0"
                      [class.text-expense]="budget.remaining < 0">
                  {{ budget.remaining >= 0 ? (budget.remaining | currencyFormat) + ' left' : ((-budget.remaining) | currencyFormat) + ' over' }}
                </span>
              </div>

              @if (budget.percentage >= 100) {
                <div class="bc-alert">⚠️ Budget exceeded!</div>
              } @else if (budget.percentage >= 80) {
                <div class="bc-alert bc-alert-warning">⚡ Approaching limit</div>
              }
            </div>
          }
        </div>
      }
    </div>

    <!-- Budget Form Modal -->
    @if (showForm()) {
      <div class="modal-overlay" (click)="onOverlayClick($event)">
        <div class="modal" role="dialog" aria-modal="true">
          <div class="modal-header">
            <h3>{{ editingBudget() ? 'Edit Budget' : 'Set Budget' }}</h3>
            <button class="btn btn-ghost btn-icon" (click)="closeForm()">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Category *</label>
              <select class="form-control" [(ngModel)]="form.categoryId" (ngModelChange)="onCategoryChange($event)">
                <option value="">Select category...</option>
                @for (cat of categoryService.expenseCategories(); track cat.id) {
                  <option [value]="cat.id">{{ cat.icon }} {{ cat.name }}</option>
                }
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Monthly Budget Amount *</label>
              <div class="input-prefix">
                <span class="prefix">$</span>
                <input type="number" class="form-control" [(ngModel)]="form.amount"
                       placeholder="0.00" min="0" step="0.01">
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Year</label>
              <input type="number" class="form-control" [(ngModel)]="form.year" [min]="2020" [max]="2030">
            </div>
            <div class="form-group">
              <label class="form-label">Month *</label>
              <select class="form-control" [(ngModel)]="form.month" required>
                @for (m of months; track m.value) {
                  <option [value]="m.value">{{ m.label }}</option>
                }
              </select>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" (click)="closeForm()">Cancel</button>
            <button class="btn btn-primary" (click)="saveBudget()" [disabled]="submitting() || !form.categoryId || !form.amount || !form.month">
              {{ submitting() ? 'Saving...' : (editingBudget() ? 'Update' : 'Set') + ' Budget' }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Delete Confirm -->
    @if (deletingBudget()) {
      <div class="modal-overlay" (click)="cancelDelete()">
        <div class="modal" style="max-width: 400px;" role="alertdialog">
          <div class="modal-header"><h3>Remove Budget</h3></div>
          <div class="modal-body">
            <p>Remove the budget for <strong>{{ deletingBudget()!.categoryName }}</strong>?</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" (click)="cancelDelete()">Cancel</button>
            <button class="btn btn-danger" (click)="deleteBudget()">Remove</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .budgets-page { padding: 1.5rem 2rem; display: flex; flex-direction: column; gap: 1.25rem; }

    .period-selector {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1rem 1.5rem;
      flex-wrap: wrap;
      gap: 1rem;
    }
    .period-controls { display: flex; align-items: center; gap: 1rem; }
    .period-label { font-size: 1rem; font-weight: 600; color: var(--text-primary); min-width: 140px; text-align: center; }
    .period-summary { display: flex; align-items: center; gap: 1rem; }
    .ps-item { display: flex; flex-direction: column; gap: 0.125rem; }
    .ps-label { font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .ps-value { font-size: 1rem; font-weight: 600; }
    .ps-divider { color: var(--border-light); }

    .budgets-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }

    .budget-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      transition: var(--transition);
    }
    .budget-card:hover { border-color: var(--border-light); }
    .budget-card.exceeded { border-color: rgba(239, 83, 80, 0.4); background: rgba(239, 83, 80, 0.05); }
    .budget-card.warning { border-color: rgba(255, 193, 7, 0.4); }

    .bc-header { display: flex; align-items: center; justify-content: space-between; }
    .bc-category { display: flex; align-items: center; gap: 0.5rem; }
    .bc-icon { font-size: 1.25rem; }
    .bc-title { display: flex; flex-direction: column; gap: 0.125rem; }
    .bc-name { font-size: 0.875rem; font-weight: 600; color: var(--text-primary); }
    .bc-period-badge { font-size: 0.65rem; font-weight: 600; color: var(--accent-blue-light); background: rgba(92,107,192,0.12); padding: 0.1rem 0.375rem; border-radius: 100px; }
    .bc-actions { display: flex; gap: 0.25rem; }

    .bc-amounts { display: flex; align-items: baseline; gap: 0.375rem; }
    .bc-spent { font-size: 1.375rem; font-weight: 700; color: var(--text-primary); }
    .bc-of { font-size: 0.8125rem; color: var(--text-muted); }

    .bc-footer { display: flex; justify-content: space-between; align-items: center; }
    .bc-pct { font-size: 0.8125rem; font-weight: 600; color: var(--text-secondary); }
    .bc-remaining { font-size: 0.8125rem; font-weight: 600; }

    .bc-alert {
      background: rgba(239, 83, 80, 0.1);
      color: var(--accent-red);
      padding: 0.375rem 0.75rem;
      border-radius: var(--radius-sm);
      font-size: 0.75rem;
      font-weight: 600;
      text-align: center;
    }
    .bc-alert-warning { background: rgba(255, 193, 7, 0.1); color: var(--accent-yellow); }

    .empty-state { display: flex; flex-direction: column; align-items: center; gap: 0.75rem; padding: 3rem; text-align: center; }
    .empty-icon { font-size: 3rem; }
    .empty-state h3 { color: var(--text-primary); }
    .empty-state p { color: var(--text-muted); max-width: 360px; }

    .input-prefix { position: relative; }
    .prefix { position: absolute; left: 0.875rem; top: 50%; transform: translateY(-50%); color: var(--text-muted); font-weight: 600; }
    .input-prefix .form-control { padding-left: 1.75rem; }

    @media (max-width: 1024px) { .budgets-grid { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 640px) { .budgets-page { padding: 1rem; } .budgets-grid { grid-template-columns: 1fr; } }
  `]
})
export class BudgetsComponent implements OnInit {
  budgetService = inject(BudgetService);
  categoryService = inject(CategoryService);
  private toast = inject(ToastService);

  protected Math = Math;
  showForm = signal(false);
  editingBudget = signal<Budget | undefined>(undefined);
  deletingBudget = signal<Budget | undefined>(undefined);
  submitting = signal(false);

  selectedMonth = new Date().getMonth() + 1;
  selectedYear = new Date().getFullYear();

  months = [
    { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
    { value: 4, label: 'April' }, { value: 5, label: 'May' }, { value: 6, label: 'June' },
    { value: 7, label: 'July' }, { value: 8, label: 'August' }, { value: 9, label: 'September' },
    { value: 10, label: 'October' }, { value: 11, label: 'November' }, { value: 12, label: 'December' },
  ];

  form = { categoryId: '', categoryName: '', amount: null as number | null, year: new Date().getFullYear(), month: new Date().getMonth() + 1 as number };

  get monthName() { return this.months.find(m => m.value === this.selectedMonth)?.label ?? ''; }

  ngOnInit() {
    this.loadData();
    this.categoryService.loadCategories().subscribe();
  }

  loadData() {
    this.budgetService.loadBudgets(this.selectedYear, this.selectedMonth).subscribe();
  }

  prevMonth() {
    if (this.selectedMonth === 1) { this.selectedMonth = 12; this.selectedYear--; }
    else this.selectedMonth--;
    this.loadData();
  }

  nextMonth() {
    if (this.selectedMonth === 12) { this.selectedMonth = 1; this.selectedYear++; }
    else this.selectedMonth++;
    this.loadData();
  }

  openForm() {
    this.form = { categoryId: '', categoryName: '', amount: null, year: this.selectedYear, month: this.selectedMonth };
    this.editingBudget.set(undefined);
    this.showForm.set(true);
  }

  editBudget(budget: Budget) {
    this.form = { categoryId: budget.categoryId, categoryName: budget.categoryName, amount: budget.amount, year: budget.year, month: budget.month ?? this.selectedMonth };
    this.editingBudget.set(budget);
    this.showForm.set(true);
  }

  closeForm() { this.showForm.set(false); this.editingBudget.set(undefined); }

  onCategoryChange(id: string) {
    const cat = this.categoryService.getCategoryById(id);
    this.form.categoryName = cat?.name ?? id;
  }

  saveBudget() {
    if (!this.form.categoryId || !this.form.amount || !this.form.month) return;
    this.submitting.set(true);
    const data = {
      categoryId: this.form.categoryId,
      categoryName: this.form.categoryName,
      amount: Number(this.form.amount),
      period: 'monthly' as const,
      month: Number(this.form.month),
      year: this.form.year,
    };
    const obs = this.editingBudget()
      ? this.budgetService.updateBudget(this.editingBudget()!.id, data)
      : this.budgetService.createBudget(data);
    obs.subscribe(() => {
      this.submitting.set(false);
      this.closeForm();
      this.loadData();
      this.toast.success(this.editingBudget() ? 'Budget updated!' : 'Budget set!');
    });
  }

  confirmDelete(budget: Budget) { this.deletingBudget.set(budget); }
  cancelDelete() { this.deletingBudget.set(undefined); }

  deleteBudget() {
    const b = this.deletingBudget();
    if (!b) return;
    this.budgetService.deleteBudget(b.id).subscribe(() => {
      this.deletingBudget.set(undefined);
      this.toast.success('Budget removed');
    });
  }

  getCategoryIcon(id: string) { return this.categoryService.getCategoryIcon(id); }

  onOverlayClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('modal-overlay')) this.closeForm();
  }
}

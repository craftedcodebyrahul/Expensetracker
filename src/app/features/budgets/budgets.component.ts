import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BudgetService } from '../../core/services/budget.service';
import { CategoryService } from '../../core/services/category.service';
import { RecurringService } from '../../core/services/recurring.service';
import { TransactionService } from '../../core/services/transaction.service';
import { AccountService } from '../../core/services/account.service';
import { ToastService } from '../../core/services/toast.service';
import { parseLocalDate } from '../../shared/utils/date.utils';
import { ApiService } from '../../core/services/api.service';
import { HeaderComponent } from '../../layout/header.component';
import { CurrencyFormatPipe } from '../../shared/pipes/currency-format.pipe';
import { Budget } from '../../core/models';

@Component({
  selector: 'app-budgets',
  standalone: true,
  imports: [CommonModule, FormsModule, HeaderComponent, CurrencyFormatPipe],
  template: `
    <app-header title="Budgets" subtitle="Set spending limits and track your goals">
      <button class="btn btn-ghost btn-sm" style="display: inline-flex; align-items: center; gap: 0.375rem;" 
              (click)="getBudgetSuggestions()" [disabled]="loadingSuggestions()">
        <span>🔮</span> Optimize with AI
      </button>
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
            <span class="ps-label">Planned Outflow</span>
            <span class="ps-value">{{ budgetService.totalPlannedOutflow() | currencyFormat }}</span>
          </span>
          <span class="ps-divider">|</span>
          <span class="ps-item">
            <span class="ps-label">Actual Spent</span>
            <span class="ps-value text-expense">{{ budgetService.totalActualExpenses() | currencyFormat }}</span>
          </span>
          <span class="ps-divider">|</span>
          <span class="ps-item">
            <span class="ps-label">Net Remaining</span>
            <span class="ps-value" [class.text-income]="(budgetService.totalPlannedOutflow() - budgetService.totalActualExpenses()) >= 0"
                                    [class.text-expense]="(budgetService.totalPlannedOutflow() - budgetService.totalActualExpenses()) < 0">
              {{ (budgetService.totalPlannedOutflow() - budgetService.totalActualExpenses()) | currencyFormat }}
            </span>
          </span>
        </div>
      </div>

      <!-- Layout Grid -->
      <div class="budgets-layout">
        <!-- Main budgets column (Left) -->
        <div class="main-budgets-col">
          <!-- Pacing Card -->
          @let pacing = budgetService.pacingStatus();
          @if (budgetService.totalPlannedOutflow() > 0) {
            <div [class]="'pacing-card card ' + pacing.class">
              <div class="pacing-header">
                <div class="pacing-title">
                  <span class="pacing-icon">{{ pacing.icon }}</span>
                  <div class="pacing-text-group">
                    <h4 class="pacing-heading">{{ pacing.label }}</h4>
                    <p class="pacing-description">{{ pacing.description }}</p>
                  </div>
                </div>
                <div class="pacing-breakdown">
                  <div class="pb-row">
                    <span class="pb-dot budgeted" style="background: var(--accent-blue-light);"></span>
                    <span>Category Budgets: <strong>{{ budgetService.totalBudgeted() | currencyFormat }}</strong></span>
                  </div>
                  <div class="pb-row">
                    <span class="pb-dot recurring" style="background: var(--accent-cyan);"></span>
                    <span>Scheduled Bills (Unbudgeted): <strong>{{ budgetService.totalRecurringScheduledUnbudgeted() | currencyFormat }}</strong></span>
                  </div>
                  @if (budgetService.totalUnplannedExpenses() > 0) {
                    <div class="pb-row">
                      <span class="pb-dot unplanned" style="background: var(--accent-yellow);"></span>
                      <span>Unplanned Expenses: <strong>{{ budgetService.totalUnplannedExpenses() | currencyFormat }}</strong></span>
                    </div>
                  }
                  <div class="pb-row pb-total">
                    <span>Planned Limit: <strong>{{ budgetService.totalPlannedOutflow() | currencyFormat }}</strong></span>
                  </div>
                </div>
              </div>
              <div class="pacing-progress-container">
                <div class="pacing-progress-bar">
                  <!-- Time progress marker (elapsed days) -->
                  <div class="time-marker" [style.left.%]="budgetService.monthProgressPercentage()" title="Time Elapsed"></div>
                  <!-- Spending progress fill -->
                  <div class="pacing-fill" [style.width.%]="Math.min(budgetService.pacingPercentage(), 100)"></div>
                </div>
                <div class="pacing-progress-labels">
                  <span>Actual Spent: <strong>{{ budgetService.totalActualExpenses() | currencyFormat }}</strong> ({{ budgetService.pacingPercentage() }}%)</span>
                  <span class="time-label-indicator" [style.left.%]="budgetService.monthProgressPercentage()">
                    📅 Month Progress: {{ budgetService.monthProgressPercentage() }}%
                  </span>
                  <span>100% Limit</span>
                </div>
              </div>
            </div>
          }

          <!-- Grid Sections -->
          @if (budgetService.loading()) {
            <h3 class="section-header">Category Budgets</h3>
            <div class="budgets-grid">
              @for (i of [1,2,3,4,5,6]; track i) {
                <div class="skeleton" style="height: 160px; border-radius: 12px;"></div>
              }
            </div>
          } @else {
            <!-- Category Budgets Grid -->
            <h3 class="section-header">Category Budgets</h3>
            @if (budgetService.budgets().length === 0) {
              <div class="card empty-state" style="padding: 2.5rem 1.5rem; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem;">
                <span class="empty-icon" style="font-size: 2rem;">🎯</span>
                <p style="margin: 0; color: var(--text-muted); font-size: 0.9rem;">No category budgets set for this month. Set limits to stay on track.</p>
                <button class="btn btn-primary btn-sm" style="margin-top: 0.5rem;" (click)="openForm()">+ Set Budget</button>
              </div>
            } @else {
              <div class="budgets-grid">
                @for (budget of budgetService.budgets(); track budget.id) {
                  <div class="budget-card" 
                       [class.exceeded]="budget.percentage >= 100"
                       [class.warning]="budget.percentage >= 80 && budget.percentage < 100"
                       (click)="openTransactionsDrawer(budget.categoryId)"
                       style="cursor: pointer;">
                    <div class="bc-header">
                      <div class="bc-category">
                        <span class="bc-icon">{{ getCategoryIcon(budget.categoryId) }}</span>
                        <div class="bc-title">
                          <span class="bc-name">{{ budget.categoryName }}</span>
                        </div>
                      </div>
                      <div class="bc-actions">
                        <button class="btn btn-ghost btn-icon btn-sm" (click)="editBudget(budget); $event.stopPropagation()" aria-label="Edit budget">✏️</button>
                        <button class="btn btn-ghost btn-icon btn-sm" (click)="confirmDelete(budget); $event.stopPropagation()" aria-label="Delete budget">🗑️</button>
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

            <!-- Unplanned Spending Grid (Only if unbudgetedSpentCategories has items) -->
            @if (budgetService.unbudgetedSpentCategories().length > 0) {
              <h3 class="section-header" style="margin-top: 1.5rem;">Unplanned Monthly Spending</h3>
              <div class="budgets-grid">
                @for (budget of budgetService.unbudgetedSpentCategories(); track budget.id) {
                  <div class="budget-card unbudgeted" 
                       (click)="openTransactionsDrawer(budget.categoryId)"
                       style="cursor: pointer;">
                    <div class="bc-header">
                      <div class="bc-category">
                        <span class="bc-icon">{{ getCategoryIcon(budget.categoryId) }}</span>
                        <div class="bc-title">
                          <span class="bc-name">{{ budget.categoryName }}</span>
                        </div>
                      </div>
                      <div class="bc-actions">
                        <button class="btn btn-ghost btn-icon btn-sm" (click)="setBudgetForUnbudgeted(budget); $event.stopPropagation()" title="Set Budget limit" aria-label="Set Budget limit">➕</button>
                      </div>
                    </div>

                    <div class="bc-amounts">
                      <span class="bc-spent text-expense">
                        {{ budget.spent | currencyFormat }}
                      </span>
                      <span class="bc-of text-muted" style="font-size: 0.75rem; font-style: italic;">No limit set</span>
                    </div>

                    <div class="progress-bar unbudgeted-bar" style="height: 4px;">
                      <div class="progress-fill" style="width: 100%; background: var(--border-light); opacity: 0.6;"></div>
                    </div>

                    <div class="bc-footer">
                      <span class="bc-pct text-muted" style="font-weight: 500; font-size: 0.75rem;">Unbudgeted category</span>
                      <span class="bc-remaining text-muted" style="cursor: pointer; text-decoration: underline; font-size: 0.75rem; font-weight: 500;" 
                            (click)="setBudgetForUnbudgeted(budget); $event.stopPropagation()">
                        Set limit
                      </span>
                    </div>
                  </div>
                }
              </div>
            }
          }
        </div>

        <!-- Sidebar column (Right) -->
        <div class="sidebar-bills-col">
          <div class="sidebar-card">
            <h3>Scheduled Monthly Bills</h3>
            @if (budgetService.monthlyScheduledBills().length === 0) {
              <div style="text-align: center; color: var(--text-muted); padding: 1.5rem 0; font-size: 0.85rem;">
                <span>📅 No scheduled bills this month.</span>
              </div>
            } @else {
              <div class="bills-list">
                @for (bill of budgetService.monthlyScheduledBills(); track bill.id) {
                  <div class="bill-item">
                    <div class="bill-main">
                      <div class="bill-icon-box" [style.background]="categoryService.getCategoryColor(bill.category) + '20'" [style.color]="categoryService.getCategoryColor(bill.category)">
                        {{ categoryService.getCategoryIcon(bill.category) }}
                      </div>
                      <div class="bill-details">
                        <span class="bill-title">{{ bill.description }}</span>
                        <span class="bill-meta">Due: {{ bill.formattedDueDate }}</span>
                      </div>
                    </div>
                    <div class="bill-right">
                      <span class="bill-amount">{{ bill.amount | currencyFormat }}</span>
                      <span [class]="'bill-badge ' + (bill.isPaid ? 'badge-paid' : 'badge-upcoming')">
                        {{ bill.isPaid ? 'Paid' : 'Upcoming' }}
                      </span>
                    </div>
                  </div>
                }
              </div>
            }
          </div>
        </div>
      </div>
    </div>

    <!-- Transactions Detail Drawer -->
    @if (selectedCategoryForTxns()) {
      @let catId = selectedCategoryForTxns()!;
      @let cat = categoryService.getCategoryById(catId);
      @let budget = getBudgetForCategory(catId);
      <div class="drawer-overlay" (click)="closeTransactionsDrawer()">
        <div class="drawer" (click)="$event.stopPropagation()">
          <div class="drawer-header" [style.border-left]="'4px solid ' + (cat?.color || 'var(--accent-blue)')">
            <div class="drawer-header-title">
              <span class="drawer-icon">{{ cat?.icon || '💰' }}</span>
              <div class="drawer-title-group">
                <h3>{{ cat?.name || catId }}</h3>
                <p class="drawer-subtitle">Spending details for {{ monthName }} {{ selectedYear }}</p>
              </div>
            </div>
            <button class="btn btn-ghost btn-icon" (click)="closeTransactionsDrawer()">✕</button>
          </div>

          <div class="drawer-body">
            <!-- Pacing / Limit mini card -->
            <div class="drawer-stats-card">
              <div class="ds-stat">
                <span class="ds-label">Spent</span>
                <span class="ds-value text-expense">{{ (budget?.spent || getCategorySpent(catId)) | currencyFormat }}</span>
              </div>
              <div class="ds-divider"></div>
              <div class="ds-stat">
                <span class="ds-label">Limit</span>
                <span class="ds-value">{{ budget && !budget.isUnbudgeted ? (budget.amount | currencyFormat) : 'No Limit' }}</span>
              </div>
              @if (budget && !budget.isUnbudgeted) {
                <div class="ds-divider"></div>
                <div class="ds-stat">
                  <span class="ds-label">Remaining</span>
                  <span class="ds-value" [class.text-income]="budget.remaining >= 0" [class.text-expense]="budget.remaining < 0">
                    {{ budget.remaining | currencyFormat }}
                  </span>
                </div>
              }
            </div>

            <!-- Transaction List -->
            <h4 class="section-title">Transactions ({{ selectedCategoryTransactions().length }})</h4>
            @if (selectedCategoryTransactions().length === 0) {
              <div class="empty-state">
                <span class="empty-icon">💸</span>
                <p>No transactions recorded in this category for {{ monthName }}.</p>
              </div>
            } @else {
              <div class="drawer-txn-list">
                @for (txn of selectedCategoryTransactions(); track txn.id) {
                  <div class="drawer-txn-item">
                    <div class="dt-info">
                      <span class="dt-desc font-semibold">{{ txn.description }}</span>
                      <span class="dt-meta text-muted">
                        {{ formatDate(txn.date) }} · Account: {{ getAccountName(txn.accountId) }}
                      </span>
                      @if (txn.notes) {
                        <span class="dt-notes" style="font-weight: 500; font-size: 0.75rem;">📝 {{ txn.notes }}</span>
                      }
                    </div>
                    <span class="dt-amount text-expense font-bold">-{{ txn.amount | currencyFormat }}</span>
                  </div>
                }
              </div>
            }
          </div>
        </div>
      </div>
    }

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

    <!-- Budget suggestions modal -->
    @if (showSuggestions()) {
      <div class="modal-overlay" (click)="showSuggestions.set(false)">
        <div class="modal" style="max-width: 650px;" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h3>🔮 AI Budget Optimizer Suggestions</h3>
            <button class="btn btn-ghost btn-icon" (click)="showSuggestions.set(false)">✕</button>
          </div>
          <div class="modal-body" style="padding: 1.25rem; overflow-y: auto;">
            <p style="font-size: 0.8125rem; color: var(--text-secondary); margin-bottom: 1rem; line-height: 1.4;">
              Optimized limits based on recent spending. Fixed categories (Housing, Utilities, Insurance, Healthcare, Taxes) are strictly frozen.
            </p>

            <!-- Plan selector tabs -->
            <div class="type-toggle" style="margin-bottom: 1.25rem;">
              @for (plan of suggestionPlans(); track plan.name) {
                <button type="button" class="type-btn" 
                        [class.active-income]="selectedPlan() === plan.name && plan.name === 'Conservative'"
                        [class.active-transfer]="selectedPlan() === plan.name && plan.name === 'Moderate'"
                        [class.active-expense]="selectedPlan() === plan.name && plan.name === 'Aggressive'"
                        (click)="selectedPlan.set(plan.name)">
                  {{ plan.name }} Plan
                </button>
              }
            </div>

            @let currentPlanObj = getCurrentPlan();
            @if (currentPlanObj) {
              <!-- Plan Summary -->
              <div style="background: rgba(255, 255, 255, 0.02); padding: 1rem; border-radius: var(--radius-md); border: 1px solid var(--border); margin-bottom: 1.25rem;">
                <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.5rem;">
                  <span style="font-weight: 700; font-size: 1.05rem;">Estimated Monthly Savings:</span>
                  <span style="font-size: 1.25rem; font-weight: 800; color: var(--income-color);">
                    {{ currentPlanObj.totalSavings | currencyFormat }}/mo
                  </span>
                </div>
                <p style="font-size: 0.8125rem; line-height: 1.45; color: var(--text-secondary); margin: 0;">
                  {{ currentPlanObj.description }}
                </p>
              </div>

              <!-- Proposed Modifications Table -->
              <div class="table-wrapper" style="max-height: 250px; overflow-y: auto;">
                <table>
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th class="text-right">Current</th>
                      <th class="text-right">Proposed</th>
                      <th class="text-right">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (mod of currentPlanObj.modifications; track mod.categoryId) {
                      <tr>
                        <td>
                          <div style="display: flex; align-items: center; gap: 0.375rem;">
                            <span>{{ getCategoryIcon(mod.categoryId) }}</span>
                            <span class="font-semibold">{{ mod.categoryName }}</span>
                          </div>
                        </td>
                        <td class="text-right text-muted">{{ mod.currentAmount | currencyFormat }}</td>
                        <td class="text-right font-semibold text-income">{{ mod.proposedAmount | currencyFormat }}</td>
                        <td class="text-right font-semibold" 
                            [class.text-expense]="mod.percentageCut > 0" 
                            [class.text-muted]="mod.percentageCut === 0">
                          {{ mod.percentageCut > 0 ? '-' + mod.percentageCut + '%' : 'Frozen (0%)' }}
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>
          <div class="modal-footer" style="display: flex; justify-content: space-between;">
            <button class="btn btn-ghost" (click)="showSuggestions.set(false)">Cancel</button>
            <button class="btn btn-primary" (click)="applySuggestions(currentPlanObj)" [disabled]="applyingPlan() || !currentPlanObj">
              @if (applyingPlan()) {
                <span class="btn-spinner-sm"></span>
                <span>Applying...</span>
              } @else {
                <span>Apply {{ selectedPlan() }} Plan</span>
              }
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

    .budgets-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1rem; }

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

    .type-toggle { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.75rem; }
    .type-btn { border: 1px solid var(--border); border-radius: var(--radius-md); padding: 0.875rem; font-size: 0.9375rem; font-family: inherit; background: var(--bg-input); color: var(--text-secondary); cursor: pointer; transition: var(--transition); font-weight: 500; }
    .type-btn:hover { border-color: var(--border-light); color: var(--text-primary); }
    .type-btn.active-income { background: rgba(76,175,80,0.15); border-color: rgba(76,175,80,0.4); color: var(--income-color); font-weight: 600; }
    .type-btn.active-expense { background: rgba(239,83,80,0.15); border-color: rgba(239,83,80,0.4); color: var(--expense-color); font-weight: 600; }
    .type-btn.active-transfer { background: rgba(92,107,192,0.15); border-color: rgba(92,107,192,0.4); color: var(--accent-blue-light); font-weight: 600; }

    @media (max-width: 640px) { .budgets-page { padding: 1rem; } }
    @media (max-width: 600px) {
      .period-selector {
        flex-direction: column;
        align-items: stretch;
        gap: 0.75rem;
        padding: 0.75rem;
      }
      .period-controls { justify-content: center; }
      .period-summary {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 0.5rem;
        width: 100%;
        text-align: center;
      }
      .ps-divider { display: none; }
      .ps-item { align-items: center; }
    }

    /* Pacing Card Styling */
    .pacing-card {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      padding: 1.25rem;
      border-radius: var(--radius-lg);
      transition: var(--transition);
      margin-bottom: 0.5rem;
    }
    .pacing-card.status-success {
      border: 1px solid rgba(76, 175, 80, 0.3);
      background: linear-gradient(135deg, rgba(76, 175, 80, 0.08) 0%, rgba(30, 33, 48, 0.95) 100%);
    }
    .pacing-card.status-warning {
      border: 1px solid rgba(255, 193, 7, 0.3);
      background: linear-gradient(135deg, rgba(255, 193, 7, 0.08) 0%, rgba(30, 33, 48, 0.95) 100%);
    }
    .pacing-card.status-info {
      border: 1px solid rgba(121, 134, 203, 0.3);
      background: linear-gradient(135deg, rgba(121, 134, 203, 0.08) 0%, rgba(30, 33, 48, 0.95) 100%);
    }
    .pacing-card.status-danger {
      border: 1px solid rgba(239, 83, 80, 0.3);
      background: linear-gradient(135deg, rgba(239, 83, 80, 0.08) 0%, rgba(30, 33, 48, 0.95) 100%);
    }
    .pacing-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      flex-wrap: wrap;
      gap: 1rem;
    }
    .pacing-title {
      display: flex;
      align-items: center;
      gap: 0.875rem;
      flex: 1;
      min-width: 250px;
    }
    .pacing-icon {
      font-size: 2rem;
      flex-shrink: 0;
    }
    .pacing-text-group {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .pacing-heading {
      font-size: 1.05rem;
      font-weight: 700;
      margin: 0;
    }
    .pacing-description {
      font-size: 0.8125rem;
      color: var(--text-secondary);
      margin: 0;
      line-height: 1.45;
    }
    .pacing-breakdown {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
      font-size: 0.75rem;
      background: rgba(0, 0, 0, 0.2);
      padding: 0.625rem 0.875rem;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border);
      min-width: 220px;
    }
    .pb-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: var(--text-secondary);
    }
    .pb-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
    }
    .pb-dot.budgeted {
      background: var(--accent-blue-light);
    }
    .pb-dot.recurring {
      background: var(--accent-cyan);
    }
    .pb-total {
      border-top: 1px solid var(--border);
      padding-top: 0.375rem;
      margin-top: 0.125rem;
      color: var(--text-primary);
      font-weight: 600;
    }
    .pacing-progress-container {
      display: flex;
      flex-direction: column;
      gap: 0.625rem;
      position: relative;
    }
    .pacing-progress-bar {
      height: 14px;
      background: var(--border);
      border-radius: 100px;
      position: relative;
      overflow: visible;
    }
    .pacing-fill {
      height: 100%;
      border-radius: 100px;
      transition: width 0.5s ease;
    }
    .pacing-card.status-success .pacing-fill { background: var(--accent-green); }
    .pacing-card.status-warning .pacing-fill { background: var(--accent-yellow); }
    .pacing-card.status-info .pacing-fill { background: var(--accent-blue-light); }
    .pacing-card.status-danger .pacing-fill { background: var(--accent-red); }

    .time-marker {
      position: absolute;
      top: -3px;
      bottom: -3px;
      width: 3px;
      background: #ffffff;
      box-shadow: 0 0 8px #ffffff;
      z-index: 2;
      transform: translateX(-50%);
      pointer-events: none;
      border-radius: 2px;
    }
    .pacing-progress-labels {
      display: flex;
      justify-content: space-between;
      font-size: 0.7rem;
      color: var(--text-muted);
      position: relative;
      height: 18px;
    }
    .time-label-indicator {
      position: absolute;
      transform: translateX(-50%);
      color: #ffffff;
      font-weight: 600;
      background: var(--bg-card-hover);
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
      font-size: 0.65rem;
      border: 1px solid var(--border-light);
      white-space: nowrap;
      top: -2px;
    }
    .budget-card.unbudgeted {
      border: 1px dashed var(--border-light);
      background: rgba(255, 255, 255, 0.01);
      opacity: 0.85;
    }
    .budget-card.unbudgeted:hover {
      border-color: var(--text-muted);
      background: rgba(255, 255, 255, 0.03);
      opacity: 1;
    }
    .unbudgeted-bar {
      border: 1px dashed var(--border-light);
      border-radius: 4px;
      overflow: hidden;
    }

    /* Slide-out Drawer Styles */
    .drawer-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.65);
      z-index: 1000;
      display: flex;
      justify-content: flex-end;
      animation: fadeIn 0.2s ease;
    }
    .drawer {
      width: 460px;
      height: 100vh;
      background: var(--bg-secondary);
      border-left: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      box-shadow: var(--shadow-lg);
      animation: slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      position: relative;
    }
    @keyframes slideInRight {
      from { transform: translateX(100%); }
      to { transform: translateX(0); }
    }
    .drawer-header {
      padding: 1.25rem 1.5rem;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: var(--bg-card);
    }
    .drawer-header-title {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .drawer-icon {
      font-size: 1.75rem;
    }
    .drawer-title-group {
      display: flex;
      flex-direction: column;
      text-align: left;
    }
    .drawer-subtitle {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin: 0;
    }
    .drawer-body {
      flex: 1;
      padding: 1.5rem;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }
    .drawer-stats-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 1rem;
      display: flex;
      justify-content: space-around;
      align-items: center;
      text-align: center;
    }
    .ds-stat {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
    }
    .ds-label {
      font-size: 0.65rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      font-weight: 600;
    }
    .ds-value {
      font-size: 1.15rem;
      font-weight: 800;
    }
    .ds-divider {
      width: 1px;
      height: 30px;
      background: var(--border);
    }
    .section-title {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      text-align: left;
    }
    .drawer-txn-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .drawer-txn-item {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 0.875rem 1rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      transition: var(--transition);
      text-align: left;
    }
    .drawer-txn-item:hover {
      border-color: var(--border-light);
      background: var(--bg-card-hover);
    }
    .dt-info {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      min-width: 0;
      text-align: left;
    }
    .dt-desc {
      font-size: 0.875rem;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .dt-meta {
      font-size: 0.75rem;
    }
    .dt-amount {
      font-size: 0.875rem;
      flex-shrink: 0;
    }
    .budgets-layout {
      display: grid;
      grid-template-columns: 2.2fr 1fr;
      gap: 1.5rem;
      margin-top: 1rem;
    }
    @media (max-width: 1200px) {
      .budgets-layout {
        grid-template-columns: 1fr;
      }
    }
    .main-budgets-col {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }
    .sidebar-bills-col {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .sidebar-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 1.25rem;
    }
    .sidebar-card h3 {
      font-size: 1rem;
      font-weight: 700;
      margin-top: 0;
      margin-bottom: 1rem;
      color: var(--text-primary);
      text-align: left;
    }
    .bills-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      max-height: 500px;
      overflow-y: auto;
      padding-right: 0.25rem;
    }
    .bill-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 0.75rem 1rem;
      transition: var(--transition);
    }
    .bill-item:hover {
      border-color: var(--border-light);
    }
    .bill-main {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      min-width: 0;
    }
    .bill-icon-box {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.1rem;
      flex-shrink: 0;
    }
    .bill-details {
      display: flex;
      flex-direction: column;
      text-align: left;
      min-width: 0;
    }
    .bill-title {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .bill-meta {
      font-size: 0.7rem;
      color: var(--text-muted);
    }
    .bill-right {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 0.25rem;
      flex-shrink: 0;
    }
    .bill-amount {
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--text-primary);
    }
    .bill-badge {
      font-size: 0.6rem;
      font-weight: 700;
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .bill-badge.badge-paid {
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
    }
    .bill-badge.badge-upcoming {
      background: rgba(99, 102, 241, 0.15);
      color: #818cf8;
    }
    .section-header {
      font-size: 1.15rem;
      font-weight: 700;
      color: var(--text-primary);
      margin-top: 0.5rem;
      margin-bottom: 0.75rem;
      text-align: left;
    }
  `]
})
export class BudgetsComponent implements OnInit {
  budgetService = inject(BudgetService);
  categoryService = inject(CategoryService);
  txnService = inject(TransactionService);
  accountService = inject(AccountService);
  private toast = inject(ToastService);
  private api = inject(ApiService);
  private recurringService = inject(RecurringService);

  protected Math = Math;
  
  selectedCategoryForTxns = signal<string | null>(null);

  selectedCategoryTransactions = computed(() => {
    const catId = this.selectedCategoryForTxns();
    if (!catId) return [];
    const txns = this.txnService.postedNormalizedTransactions();
    const y = this.selectedYear;
    const m = this.selectedMonth - 1; // 0-indexed for Date
    return txns.filter(t => {
      const d = parseLocalDate(t.date);
      return t.category === catId && t.type === 'expense' && d.getFullYear() === y && d.getMonth() === m;
    }).sort((a, b) => b.date.localeCompare(a.date));
  });
  showForm = signal(false);
  editingBudget = signal<Budget | undefined>(undefined);
  deletingBudget = signal<Budget | undefined>(undefined);
  submitting = signal(false);

  loadingSuggestions = signal(false);
  showSuggestions = signal(false);
  suggestionPlans = signal<any[]>([]);
  selectedPlan = signal<string>('Conservative');
  applyingPlan = signal(false);

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
    this.recurringService.loadSchedules().subscribe();
    this.accountService.loadAccounts().subscribe();
  }

  loadData() {
    this.budgetService.loadBudgets(this.selectedYear, this.selectedMonth).subscribe();
    
    // Load transactions for the selected month and year to compute accurate pacing numbers
    const monthStr = String(this.selectedMonth).padStart(2, '0');
    const lastDay = new Date(this.selectedYear, this.selectedMonth, 0).getDate();
    this.txnService.loadTransactions({
      dateFrom: `${this.selectedYear}-${monthStr}-01`,
      dateTo: `${this.selectedYear}-${monthStr}-${lastDay}`
    }).subscribe();
  }

  getBudgetSuggestions() {
    this.loadingSuggestions.set(true);
    this.api.optimizeBudgets().subscribe({
      next: res => {
        this.loadingSuggestions.set(false);
        if (res.success && res.data?.plans) {
          this.suggestionPlans.set(res.data.plans);
          this.selectedPlan.set('Conservative');
          this.showSuggestions.set(true);
        } else {
          this.toast.error(res.error ?? 'Could not generate budget suggestions.');
        }
      },
      error: () => {
        this.loadingSuggestions.set(false);
        this.toast.error('Error connecting to Budget Optimizer service.');
      }
    });
  }

  getCurrentPlan() {
    return this.suggestionPlans().find(p => p.name === this.selectedPlan());
  }

  applySuggestions(plan: any) {
    if (!plan || !plan.modifications) return;
    this.applyingPlan.set(true);

    const currentBudgets = this.budgetService.budgets();
    const saveObservables = plan.modifications.map((mod: any) => {
      const existing = currentBudgets.find(b => b.categoryId === mod.categoryId);
      const data = {
        categoryId: mod.categoryId,
        categoryName: mod.categoryName,
        amount: Number(mod.proposedAmount),
        period: 'monthly' as const,
        month: this.selectedMonth,
        year: this.selectedYear,
      };

      if (existing) {
        return this.budgetService.updateBudget(existing.id, data);
      } else {
        return this.budgetService.createBudget(data);
      }
    });

    import('rxjs').then(({ forkJoin }) => {
      forkJoin(saveObservables).subscribe({
        next: () => {
          this.applyingPlan.set(false);
          this.showSuggestions.set(false);
          this.loadData();
          this.toast.success(`Successfully applied ${plan.name} budget adjustments!`);
        },
        error: () => {
          this.applyingPlan.set(false);
          this.toast.error('An error occurred while saving suggested budgets.');
        }
      });
    });
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

  setBudgetForUnbudgeted(budget: Budget) {
    this.form = {
      categoryId: budget.categoryId,
      categoryName: budget.categoryName,
      amount: null,
      year: budget.year,
      month: budget.month ?? this.selectedMonth
    };
    this.editingBudget.set(undefined);
    this.showForm.set(true);
  }

  closeForm() { this.showForm.set(false); this.editingBudget.set(undefined); }

  openTransactionsDrawer(catId: string) {
    this.selectedCategoryForTxns.set(catId);
  }

  closeTransactionsDrawer() {
    this.selectedCategoryForTxns.set(null);
  }

  getBudgetForCategory(catId: string): (Budget & { isUnbudgeted?: boolean }) | undefined {
    const budgeted = this.budgetService.budgets().find(b => b.categoryId === catId);
    if (budgeted) return budgeted;
    return this.budgetService.unbudgetedSpentCategories().find(b => b.categoryId === catId);
  }

  getCategorySpent(catId: string): number {
    const budget = this.getBudgetForCategory(catId);
    return budget ? budget.spent : 0;
  }

  getAccountName(id: string) {
    const acc = this.accountService.accounts().find(a => a.id === id);
    return acc ? acc.name : id;
  }

  formatDate(dateStr: string) {
    return parseLocalDate(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

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

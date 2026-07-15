import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TransactionService } from '../../core/services/transaction.service';
import { CategoryService } from '../../core/services/category.service';
import { AccountService } from '../../core/services/account.service';
import { ToastService } from '../../core/services/toast.service';
import { HeaderComponent } from '../../layout/header.component';
import { CurrencyFormatPipe } from '../../shared/pipes/currency-format.pipe';
import { TransactionFormComponent } from './transaction-form.component';
import { Transaction } from '../../core/models';
import { advanceDateByFrequency } from '../../shared/utils/date.utils';
import { RecurringService } from '../../core/services/recurring.service';

@Component({
  selector: 'app-transactions',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, HeaderComponent, CurrencyFormatPipe, TransactionFormComponent],
  template: `
    <app-header title="Transactions" subtitle="Track every penny in and out">
      <button class="btn btn-ghost btn-sm" (click)="txnService.exportToCsv()">⬇ Export CSV</button>
      <button class="btn btn-ghost btn-sm" routerLink="/transactions/import">📤 Import CSV</button>
      <button class="btn btn-primary btn-sm" (click)="openForm()">+ Add Transaction</button>
    </app-header>

    <div class="txn-page">

      <!-- Tabs Selector -->
      <div class="type-tabs">
        <button class="tab-btn" [class.active]="activeTab() === 'all'" (click)="activeTab.set('all')">
          💳 All Transactions
        </button>
        <button class="tab-btn" [class.active]="activeTab() === 'recurring'" (click)="activeTab.set('recurring')">
          🔄 Recurring Schedules
        </button>
      </div>

      @if (activeTab() === 'all') {
        <!-- Summary Bar -->
        <div class="summary-bar">
          <div class="summary-item">
            <span class="si-label">Income</span>
            <span class="si-value text-income">{{ txnService.summary().totalIncome | currencyFormat }}</span>
          </div>
          <div class="summary-divider"></div>
          <div class="summary-item">
            <span class="si-label">Expenses</span>
            <span class="si-value text-expense">{{ txnService.summary().totalExpenses | currencyFormat }}</span>
          </div>
          <div class="summary-divider"></div>
          <div class="summary-item">
            <span class="si-label">Net Balance</span>
            <span class="si-value" [class.text-income]="txnService.summary().netBalance >= 0"
                  [class.text-expense]="txnService.summary().netBalance < 0">
              {{ txnService.summary().netBalance | currencyFormat }}
            </span>
          </div>
          <div class="summary-divider"></div>
          <div class="summary-item">
            <span class="si-label">Count</span>
            <span class="si-value">{{ txnService.summary().transactionCount }}</span>
          </div>
        </div>

        <!-- Filters -->
        <div class="card filters-card">
          <div class="filters-row">
            <!-- Search -->
            <div class="search-box">
              <span class="search-icon">🔍</span>
              <input type="text" class="form-control" placeholder="Search transactions..."
                     [ngModel]="txnService.filter().search"
                     (ngModelChange)="txnService.updateFilter({ search: $event })">
            </div>

            <!-- Type filter -->
            <select class="form-control filter-select"
                    [ngModel]="txnService.filter().type"
                    (ngModelChange)="txnService.updateFilter({ type: $event })">
              <option value="all">All Types</option>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
              <option value="transfer">Transfer</option>
            </select>

            <!-- Category filter -->
            <select class="form-control filter-select"
                    [ngModel]="txnService.filter().category"
                    (ngModelChange)="txnService.updateFilter({ category: $event || undefined })">
              <option value="">All Categories</option>
              @for (cat of categoryService.categories(); track cat.id) {
                <option [value]="cat.id">{{ cat.icon }} {{ cat.name }}</option>
              }
            </select>

            <!-- Account filter -->
            <select class="form-control filter-select"
                    [ngModel]="txnService.filter().accountId"
                    (ngModelChange)="txnService.updateFilter({ accountId: $event || undefined })">
              <option value="">All Accounts</option>
              @for (acc of accountService.accounts(); track acc.id) {
                <option [value]="acc.id">{{ acc.type === 'asset' ? '🏦' : '💳' }} {{ acc.name }}</option>
              }
            </select>

            <!-- Recurring filter -->
            <select class="form-control filter-select"
                    [ngModel]="recurringFilter()"
                    (ngModelChange)="recurringFilter.set($event)">
              <option value="all">All</option>
              <option value="recurring">🔄 Recurring only</option>
              <option value="one-time">One-time only</option>
            </select>

            <!-- Date From -->
            <div class="date-filter-group">
              <span class="filter-label">From:</span>
              <input type="date" class="form-control filter-select"
                     [ngModel]="txnService.filter().dateFrom"
                     (ngModelChange)="txnService.updateFilter({ dateFrom: $event || undefined })">
            </div>

            <!-- Date To -->
            <div class="date-filter-group">
              <span class="filter-label">To:</span>
              <input type="date" class="form-control filter-select"
                     [ngModel]="txnService.filter().dateTo"
                     (ngModelChange)="txnService.updateFilter({ dateTo: $event || undefined })">
            </div>

            <!-- Sort By -->
            <select class="form-control filter-select"
                    [ngModel]="sortBy()"
                    (ngModelChange)="sortBy.set($event)">
              <option value="date-desc">📅 Date: Newest first</option>
              <option value="date-asc">📅 Date: Oldest first</option>
              <option value="amount-desc">💰 Amount: High to Low</option>
              <option value="amount-asc">💰 Amount: Low to High</option>
            </select>
 
            <button class="btn btn-ghost btn-sm" (click)="clearFilters()">Clear</button>
          </div>
        </div>

        <!-- Transactions Table -->
        <div class="card">
          @if (txnService.loading()) {
            <div class="loading-state">
              <div class="spinner"></div>
              <p>Loading transactions...</p>
            </div>
          } @else if (displayedTransactions().length === 0) {
            <div class="empty-state">
              <span class="empty-icon">💳</span>
              <h3>No transactions found</h3>
              <p>{{ txnService.transactions().length === 0 ? 'Start by adding your first transaction.' : 'Try adjusting your filters.' }}</p>
              <button class="btn btn-primary" (click)="openForm()">+ Add Transaction</button>
            </div>
          } @else {
            <div class="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Category</th>
                    <th>Account</th>
                    <th>Tags</th>
                    @if (txnService.filter().accountId) {
                      <th class="text-right">Running Balance</th>
                    }
                    <th class="text-right">Amount</th>
                    <th class="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  @for (txn of displayedTransactions(); track txn.id) {
                    <tr [class.recurring-row]="txn.isRecurring" [class.future-row]="isFuture(txn.date)">
                      <td>
                        <div class="date-cell">
                          <span class="date-main">
                            {{ formatDate(txn.date) }}
                            @if (isFuture(txn.date)) {
                              <span class="badge badge-future" title="Future-dated transaction">⏳ Future</span>
                            }
                          </span>
                          @if (txn.isRecurring) {
                            <span class="badge badge-recurring">🔄 {{ txn.recurringFrequency }}</span>
                          }
                        </div>
                      </td>
                      <td>
                        <div class="desc-cell">
                          <span class="cat-icon">{{ getCategoryIcon(txn.category) }}</span>
                          <div>
                            <span class="desc-text">{{ txn.description }}</span>
                            @if (txn.notes) {
                              <span class="desc-note">{{ txn.notes }}</span>
                            }
                          </div>
                        </div>
                      </td>
                      <td>
                        @if (txn.type === 'transfer') {
                          <span class="category-badge" style="background: rgba(92, 107, 192, 0.15); color: var(--accent-blue-light);">
                            🔄 Transfer
                          </span>
                        } @else {
                          <span class="category-badge" [style.background]="getCategoryColor(txn.category) + '22'"
                                [style.color]="getCategoryColor(txn.category)">
                            {{ getCategoryName(txn.category) }}
                          </span>
                        }
                      </td>
                      <td>
                        @if (txn.type === 'transfer') {
                          <span class="text-sm font-semibold text-accent-blue-light" style="display: inline-flex; align-items: center; gap: 0.25rem;">
                            {{ getAccountName(txn.accountId) }} ➔ {{ getAccountName(txn.toAccountId || '') }}
                          </span>
                        } @else {
                          <span class="text-muted text-sm">{{ getAccountName(txn.accountId) }}</span>
                        }
                      </td>
                      <td>
                        <div class="tags-cell">
                          @for (tag of txn.tags.slice(0, 2); track tag) {
                            <span class="tag-chip">{{ tag }}</span>
                          }
                          @if (txn.tags.length > 2) {
                            <span class="tag-chip">+{{ txn.tags.length - 2 }}</span>
                          }
                        </div>
                      </td>
                      @if (txnService.filter().accountId) {
                        <td class="text-right font-mono text-muted text-sm" style="font-size: 0.85rem;">
                          {{ runningBalances()[txn.id] | currencyFormat }}
                        </td>
                      }
                      <td class="text-right">
                        <span class="amount-cell" [class.text-income]="txn.type === 'income'"
                              [class.text-expense]="txn.type === 'expense'"
                              [class.text-accent-blue]="txn.type === 'transfer'">
                          {{ txn.type === 'income' ? '+' : txn.type === 'expense' ? '-' : '' }}{{ txn.amount | currencyFormat }}
                        </span>
                      </td>
                      <td class="text-right">
                        @if (txn.stockOrderId) {
                          <span class="badge-invest" style="background: rgba(245,158,11,0.18); color: #f59e0b; font-size: 0.75rem; padding: 0.2rem 0.5rem; border-radius: 100px; font-weight: 600; display: inline-block; cursor: help;" title="Stock Order transaction managed via Investment Account">📈 Stock Order</span>
                        } @else {
                          <div class="action-btns">
                            <button class="btn btn-ghost btn-icon btn-sm" (click)="editTransaction(txn)"
                                    title="Edit" aria-label="Edit transaction">✏️</button>
                            <button class="btn btn-ghost btn-icon btn-sm" (click)="confirmDelete(txn)"
                                    title="Delete" aria-label="Delete transaction">🗑️</button>
                          </div>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      } @else {
        <!-- Recurring Schedules Tab Content -->
        <div class="card">
          @if (txnService.loading()) {
            <div class="loading-state">
              <div class="spinner"></div>
              <p>Loading schedules...</p>
            </div>
          } @else if (recurringSchedules().length === 0) {
            <div class="empty-state">
              <span class="empty-icon">🔄</span>
              <h3>No recurring schedules found</h3>
              <p>Add a recurring transaction to see it listed here.</p>
              <button class="btn btn-primary" (click)="openForm()">+ Add Transaction</button>
            </div>
          } @else {
            <div class="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Category</th>
                    <th>Account</th>
                    <th>Frequency</th>
                    <th>Start Date</th>
                    <th>Next Due Date</th>
                    <th class="text-right">Amount</th>
                    <th class="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  @for (sched of recurringSchedules(); track sched.recurringId) {
                    <tr>
                      <td>
                        <div class="desc-cell">
                          <span class="cat-icon">{{ getCategoryIcon(sched.category) }}</span>
                          <div>
                            <span class="desc-text">{{ sched.description }}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        @if (sched.type === 'transfer') {
                          <span class="category-badge" style="background: rgba(92, 107, 192, 0.15); color: var(--accent-blue-light);">
                            🔄 Transfer
                          </span>
                        } @else {
                          <span class="category-badge" [style.background]="getCategoryColor(sched.category) + '22'"
                                [style.color]="getCategoryColor(sched.category)">
                            {{ getCategoryName(sched.category) }}
                          </span>
                        }
                      </td>
                      <td>
                        @if (sched.type === 'transfer') {
                          <span class="text-sm font-semibold text-accent-blue-light" style="display: inline-flex; align-items: center; gap: 0.25rem;">
                            {{ getAccountName(sched.accountId) }} ➔ {{ getAccountName(sched.toAccountId || '') }}
                          </span>
                        } @else {
                          <span class="text-muted text-sm">{{ getAccountName(sched.accountId) }}</span>
                        }
                      </td>
                      <td>
                        <span class="badge badge-recurring" style="text-transform: capitalize;">
                          🔄 {{ sched.frequency }}
                        </span>
                      </td>
                      <td>
                        <span class="text-muted text-sm">{{ formatDate(sched.startDate) }}</span>
                      </td>
                      <td>
                        <span class="text-sm font-semibold" style="color: var(--accent-blue-light);">
                          {{ formatDate(sched.nextDueDate) }}
                        </span>
                      </td>
                      <td class="text-right">
                        <span class="amount-cell" [class.text-income]="sched.type === 'income'"
                              [class.text-expense]="sched.type === 'expense'"
                              [class.text-accent-blue]="sched.type === 'transfer'">
                          {{ sched.type === 'income' ? '+' : sched.type === 'expense' ? '-' : '' }}{{ sched.amount | currencyFormat }}
                        </span>
                      </td>
                      <td class="text-right">
                        <div class="action-btns">
                          <button class="btn btn-ghost btn-icon btn-sm" (click)="confirmStopSeries(sched.recurringId, sched.description)"
                                  title="Stop Recurrence" aria-label="Stop recurrence">🛑</button>
                          <button class="btn btn-ghost btn-icon btn-sm" (click)="confirmDeleteSeries(sched.recurringId, sched.description)"
                                  title="Delete Series" aria-label="Delete series">🗑️</button>
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      }

    </div>

    <!-- Transaction Form Modal -->
    @if (showForm()) {
      <app-transaction-form
        [transaction]="editingTransaction()"
        (close)="closeForm()"
        (saved)="onSaved()">
      </app-transaction-form>
    }

    <!-- Delete Confirm Modal -->
    @if (deletingTransaction()) {
      <div class="modal-overlay" (click)="cancelDelete()">
        <div class="modal" style="max-width: 400px;" role="alertdialog" aria-modal="true">
          <div class="modal-header">
            <h3>Delete Transaction</h3>
          </div>
          <div class="modal-body">
            <p>Are you sure you want to delete <strong>{{ deletingTransaction()!.description }}</strong>?</p>
            @if (deletingTransaction()!.isRecurring) {
              <p class="text-muted text-sm mt-2" style="color: var(--accent-blue-light);">
                ℹ️ This is a recurring transaction. Deleting this entry only removes this specific occurrence — future auto-generated entries are unaffected.
              </p>
            }
            <p class="text-muted text-sm mt-2">This action cannot be undone.</p>
          </div>
          <div class="modal-footer" [style.flex-direction]="deletingTransaction()!.isRecurring ? 'column' : 'row'" [style.gap]="deletingTransaction()!.isRecurring ? '0.75rem' : '0.5rem'">
            @if (!deletingTransaction()!.isRecurring) {
              <button class="btn btn-ghost" (click)="cancelDelete()">Cancel</button>
              <button class="btn btn-danger" (click)="deleteTransaction()" [disabled]="deleting()">
                {{ deleting() ? 'Deleting...' : 'Delete' }}
              </button>
            } @else {
              <div style="display: flex; gap: 0.5rem; justify-content: flex-end; width: 100%;">
                <button class="btn btn-ghost" (click)="cancelDelete()">Cancel</button>
                <button class="btn btn-danger" (click)="deleteTransaction()" [disabled]="deleting()">
                  Delete Occurrence
                </button>
              </div>
              @if (deletingTransaction()!.recurringId) {
                <div style="border-top: 1px solid var(--border); width: 100%; padding-top: 0.75rem; display: flex; flex-direction: column; gap: 0.5rem;">
                  <button class="btn btn-warning btn-sm" (click)="deleteSeriesFromTxn(deletingTransaction()!.recurringId!, deletingTransaction()!.description)" [disabled]="deleting()">
                    🗑️ Delete Entire Series (All Occurrences)
                  </button>
                  <button class="btn btn-ghost btn-sm" (click)="stopSeriesFromTxn(deletingTransaction()!.recurringId!, deletingTransaction()!.description)" [disabled]="deleting()">
                    🛑 Stop Future Recurrences
                  </button>
                </div>
              }
            }
          </div>
        </div>
      </div>
    }

    <!-- Stop Series Confirm Modal -->
    @if (stoppingSeriesId()) {
      <div class="modal-overlay" (click)="cancelStopSeries()">
        <div class="modal" style="max-width: 400px;" role="alertdialog" aria-modal="true">
          <div class="modal-header">
            <h3>Stop Recurring Series</h3>
          </div>
          <div class="modal-body">
            <p>Are you sure you want to stop the recurring series for <strong>{{ stoppingSeriesName() }}</strong>?</p>
            <p class="text-muted text-sm mt-2">
              This will keep all existing transaction history but will stop generating future transactions for this schedule.
            </p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" (click)="cancelStopSeries()">Cancel</button>
            <button class="btn btn-warning" (click)="stopSeries()">Stop Recurrence</button>
          </div>
        </div>
      </div>
    }

    <!-- Delete Series Confirm Modal -->
    @if (deletingSeriesId()) {
      <div class="modal-overlay" (click)="cancelDeleteSeries()">
        <div class="modal" style="max-width: 400px;" role="alertdialog" aria-modal="true">
          <div class="modal-header">
            <h3>Delete Recurring Series</h3>
          </div>
          <div class="modal-body">
            <p>Are you sure you want to delete the recurring series for <strong>{{ deletingSeriesName() }}</strong>?</p>
            <p class="text-danger text-sm mt-2" style="font-weight: 600;">
              ⚠️ WARNING: This will permanently delete ALL transactions (past and future) associated with this recurring series from your database.
            </p>
            <p class="text-muted text-sm mt-2">This action cannot be undone.</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" (click)="cancelDeleteSeries()">Cancel</button>
            <button class="btn btn-danger" (click)="deleteSeries()">Delete All</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .txn-page { padding: 1.5rem 2rem; display: flex; flex-direction: column; gap: 1rem; }

    /* Tabs */
    .type-tabs { display: flex; gap: 0.5rem; margin-bottom: 0.5rem; flex-wrap: wrap; }
    .tab-btn {
      padding: 0.5rem 1.25rem;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--text-secondary);
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: var(--transition);
      font-family: inherit;
    }
    .tab-btn:hover { background: var(--bg-card); color: var(--text-primary); }
    .tab-btn.active { background: rgba(92, 107, 192, 0.15); color: var(--accent-blue-light); border-color: var(--accent-blue); }

    .summary-bar {
      display: flex;
      align-items: center;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 1rem 1.5rem;
      gap: 1.5rem;
    }
    .summary-item { display: flex; flex-direction: column; gap: 0.25rem; }
    .si-label { font-size: 0.75rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
    .si-value { font-size: 1.25rem; font-weight: 700; }
    .summary-divider { width: 1px; height: 40px; background: var(--border); }

    .filters-card { padding: 1rem 1.25rem; }
    .filters-row { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; }
    .search-box { position: relative; flex: 1; min-width: 200px; }
    .search-icon { position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); font-size: 0.875rem; }
    .search-box .form-control { padding-left: 2.25rem; }
    .filter-select { width: auto; min-width: 140px; }
    .date-filter-group { display: flex; align-items: center; gap: 0.5rem; }
    .filter-label { font-size: 0.75rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase; white-space: nowrap; }

    .loading-state { display: flex; flex-direction: column; align-items: center; gap: 1rem; padding: 3rem; }
    .spinner { width: 32px; height: 32px; border: 3px solid var(--border); border-top-color: var(--accent-blue); border-radius: 50%; animation: spin 0.8s linear infinite; }
    .empty-state { display: flex; flex-direction: column; align-items: center; gap: 0.75rem; padding: 3rem; text-align: center; }
    .empty-icon { font-size: 3rem; }
    .empty-state h3 { color: var(--text-primary); }
    .empty-state p { color: var(--text-muted); }

    .recurring-row { background: rgba(92, 107, 192, 0.03); }
    .badge-recurring {
      display: inline-block;
      background: rgba(92, 107, 192, 0.15);
      color: var(--accent-blue-light);
      border: 1px solid rgba(92, 107, 192, 0.3);
      padding: 0.1rem 0.4rem;
      border-radius: 4px;
      font-size: 0.65rem;
      font-weight: 600;
      margin-top: 0.2rem;
      text-transform: capitalize;
    }

    .future-row {
      background: rgba(255, 193, 7, 0.015);
      border-left: 3px dashed var(--accent-yellow);
    }
    .future-row td {
      opacity: 0.85;
    }
    .badge-future {
      display: inline-block;
      background: rgba(255, 193, 7, 0.12);
      color: var(--accent-yellow);
      border: 1px solid rgba(255, 193, 7, 0.25);
      padding: 0.1rem 0.4rem;
      border-radius: 4px;
      font-size: 0.65rem;
      font-weight: 600;
      margin-left: 0.35rem;
    }

    .date-cell { display: flex; flex-direction: column; gap: 0.25rem; }
    .date-main { font-size: 0.875rem; color: var(--text-primary); }

    .desc-cell { display: flex; align-items: center; gap: 0.625rem; }
    .cat-icon { font-size: 1.1rem; flex-shrink: 0; }
    .desc-text { display: block; font-size: 0.875rem; font-weight: 500; color: var(--text-primary); }
    .desc-note { display: block; font-size: 0.75rem; color: var(--text-muted); }

    .category-badge {
      display: inline-block;
      padding: 0.2rem 0.625rem;
      border-radius: 100px;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .tags-cell { display: flex; gap: 0.25rem; flex-wrap: wrap; }
    .tag-chip {
      background: rgba(92, 107, 192, 0.15);
      color: var(--accent-blue-light);
      padding: 0.15rem 0.5rem;
      border-radius: 100px;
      font-size: 0.7rem;
    }

    .amount-cell { font-size: 0.9375rem; font-weight: 600; }
    .action-btns { display: flex; gap: 0.25rem; justify-content: flex-end; }

    @media (max-width: 768px) {
      .txn-page { padding: 1rem; }
      .summary-bar { flex-wrap: wrap; }
      .filters-row { flex-direction: column; align-items: stretch; width: 100%; }
      .search-box { width: 100%; min-width: 0; }
      .filter-select { width: 100%; min-width: 0; }
      .date-filter-group { width: 100%; }
      .date-filter-group .filter-select { flex: 1; }
    }
  `]
})
export class TransactionsComponent implements OnInit {
  txnService = inject(TransactionService);
  categoryService = inject(CategoryService);
  accountService = inject(AccountService);
  private toast = inject(ToastService);
  recurringService = inject(RecurringService);

  activeTab = signal<'all' | 'recurring'>('all');
  showForm = signal(false);
  editingTransaction = signal<Transaction | undefined>(undefined);
  deletingTransaction = signal<Transaction | undefined>(undefined);
  deleting = signal(false);
  recurringFilter = signal<'all' | 'recurring' | 'one-time'>('all');
  sortBy = signal<'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc'>('date-desc');

  stoppingSeriesId = signal<string | null>(null);
  stoppingSeriesName = signal<string>('');
  deletingSeriesId = signal<string | null>(null);
  deletingSeriesName = signal<string>('');

  isFuture(dateStr: string): boolean {
    const todayStr = new Date().toLocaleDateString('en-CA');
    return dateStr > todayStr;
  }

  runningBalances = computed(() => {
    const filter = this.txnService.filter();
    const accountId = filter.accountId;
    if (!accountId) return {};

    const acc = this.accountService.getAccountById(accountId);
    if (!acc) return {};

    // Get all transactions for this account (posted and future)
    const allTxns = this.txnService.transactions().filter(t => 
      t.accountId === accountId || t.toAccountId === accountId
    );

    // Sort chronologically (oldest first)
    const sorted = [...allTxns].sort((a, b) => {
      if (a.date !== b.date) {
        return a.date.localeCompare(b.date);
      }
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeA - timeB;
    });

    const balances: Record<string, number> = {};
    let currentBalance = Math.abs(acc.initialBalance ?? 0);

    sorted.forEach(t => {
      if (t.accountId === accountId) {
        // Current account is the source/origin
        if (t.type === 'income') {
          currentBalance += t.amount;
        } else if (t.type === 'expense') {
          if (acc.type === 'liability') {
            currentBalance += t.amount; // Owe more
          } else {
            currentBalance -= t.amount; // Asset decreases
          }
        } else if (t.type === 'transfer') {
          if (acc.type === 'liability') {
            currentBalance += t.amount; // Transfer from liability -> owe more
          } else {
            currentBalance -= t.amount; // Transfer from asset -> asset decreases
          }
        }
      } else if (t.toAccountId === accountId) {
        // Current account is the destination of a transfer
        if (t.type === 'transfer') {
          if (acc.type === 'liability') {
            currentBalance -= t.amount; // Transfer to liability -> pay down debt
          } else {
            currentBalance += t.amount; // Transfer to asset -> asset increases
          }
        }
      }
      balances[t.id] = currentBalance;
    });

    return balances;
  });

  recurringSchedules = computed(() => {
    return this.recurringService.schedules().map(s => ({
      recurringId: s.id,
      type: s.type,
      amount: s.amount,
      category: s.category,
      description: s.description,
      frequency: s.frequency,
      startDate: s.startDate,
      nextDueDate: s.nextDueDate,
      accountId: s.accountId,
      toAccountId: s.toAccountId,
    }));
  });

  displayedTransactions() {
    let txns = this.txnService.filteredTransactions();
    const rf = this.recurringFilter();
    if (rf === 'recurring') txns = txns.filter(t => t.isRecurring);
    if (rf === 'one-time') txns = txns.filter(t => !t.isRecurring);

    const sort = this.sortBy();
    const sorted = [...txns];
    if (sort === 'date-desc') {
      sorted.sort((a, b) => b.date.localeCompare(a.date));
    } else if (sort === 'date-asc') {
      sorted.sort((a, b) => a.date.localeCompare(b.date));
    } else if (sort === 'amount-desc') {
      sorted.sort((a, b) => b.amount - a.amount);
    } else if (sort === 'amount-asc') {
      sorted.sort((a, b) => a.amount - b.amount);
    }

    return sorted;
  }

  ngOnInit() {
    this.txnService.loadTransactions().subscribe();
    this.recurringService.loadSchedules().subscribe();
    this.categoryService.loadCategories().subscribe();
    this.accountService.loadAccounts().subscribe();
  }

  openForm() {
    this.editingTransaction.set(undefined);
    this.showForm.set(true);
  }

  editTransaction(txn: Transaction) {
    this.editingTransaction.set(txn);
    this.showForm.set(true);
  }

  closeForm() {
    this.showForm.set(false);
    this.editingTransaction.set(undefined);
  }

  onSaved() {
    this.closeForm();
  }

  confirmDelete(txn: Transaction) {
    this.deletingTransaction.set(txn);
  }

  cancelDelete() {
    this.deletingTransaction.set(undefined);
  }

  deleteTransaction() {
    const txn = this.deletingTransaction();
    if (!txn) return;
    this.deleting.set(true);
    this.txnService.deleteTransaction(txn.id).subscribe(() => {
      this.deleting.set(false);
      this.deletingTransaction.set(undefined);
      this.toast.success('Transaction deleted');
    });
  }

  confirmStopSeries(id: string, name: string) {
    this.stoppingSeriesId.set(id);
    this.stoppingSeriesName.set(name);
  }

  cancelStopSeries() {
    this.stoppingSeriesId.set(null);
    this.stoppingSeriesName.set('');
  }

  stopSeries() {
    const id = this.stoppingSeriesId();
    if (!id) return;
    this.txnService.stopRecurringSeries(id).subscribe({
      next: () => {
        this.toast.success('Recurring series stopped');
        this.cancelStopSeries();
        this.recurringService.loadSchedules().subscribe();
      },
      error: () => {
        this.toast.error('Failed to stop recurring series');
      }
    });
  }

  confirmDeleteSeries(id: string, name: string) {
    this.deletingSeriesId.set(id);
    this.deletingSeriesName.set(name);
  }

  cancelDeleteSeries() {
    this.deletingSeriesId.set(null);
    this.deletingSeriesName.set('');
  }

  deleteSeries() {
    const id = this.deletingSeriesId();
    if (!id) return;
    this.txnService.deleteRecurringSeries(id).subscribe({
      next: () => {
        this.toast.success('Recurring series deleted');
        this.cancelDeleteSeries();
        this.recurringService.loadSchedules().subscribe();
      },
      error: () => {
        this.toast.error('Failed to delete recurring series');
      }
    });
  }

  deleteSeriesFromTxn(recurringId: string, description: string) {
    this.cancelDelete();
    this.confirmDeleteSeries(recurringId, description);
  }

  stopSeriesFromTxn(recurringId: string, description: string) {
    this.cancelDelete();
    this.confirmStopSeries(recurringId, description);
  }

  clearFilters() {
    this.txnService.setFilter({ type: 'all' });
    this.recurringFilter.set('all');
    this.sortBy.set('date-desc');
  }

  getCategoryIcon(id: string) { return this.categoryService.getCategoryIcon(id); }
  getCategoryColor(id: string) { return this.categoryService.getCategoryColor(id); }
  getCategoryName(id: string) { return this.categoryService.getCategoryById(id)?.name ?? id; }
  getAccountName(id: string) {
    const acc = this.accountService.accounts().find(a => a.id === id);
    return acc ? acc.name : id;
  }

  formatDate(date: string): string {
    return new Date(date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
}

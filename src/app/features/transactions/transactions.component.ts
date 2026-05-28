import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TransactionService } from '../../core/services/transaction.service';
import { CategoryService } from '../../core/services/category.service';
import { ToastService } from '../../core/services/toast.service';
import { HeaderComponent } from '../../layout/header.component';
import { CurrencyFormatPipe } from '../../shared/pipes/currency-format.pipe';
import { TransactionFormComponent } from './transaction-form.component';
import { Transaction } from '../../core/models';

@Component({
  selector: 'app-transactions',
  standalone: true,
  imports: [CommonModule, FormsModule, HeaderComponent, CurrencyFormatPipe, TransactionFormComponent],
  template: `
    <app-header title="Transactions" subtitle="Track every penny in and out">
      <button class="btn btn-ghost btn-sm" (click)="txnService.exportToCsv()">⬇ Export CSV</button>
      <button class="btn btn-primary btn-sm" (click)="openForm()">+ Add Transaction</button>
    </app-header>

    <div class="txn-page">

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

          <!-- Date From -->
          <input type="date" class="form-control filter-select"
                 [ngModel]="txnService.filter().dateFrom"
                 (ngModelChange)="txnService.updateFilter({ dateFrom: $event || undefined })"
                 placeholder="From date">

          <!-- Date To -->
          <input type="date" class="form-control filter-select"
                 [ngModel]="txnService.filter().dateTo"
                 (ngModelChange)="txnService.updateFilter({ dateTo: $event || undefined })"
                 placeholder="To date">

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
        } @else if (txnService.filteredTransactions().length === 0) {
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
                  <th>Payment</th>
                  <th>Tags</th>
                  <th class="text-right">Amount</th>
                  <th class="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (txn of txnService.filteredTransactions(); track txn.id) {
                  <tr>
                    <td>
                      <div class="date-cell">
                        <span class="date-main">{{ formatDate(txn.date) }}</span>
                        @if (txn.isRecurring) {
                          <span class="badge badge-neutral" style="font-size: 0.65rem;">🔄 {{ txn.recurringFrequency }}</span>
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
                      <span class="category-badge" [style.background]="getCategoryColor(txn.category) + '22'"
                            [style.color]="getCategoryColor(txn.category)">
                        {{ getCategoryName(txn.category) }}
                      </span>
                    </td>
                    <td>
                      <span class="text-muted text-sm">{{ txn.paymentMethod || '—' }}</span>
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
                    <td class="text-right">
                      <span class="amount-cell" [class.text-income]="txn.type === 'income'"
                            [class.text-expense]="txn.type === 'expense'">
                        {{ txn.type === 'income' ? '+' : '-' }}{{ txn.amount | currencyFormat }}
                      </span>
                    </td>
                    <td class="text-right">
                      <div class="action-btns">
                        <button class="btn btn-ghost btn-icon btn-sm" (click)="editTransaction(txn)"
                                title="Edit" aria-label="Edit transaction">✏️</button>
                        <button class="btn btn-ghost btn-icon btn-sm" (click)="confirmDelete(txn)"
                                title="Delete" aria-label="Delete transaction">🗑️</button>
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
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
            <p class="text-muted text-sm mt-2">This action cannot be undone.</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" (click)="cancelDelete()">Cancel</button>
            <button class="btn btn-danger" (click)="deleteTransaction()" [disabled]="deleting()">
              {{ deleting() ? 'Deleting...' : 'Delete' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .txn-page { padding: 1.5rem 2rem; display: flex; flex-direction: column; gap: 1rem; }

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

    .loading-state { display: flex; flex-direction: column; align-items: center; gap: 1rem; padding: 3rem; }
    .spinner { width: 32px; height: 32px; border: 3px solid var(--border); border-top-color: var(--accent-blue); border-radius: 50%; animation: spin 0.8s linear infinite; }
    .empty-state { display: flex; flex-direction: column; align-items: center; gap: 0.75rem; padding: 3rem; text-align: center; }
    .empty-icon { font-size: 3rem; }
    .empty-state h3 { color: var(--text-primary); }
    .empty-state p { color: var(--text-muted); }

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
      .filters-row { flex-direction: column; }
      .filter-select { width: 100%; }
    }
  `]
})
export class TransactionsComponent implements OnInit {
  txnService = inject(TransactionService);
  categoryService = inject(CategoryService);
  private toast = inject(ToastService);

  showForm = signal(false);
  editingTransaction = signal<Transaction | undefined>(undefined);
  deletingTransaction = signal<Transaction | undefined>(undefined);
  deleting = signal(false);

  ngOnInit() {
    this.txnService.loadTransactions().subscribe();
    this.categoryService.loadCategories().subscribe();
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

  clearFilters() {
    this.txnService.setFilter({ type: 'all' });
  }

  getCategoryIcon(id: string) { return this.categoryService.getCategoryIcon(id); }
  getCategoryColor(id: string) { return this.categoryService.getCategoryColor(id); }
  getCategoryName(id: string) { return this.categoryService.getCategoryById(id)?.name ?? id; }

  formatDate(date: string): string {
    return new Date(date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
}

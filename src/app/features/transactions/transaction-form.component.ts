import { Component, OnInit, inject, signal, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Transaction } from '../../core/models';
import { CategoryService } from '../../core/services/category.service';
import { TransactionService } from '../../core/services/transaction.service';
import { AccountService } from '../../core/services/account.service';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-transaction-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="modal-overlay" (click)="onOverlayClick($event)">
      <div class="modal" role="dialog" aria-modal="true" [attr.aria-label]="editMode ? 'Edit Transaction' : 'Add Transaction'">
        <div class="modal-header">
          <h3>{{ editMode ? 'Edit Transaction' : 'Add Transaction' }}</h3>
          <button class="btn btn-ghost btn-icon" (click)="close.emit()" aria-label="Close">✕</button>
        </div>

        <div class="modal-body">
          <!-- Type Toggle -->
          <div class="type-toggle">
            <button class="type-btn" [class.active-income]="form.type === 'income'"
                    (click)="form.type = 'income'; updateCategories()">
              📈 Income
            </button>
            <button class="type-btn" [class.active-expense]="form.type === 'expense'"
                    (click)="form.type = 'expense'; updateCategories()">
              📉 Expense
            </button>
            <button class="type-btn" [class.active-transfer]="form.type === 'transfer'"
                    (click)="form.type = 'transfer'; updateCategories()">
              🔄 Transfer
            </button>
          </div>

          <div class="form-grid">
            <!-- Amount -->
            <div class="form-group">
              <label class="form-label" for="amount">Amount *</label>
              <div class="input-prefix">
                <span class="prefix">$</span>
                <input id="amount" type="number" class="form-control" [(ngModel)]="form.amount"
                       placeholder="0.00" min="0" step="0.01" required>
              </div>
            </div>

            <!-- Date -->
            <div class="form-group">
              <label class="form-label" for="date">Date *</label>
              <input id="date" type="date" class="form-control" [(ngModel)]="form.date" required>
            </div>

            <!-- Account dropdowns based on type -->
            @if (form.type === 'income') {
              <div class="form-group">
                <label class="form-label" for="accountId">Deposit To *</label>
                <select id="accountId" class="form-control" [(ngModel)]="form.accountId" required>
                  <option value="">Select account...</option>
                  @for (acc of accountService.accounts(); track acc.id) {
                    <option [value]="acc.id">{{ acc.name }} ({{ acc.type | titlecase }})</option>
                  }
                </select>
              </div>
            } @else if (form.type === 'expense') {
              <div class="form-group">
                <label class="form-label" for="accountId">Pay From *</label>
                <select id="accountId" class="form-control" [(ngModel)]="form.accountId" required>
                  <option value="">Select account...</option>
                  @for (acc of accountService.accounts(); track acc.id) {
                    <option [value]="acc.id">{{ acc.name }} ({{ acc.type | titlecase }})</option>
                  }
                </select>
              </div>
            } @else if (form.type === 'transfer') {
              <div class="form-group">
                <label class="form-label" for="accountId">From Account *</label>
                <select id="accountId" class="form-control" [(ngModel)]="form.accountId" required>
                  <option value="">Select account...</option>
                  @for (acc of accountService.accounts(); track acc.id) {
                    <option [value]="acc.id">{{ acc.name }} ({{ acc.type | titlecase }})</option>
                  }
                </select>
              </div>
              <div class="form-group">
                <label class="form-label" for="toAccountId">To Account *</label>
                <select id="toAccountId" class="form-control" [(ngModel)]="form.toAccountId" required>
                  <option value="">Select account...</option>
                  @for (acc of accountService.accounts(); track acc.id) {
                    <option [value]="acc.id">{{ acc.name }} ({{ acc.type | titlecase }})</option>
                  }
                </select>
              </div>
            }

            <!-- Category -->
            @if (form.type !== 'transfer') {
              <div class="form-group">
                <label class="form-label" for="category">Category *</label>
                <select id="category" class="form-control" [(ngModel)]="form.category" required>
                  <option value="">Select category...</option>
                  @for (cat of availableCategories(); track cat.id) {
                    <option [value]="cat.id">{{ cat.icon }} {{ cat.name }}</option>
                  }
                </select>
              </div>
            }



            <!-- Description -->
            <div class="form-group span-2">
              <label class="form-label" for="desc">Description *</label>
              <input id="desc" type="text" class="form-control" [(ngModel)]="form.description"
                     placeholder="What was this for?" required>
            </div>

            <!-- Tags -->
            <div class="form-group span-2">
              <label class="form-label">Tags</label>
              <div class="tags-input">
                <div class="tags-list">
                  @for (tag of form.tags; track tag) {
                    <span class="tag">{{ tag }} <button (click)="removeTag(tag)" aria-label="Remove tag">✕</button></span>
                  }
                </div>
                <input type="text" class="form-control" [(ngModel)]="tagInput"
                       placeholder="Add tag and press Enter"
                       (keydown.enter)="addTag($event)">
              </div>
            </div>

            <!-- Notes -->
            <div class="form-group span-2">
              <label class="form-label" for="notes">Notes</label>
              <textarea id="notes" class="form-control" [(ngModel)]="form.notes"
                        placeholder="Additional notes..." rows="2"></textarea>
            </div>

            <!-- Recurring -->
            <div class="form-group span-2">
              <label class="recurring-toggle">
                <input type="checkbox" [(ngModel)]="form.isRecurring" name="isRecurring">
                <span>🔄 Repeat automatically</span>
              </label>
              @if (form.isRecurring) {
                <select class="form-control mt-2" [(ngModel)]="form.recurringFrequency" name="recurringFrequency">
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly (same date each month)</option>
                  <option value="yearly">Yearly</option>
                </select>
                <p class="recurring-hint">The app will automatically add this transaction next {{ form.recurringFrequency }} on the same date.</p>
              }
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-ghost" (click)="close.emit()">Cancel</button>
          <button class="btn" [class.btn-success]="form.type === 'income'" [class.btn-danger]="form.type === 'expense'" [class.btn-transfer]="form.type === 'transfer'"
                  (click)="submit()" [disabled]="submitting() || !isValid()">
            {{ submitting() ? 'Saving...' : (editMode ? 'Update' : 'Add') + ' ' + (form.type === 'income' ? 'Income' : form.type === 'expense' ? 'Expense' : 'Transfer') }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .type-toggle {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1.25rem;
      background: var(--bg-input);
      padding: 0.25rem;
      border-radius: var(--radius-sm);
    }
    .type-btn {
      flex: 1;
      padding: 0.625rem;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: var(--text-secondary);
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: var(--transition);
      font-family: inherit;
    }
    .type-btn.active-income { background: rgba(76, 175, 80, 0.2); color: var(--income-color); }
    .type-btn.active-expense { background: rgba(239, 83, 80, 0.2); color: var(--expense-color); }
    .type-btn.active-transfer { background: rgba(92, 107, 192, 0.2); color: var(--accent-blue-light); }
    .btn-transfer { background: var(--accent-blue); color: #fff; }
    .btn-transfer:hover:not(:disabled) { background: var(--accent-blue-light); }

    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .span-2 { grid-column: span 2; }

    .input-prefix { position: relative; }
    .prefix {
      position: absolute;
      left: 0.875rem;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-muted);
      font-weight: 600;
    }
    .input-prefix .form-control { padding-left: 1.75rem; }

    .tags-input { display: flex; flex-direction: column; gap: 0.5rem; }
    .tags-list { display: flex; flex-wrap: wrap; gap: 0.375rem; }
    .tag {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      background: rgba(92, 107, 192, 0.2);
      color: var(--accent-blue-light);
      padding: 0.2rem 0.5rem;
      border-radius: 100px;
      font-size: 0.75rem;
    }
    .tag button { background: none; border: none; color: inherit; cursor: pointer; font-size: 0.7rem; padding: 0; }

    .recurring-toggle {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
      font-size: 0.875rem;
      color: var(--text-secondary);
    }
    .recurring-toggle input { accent-color: var(--accent-blue); }
    .recurring-hint {
      margin: 0.375rem 0 0;
      font-size: 0.75rem;
      color: var(--accent-blue-light);
      opacity: 0.85;
    }
    .mt-2 { margin-top: 0.5rem; }
  `]
})
export class TransactionFormComponent implements OnInit {
  @Input() transaction?: Transaction;
  @Output() close = new EventEmitter<void>();
  @Output() saved = new EventEmitter<Transaction>();

  private categoryService = inject(CategoryService);
  private txnService = inject(TransactionService);
  accountService = inject(AccountService);
  private toast = inject(ToastService);

  submitting = signal(false);
  availableCategories = signal(this.categoryService.expenseCategories());
  tagInput = '';

  form = {
    type: 'expense' as 'income' | 'expense' | 'transfer',
    amount: null as number | null,
    category: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
    tags: [] as string[],
    isRecurring: false,
    recurringFrequency: 'monthly' as string,
    notes: '',
    accountId: '',
    toAccountId: '',
  };

  get editMode() { return !!this.transaction; }

  ngOnInit() {
    this.accountService.loadAccounts().subscribe();
    if (this.transaction) {
      this.form = {
        type: this.transaction.type,
        amount: this.transaction.amount,
        category: this.transaction.category,
        description: this.transaction.description,
        date: this.transaction.date,
        tags: [...this.transaction.tags],
        isRecurring: this.transaction.isRecurring,
        recurringFrequency: this.transaction.recurringFrequency ?? 'monthly',
        notes: this.transaction.notes ?? '',
        accountId: this.transaction.accountId ?? '',
        toAccountId: this.transaction.toAccountId ?? '',
      };
    }
    this.updateCategories();
  }

  updateCategories() {
    const previousCategory = this.form.category;
    if (this.form.type === 'income') {
      this.availableCategories.set(this.categoryService.incomeCategories());
      // Only clear if old category isn't valid for income
      const stillValid = this.categoryService.incomeCategories().some(c => c.id === previousCategory);
      if (!stillValid) this.form.category = '';
    } else if (this.form.type === 'expense') {
      this.availableCategories.set(this.categoryService.expenseCategories());
      // Only clear if old category isn't valid for expense
      const stillValid = this.categoryService.expenseCategories().some(c => c.id === previousCategory);
      if (!stillValid) this.form.category = '';
    } else {
      // Transfer: no category needed
      this.availableCategories.set([]);
    }
  }

  addTag(event: Event) {
    event.preventDefault();
    const tag = this.tagInput.trim();
    if (tag && !this.form.tags.includes(tag)) {
      this.form.tags = [...this.form.tags, tag];
    }
    this.tagInput = '';
  }

  removeTag(tag: string) {
    this.form.tags = this.form.tags.filter(t => t !== tag);
  }

  isValid(): boolean {
    if (this.form.type === 'transfer') {
      return !!(
        this.form.amount &&
        this.form.amount > 0 &&
        this.form.description &&
        this.form.date &&
        this.form.accountId &&
        this.form.toAccountId &&
        this.form.accountId !== this.form.toAccountId
      );
    }
    return !!(
      this.form.amount &&
      this.form.amount > 0 &&
      this.form.accountId &&
      this.form.category &&
      this.form.description &&
      this.form.date
    );
  }

  submit() {
    if (!this.isValid()) return;
    this.submitting.set(true);

    const data = {
      type: this.form.type,
      amount: Number(this.form.amount),
      category: this.form.type === 'transfer' ? '' : this.form.category,
      description: this.form.description,
      date: this.form.date,
      tags: this.form.tags,
      isRecurring: this.form.isRecurring,
      recurringFrequency: this.form.isRecurring ? this.form.recurringFrequency : undefined,
      paymentMethod: undefined,
      notes: this.form.notes || undefined,
      accountId: this.form.accountId,
      toAccountId: this.form.type === 'transfer' ? this.form.toAccountId : undefined,
    };

    const obs = this.editMode
      ? this.txnService.updateTransaction(this.transaction!.id, data as Partial<Transaction>)
      : this.txnService.createTransaction(data as Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>);

    obs.subscribe(res => {
      this.submitting.set(false);
      if (res) {
        this.toast.success(this.editMode ? 'Transaction updated!' : 'Transaction added!');
        this.saved.emit(res.data);
        this.close.emit();
      } else {
        this.toast.error('Failed to save transaction');
      }
    });
  }

  onOverlayClick(event: MouseEvent) {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      this.close.emit();
    }
  }
}

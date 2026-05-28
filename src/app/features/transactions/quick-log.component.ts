import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TransactionService } from '../../core/services/transaction.service';
import { CategoryService } from '../../core/services/category.service';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-quick-log',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="quick-log-page">
      <div class="quick-log-card card">
        <div class="page-header">
          <div>
            <p class="eyebrow">Quick Log</p>
            <h1>Fast expense entry</h1>
            <p class="subtitle">Capture spending or income with a simple mobile-friendly form.</p>
          </div>
          <button class="btn btn-ghost" (click)="router.navigate(['/transactions'])">Back to transactions</button>
        </div>

        <div class="type-toggle">
          <button type="button" class="type-btn" [class.active-income]="form.type === 'income'"
                  (click)="setType('income')">📈 Income</button>
          <button type="button" class="type-btn" [class.active-expense]="form.type === 'expense'"
                  (click)="setType('expense')">📉 Expense</button>
        </div>

        <form class="quick-form" (ngSubmit)="submit()">
          <div class="form-group">
            <label for="amount">Amount *</label>
            <div class="input-prefix">
              <span class="prefix">$</span>
              <input id="amount" type="number" min="0" step="0.01" class="form-control"
                     [(ngModel)]="form.amount" name="amount" placeholder="0.00" required>
            </div>
          </div>

          <div class="form-group">
            <label for="description">Description *</label>
            <input id="description" type="text" class="form-control" [(ngModel)]="form.description"
                   name="description" placeholder="What was this for?" required>
          </div>

          <div class="form-group">
            <label for="category">Category *</label>
            <select id="category" class="form-control" [(ngModel)]="form.category" name="category" required>
              <option value="">Choose a category</option>
              @for (cat of (form.type === 'income' ? categoryService.incomeCategories() : categoryService.expenseCategories()); track cat.id) {
                <option [value]="cat.id">{{ cat.icon }} {{ cat.name }}</option>
              }
            </select>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="date">Date *</label>
              <input id="date" type="date" class="form-control" [(ngModel)]="form.date" name="date" required>
            </div>

            <div class="form-group">
              <label for="paymentMethod">Payment</label>
              <select id="paymentMethod" class="form-control" [(ngModel)]="form.paymentMethod" name="paymentMethod">
                <option value="">Auto / other</option>
                <option value="Cash">Cash</option>
                <option value="Credit Card">Credit Card</option>
                <option value="Debit Card">Debit Card</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="PayPal">PayPal</option>
              </select>
            </div>
          </div>

          <button class="btn btn-primary btn-lg" type="submit" [disabled]="submitting() || !isValid()">
            {{ submitting() ? 'Saving...' : 'Save transaction' }}
          </button>
        </form>
      </div>
    </section>
  `,
  styles: [`
    .quick-log-page {
      padding: 1.5rem 1rem;
      display: flex;
      justify-content: center;
      min-height: calc(100vh - 4rem);
      background: var(--bg-page);
    }
    .quick-log-card {
      width: min(100%, 600px);
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      padding: 1.5rem;
      border-radius: var(--radius-lg);
      background: var(--bg-card);
      border: 1px solid var(--border);
    }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
    }
    .eyebrow {
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: var(--accent-blue-light);
      margin-bottom: 0.25rem;
    }
    h1 {
      margin: 0;
      font-size: 1.5rem;
      line-height: 1.2;
    }
    .subtitle {
      margin: 0.5rem 0 0;
      color: var(--text-muted);
      max-width: 44rem;
    }
    .type-toggle {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0.75rem;
    }
    .type-btn {
      appearance: none;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 0.9rem;
      font-size: 0.95rem;
      background: var(--bg-input);
      color: var(--text-primary);
      cursor: pointer;
      transition: var(--transition);
    }
    .type-btn.active-income { background: rgba(76, 175, 80, 0.18); border-color: rgba(76, 175, 80, 0.4); }
    .type-btn.active-expense { background: rgba(239, 83, 80, 0.18); border-color: rgba(239, 83, 80, 0.4); }
    .quick-form {
      display: grid;
      gap: 1rem;
    }
    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }
    .form-group { display: grid; gap: 0.5rem; }
    .form-group label { font-size: 0.9rem; color: var(--text-secondary); }
    .form-control {
      width: 100%;
      padding: 0.9rem 1rem;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: var(--bg-input);
      color: var(--text-primary);
      font: inherit;
    }
    .input-prefix { position: relative; }
    .prefix {
      position: absolute;
      left: 1rem;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-muted);
      font-weight: 600;
    }
    .input-prefix .form-control { padding-left: 2.4rem; }
    .btn-lg { width: 100%; padding: 0.95rem 1rem; }

    @media (max-width: 760px) {
      .quick-log-card { padding: 1.25rem; }
      .page-header { flex-direction: column; align-items: stretch; }
      .form-row { grid-template-columns: 1fr; }
    }
  `]
})
export class QuickLogComponent implements OnInit {
  router = inject(Router);
  txnService = inject(TransactionService);
  categoryService = inject(CategoryService);
  toast = inject(ToastService);

  submitting = signal(false);

  form = {
    type: 'expense' as 'income' | 'expense',
    amount: null as number | null,
    category: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
    paymentMethod: '',
    notes: ''
  };

  ngOnInit() {
    this.categoryService.loadCategories().subscribe();
  }

  setType(type: 'income' | 'expense') {
    this.form.type = type;
    if (type === 'income' && this.categoryService.expenseCategories().some(cat => cat.id === this.form.category)) {
      this.form.category = '';
    }
    if (type === 'expense' && this.categoryService.incomeCategories().some(cat => cat.id === this.form.category)) {
      this.form.category = '';
    }
  }

  isValid() {
    return !!this.form.amount && this.form.amount > 0 && this.form.category && this.form.description.trim();
  }

  submit() {
    if (!this.isValid()) {
      this.toast.error('Please fill in the required fields');
      return;
    }

    this.submitting.set(true);
    this.txnService.createTransaction({
      type: this.form.type,
      amount: Number(this.form.amount),
      category: this.form.category,
      description: this.form.description.trim(),
      date: this.form.date,
      tags: [],
      isRecurring: false,
      paymentMethod: this.form.paymentMethod || undefined,
      notes: this.form.notes || undefined,
    }).subscribe(res => {
      this.submitting.set(false);
      if (res?.success) {
        this.toast.success('Transaction logged');
        this.router.navigate(['/transactions']);
      } else {
        this.toast.error('Could not save transaction');
      }
    });
  }
}

import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TransactionService } from '../../core/services/transaction.service';
import { CategoryService } from '../../core/services/category.service';
import { AccountService } from '../../core/services/account.service';
import { ToastService } from '../../core/services/toast.service';
import { ApiService } from '../../core/services/api.service';
import { CurrencyFormatPipe } from '../../shared/pipes/currency-format.pipe';
import { RecurringService } from '../../core/services/recurring.service';
import { SettingsService } from '../../core/services/settings.service';
import { CategorySelectComponent } from '../../shared/components/category-select.component';

@Component({
  selector: 'app-quick-log',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, CurrencyFormatPipe, CategorySelectComponent],
  templateUrl: './quick-log.component.html',
  styles: [`
    :host {
      display: block;
      height: 100%;
      width: 100%;
    }
    .quick-log-page {
      padding: 1.5rem 1rem;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      width: 100%;
      box-sizing: border-box;
      overflow: hidden;
    }
    .quick-log-card {
      width: min(100%, 580px);
      max-height: calc(100% - 3rem);
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      padding: 1.75rem;
      overflow-y: auto;
    }
    .page-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; }
    .eyebrow { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.12em; color: var(--accent-blue-light); margin-bottom: 0.25rem; }
    h1 { margin: 0; font-size: 1.5rem; line-height: 1.2; color: var(--text-primary); }
    .subtitle { margin: 0.375rem 0 0; color: var(--text-muted); font-size: 0.875rem; }
    .success-flash { display: flex; align-items: center; gap: 0.875rem; padding: 0.875rem 1rem; background: rgba(76,175,80,0.12); border: 1px solid rgba(76,175,80,0.3); border-radius: var(--radius-md); animation: slideUp 0.25s ease; }
    .success-icon { font-size: 1.25rem; flex-shrink: 0; }
    .success-title { display: block; font-size: 0.875rem; font-weight: 600; color: var(--income-color); }
    .success-sub { display: block; font-size: 0.75rem; color: var(--text-muted); }
    .type-toggle { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.75rem; }
    .type-btn { border: 1px solid var(--border); border-radius: var(--radius-md); padding: 0.875rem; font-size: 0.9375rem; font-family: inherit; background: var(--bg-input); color: var(--text-secondary); cursor: pointer; transition: var(--transition); font-weight: 500; }
    .type-btn:hover { border-color: var(--border-light); color: var(--text-primary); }
    .type-btn.active-income { background: rgba(76,175,80,0.15); border-color: rgba(76,175,80,0.4); color: var(--income-color); font-weight: 600; }
    .type-btn.active-expense { background: rgba(239,83,80,0.15); border-color: rgba(239,83,80,0.4); color: var(--expense-color); font-weight: 600; }
    .type-btn.active-transfer { background: rgba(92,107,192,0.15); border-color: rgba(92,107,192,0.4); color: var(--accent-blue-light); font-weight: 600; }
    .quick-form { display: grid; gap: 1rem; }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .form-group { display: grid; gap: 0.375rem; }
    .form-group label { font-size: 0.8125rem; font-weight: 500; color: var(--text-secondary); }
    .optional { color: var(--text-muted); font-weight: 400; }
    .input-prefix { position: relative; }
    .prefix { position: absolute; left: 0.875rem; top: 50%; transform: translateY(-50%); color: var(--text-muted); font-weight: 600; }
    .input-prefix .form-control { padding-left: 1.75rem; }
    .btn-lg { width: 100%; padding: 0.9rem; font-size: 1rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem; }
    .btn-spinner-sm { width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: spin 0.8s linear infinite; }
    .recent-section { border-top: 1px solid var(--border); padding-top: 1rem; }
    .recent-label { font-size: 0.75rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.625rem; }
    .recent-list { display: flex; flex-direction: column; gap: 0.375rem; }
    .recent-item { display: flex; align-items: center; gap: 0.625rem; padding: 0.5rem 0.625rem; border-radius: var(--radius-sm); transition: var(--transition); }
    .recent-item:hover { background: var(--bg-card-hover); }
    .recent-icon { font-size: 1rem; flex-shrink: 0; width: 24px; text-align: center; }
    .recent-info { display: flex; flex-direction: column; flex: 1; min-width: 0; gap: 0.125rem; }
    .recent-desc { font-size: 0.8125rem; font-weight: 500; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .recent-cat { font-size: 0.7rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .recent-amount { font-size: 0.8125rem; font-weight: 600; flex-shrink: 0; }
    .category-label-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.125rem; }
    .ai-categorize-badge { font-size: 0.7rem; font-weight: 600; padding: 0.125rem 0.375rem; border-radius: 4px; display: inline-flex; align-items: center; gap: 0.25rem; }
    .ai-categorize-badge.loading { color: var(--accent-yellow); background: rgba(255,193,7,0.1); }
    .ai-categorize-badge.success { color: var(--accent-green); background: rgba(76,175,80,0.1); }
    @media (max-width: 600px) { .quick-log-card { padding: 1.25rem; } .page-header { flex-direction: column; } .form-row { grid-template-columns: 1fr; } }
  `]
})
export class QuickLogComponent implements OnInit {
  txnService = inject(TransactionService);
  categoryService = inject(CategoryService);
  accountService = inject(AccountService);
  private settingsService = inject(SettingsService);
  private toast = inject(ToastService);
  private api = inject(ApiService);
  recurringService = inject(RecurringService);

  submitting = signal(false);
  justSaved = signal(false);
  lastSavedDesc = signal('');
  lastSavedAmount = signal('');
  aiCategorizing = signal(false);
  aiSuggested = signal(false);
  nlInput = '';
  nlParsing = signal(false);
  private debounceTimeout: any;

  form = {
    type: 'expense' as 'income' | 'expense' | 'transfer',
    amount: null as number | null,
    category: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
    notes: '',
    accountId: '',
    toAccountId: '',
    isRecurring: false,
    recurringFrequency: 'monthly' as 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly',
  };

  recentLogs = this.txnService.recentTransactions;

  parseNlInput() {
    if (!this.nlInput.trim()) return;
    this.nlParsing.set(true);
    this.api.parseNaturalLanguage(this.nlInput).subscribe({
      next: res => {
        this.nlParsing.set(false);
        if (res.success && res.data) {
          const d = res.data;
          if (d.type) this.form.type = d.type;
          if (d.amount != null) this.form.amount = d.amount;
          if (d.description) this.form.description = d.description;
          if (d.date) this.form.date = d.date;
          if (d.categoryId) {
            const categories = this.form.type === 'income'
              ? this.categoryService.incomeCategories()
              : this.categoryService.expenseCategories();
            const exists = categories.some(c => c.id === d.categoryId);
            if (exists) {
              this.form.category = d.categoryId;
              this.aiSuggested.set(true);
            } else {
              this.form.category = '';
              this.aiSuggested.set(false);
            }
          } else {
            if (d.description) {
              this.onDescriptionChange(d.description);
            }
          }
          this.toast.success('Successfully extracted details into form!');
          this.nlInput = '';
        } else {
          this.toast.error(res.error ?? 'Could not parse text');
        }
      },
      error: () => {
        this.nlParsing.set(false);
        this.toast.error('Failed to parse text. Please try again.');
      }
    });
  }

  ngOnInit() {
    this.categoryService.loadCategories().subscribe();
    this.txnService.loadTransactions().subscribe();
    this.accountService.loadAccounts().subscribe(() => this.setPreselectedAccount());
    this.settingsService.load().subscribe(() => this.setPreselectedAccount());
  }

  private setPreselectedAccount() {
    const accounts = this.accountService.accounts();
    const firstAccId = accounts[0]?.id || '';
    if (this.form.type === 'income') {
      const primaryInc = this.settingsService.primaryIncomeAccountId();
      const exists = accounts.some(a => a.id === primaryInc);
      this.form.accountId = exists ? primaryInc : (primaryInc || firstAccId);
    } else if (this.form.type === 'expense') {
      const primaryExp = this.settingsService.primaryExpenseAccountId();
      const exists = accounts.some(a => a.id === primaryExp);
      this.form.accountId = exists ? primaryExp : (primaryExp || firstAccId);
    }
  }

  setType(type: 'income' | 'expense' | 'transfer') {
    this.form.type = type;
    this.aiSuggested.set(false);
    if (type === 'transfer') {
      this.form.category = '';
    } else {
      const inIncome = this.categoryService.incomeCategories().some(c => c.id === this.form.category);
      const inExpense = this.categoryService.expenseCategories().some(c => c.id === this.form.category);
      if (type === 'income' && !inIncome) this.form.category = '';
      if (type === 'expense' && !inExpense) this.form.category = '';
    }
    this.setPreselectedAccount();
  }

  onDescriptionChange(desc: string) {
    if (this.debounceTimeout) clearTimeout(this.debounceTimeout);
    if (this.form.type === 'transfer' || !desc || desc.trim().length < 3) {
      this.aiSuggested.set(false);
      return;
    }

    this.debounceTimeout = setTimeout(() => {
      this.aiCategorizing.set(true);
      this.api.suggestCategory(desc, this.form.type).subscribe({
        next: res => {
          this.aiCategorizing.set(false);
          if (res.success && res.data?.categoryId) {
            const catId = res.data.categoryId;
            const categories = this.form.type === 'income'
              ? this.categoryService.incomeCategories()
              : this.categoryService.expenseCategories();

            const exists = categories.some(c => c.id === catId);
            if (exists) {
              this.form.category = catId;
              this.aiSuggested.set(true);
              this.toast.info(`AI Auto-classified as: ${this.getCategoryName(catId)}`);
            }
          }
        },
        error: () => {
          this.aiCategorizing.set(false);
        }
      });
    }, 600);
  }

  isValid() {
    const hasAmount = !!this.form.amount && this.form.amount > 0;
    const hasDesc = !!this.form.description.trim();

    if (this.form.type === 'transfer') {
      return hasAmount && hasDesc && !!this.form.accountId && !!this.form.toAccountId && this.form.accountId !== this.form.toAccountId;
    }
    return hasAmount && hasDesc && !!this.form.accountId && !!this.form.category;
  }

  submit() {
    if (!this.isValid()) { this.toast.error('Please fill in the required fields'); return; }
    this.submitting.set(true);
    const savedDesc = this.form.description.trim();
    const savedAmount = '$' + Number(this.form.amount).toLocaleString();

    this.txnService.createTransaction({
      type: this.form.type,
      amount: Number(this.form.amount),
      category: this.form.type === 'transfer' ? '' : this.form.category,
      description: savedDesc,
      date: this.form.date,
      tags: [],
      isRecurring: this.form.isRecurring,
      recurringFrequency: this.form.isRecurring ? this.form.recurringFrequency : undefined,
      paymentMethod: undefined,
      notes: this.form.notes || undefined,
      accountId: this.form.accountId,
      toAccountId: this.form.type === 'transfer' ? this.form.toAccountId : undefined,
    }).subscribe(res => {
      this.submitting.set(false);
      if (res?.success) {
        this.lastSavedDesc.set(savedDesc);
        this.lastSavedAmount.set(savedAmount);
        this.justSaved.set(true);
        setTimeout(() => this.justSaved.set(false), 3000);
        if (this.form.isRecurring) {
          this.recurringService.loadSchedules().subscribe();
        }
        this.resetForm();
      } else {
        this.toast.error('Could not save transaction');
      }
    });
  }

  getCategoryIcon(id: string) { return this.categoryService.getCategoryIcon(id); }
  getCategoryName(id: string) { return this.categoryService.getCategoryById(id)?.name ?? id; }

  private resetForm() {
    this.aiSuggested.set(false);
    this.form = {
      type: this.form.type,
      amount: null,
      category: this.form.category,
      description: '',
      date: new Date().toISOString().split('T')[0],
      notes: '',
      accountId: this.form.accountId,
      toAccountId: '',
      isRecurring: false,
      recurringFrequency: 'monthly' as 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly',
    };
  }
}

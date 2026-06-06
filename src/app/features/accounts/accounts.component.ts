import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AccountService } from '../../core/services/account.service';
import { ToastService } from '../../core/services/toast.service';
import { HeaderComponent } from '../../layout/header.component';
import { CurrencyFormatPipe } from '../../shared/pipes/currency-format.pipe';
import { Account } from '../../core/models';

@Component({
  selector: 'app-accounts',
  standalone: true,
  imports: [CommonModule, FormsModule, HeaderComponent, CurrencyFormatPipe],
  template: `
    <app-header title="Accounts" subtitle="Manage your asset accounts, liabilities, and view current balances">
      <button class="btn btn-primary btn-sm" (click)="openForm()">+ Add Account</button>
    </app-header>

    <div class="accounts-page">
      <!-- Net Worth Banner -->
      <div class="net-worth-banner">
        <div class="nw-content">
          <span class="nw-label">Estimated Net Worth</span>
          <h2 class="nw-value" [class.negative]="accountService.netWorth() < 0">
            {{ accountService.netWorth() < 0 ? '-' : '' }}{{ accountService.netWorth() | currencyFormat }}
          </h2>
          <span class="nw-sub text-muted">Sum of all assets and liabilities</span>
        </div>
      </div>

      <!-- Type Tabs -->
      <div class="type-tabs">
        <button class="tab-btn" [class.active]="activeTab() === 'all'" (click)="activeTab.set('all')">
          All ({{ accountService.accounts().length }})
        </button>
        <button class="tab-btn" [class.active]="activeTab() === 'asset'" (click)="activeTab.set('asset')">
          Assets ({{ accountService.assetAccounts().length }})
        </button>
        <button class="tab-btn" [class.active]="activeTab() === 'liability'" (click)="activeTab.set('liability')">
          Liabilities ({{ accountService.liabilityAccounts().length }})
        </button>
      </div>

      <!-- Accounts Grid -->
      <div class="accounts-grid">
        @for (acc of filteredAccounts(); track acc.id) {
          @let balance = getAccountBalance(acc.id);
          <div class="account-card" [class.liability-card]="acc.type === 'liability'">
            <div class="ac-icon" [class.asset-icon]="acc.type === 'asset'" [class.liability-icon]="acc.type === 'liability'">
              <span>{{ acc.type === 'asset' ? '🏦' : '💳' }}</span>
            </div>
            <div class="ac-info">
              <span class="ac-name">{{ acc.name }}</span>
              <span class="ac-type badge" [class.badge-income]="acc.type === 'asset'"
                    [class.badge-expense]="acc.type === 'liability'">
                {{ acc.type === 'asset' ? 'Asset' : 'Liability' }}
              </span>
            </div>
            <div class="ac-balance">
              <span class="balance-label">{{ acc.type === 'asset' ? 'Balance' : 'Owed' }}</span>
              <span class="balance-value"
                    [class.text-income]="acc.type === 'asset' && balance >= 0"
                    [class.text-expense]="acc.type === 'liability' || balance < 0">
                {{ acc.type === 'asset' && balance < 0 ? '-' : '' }}{{ balance | currencyFormat }}
              </span>
            </div>
            <div class="ac-actions">
              <button class="btn btn-ghost btn-icon btn-sm" (click)="editAccount(acc)" aria-label="Edit">✏️</button>
              <button class="btn btn-ghost btn-icon btn-sm" (click)="confirmDelete(acc)" aria-label="Delete">🗑️</button>
            </div>
          </div>
        }

        <!-- Add New Card -->
        <button class="add-account-card" (click)="openForm()">
          <span class="add-icon">+</span>
          <span>Add Account</span>
        </button>
      </div>
    </div>

    <!-- Account Form Modal -->
    @if (showForm()) {
      <div class="modal-overlay" (click)="onOverlayClick($event)">
        <div class="modal" role="dialog" aria-modal="true">
          <div class="modal-header">
            <h3>{{ editingAccount() ? 'Edit Account' : 'Add Account' }}</h3>
            <button class="btn btn-ghost btn-icon" (click)="closeForm()">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Name *</label>
              <input type="text" class="form-control" [(ngModel)]="form.name" placeholder="Account name (e.g. Chequing Account, Credit Card)">
            </div>

            <div class="form-group">
              <label class="form-label">Type *</label>
              <select class="form-control" [(ngModel)]="form.type">
                <option value="asset">Asset (Money you own: cash, checking, savings)</option>
                <option value="liability">Liability (Money you owe: credit cards, loans, debt)</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Initial Balance</label>
              <div class="input-prefix">
                <span class="prefix">$</span>
                <input type="number" class="form-control" [(ngModel)]="form.initialBalance" placeholder="0.00" step="0.01">
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" (click)="closeForm()">Cancel</button>
            <button class="btn btn-primary" (click)="saveAccount()" [disabled]="submitting() || !form.name">
              {{ submitting() ? 'Saving...' : (editingAccount() ? 'Update' : 'Add') + ' Account' }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Delete Confirm -->
    @if (deletingAccount()) {
      <div class="modal-overlay" (click)="cancelDelete()">
        <div class="modal" style="max-width: 400px;" role="alertdialog">
          <div class="modal-header"><h3>Delete Account</h3></div>
          <div class="modal-body">
            <p>Delete <strong>{{ deletingAccount()!.name }}</strong>?</p>
            <p class="text-muted text-sm mt-2">Transactions using this account will keep the account ID but will not compute correctly in balances.</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" (click)="cancelDelete()">Cancel</button>
            <button class="btn btn-danger" (click)="deleteAccount()">Delete</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .accounts-page { padding: 1.5rem 2rem; display: flex; flex-direction: column; gap: 1.5rem; }

    /* Net Worth Banner */
    .net-worth-banner {
      background: linear-gradient(135deg, rgba(92, 107, 192, 0.15) 0%, rgba(33, 150, 243, 0.05) 100%);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 1.5rem 2rem;
      display: flex;
      justify-content: center;
      align-items: center;
      text-align: center;
      box-shadow: var(--shadow-sm);
    }
    .nw-content { display: flex; flex-direction: column; gap: 0.5rem; }
    .nw-label { font-size: 0.875rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .nw-value { font-size: 2.5rem; font-weight: 800; color: var(--accent-green); margin: 0; }
    .nw-value.negative { color: var(--accent-red); }
    .nw-sub { font-size: 0.75rem; }

    /* Type Tabs */
    .type-tabs { display: flex; gap: 0.5rem; }
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

    /* Accounts Grid */
    .accounts-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; }

    .account-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      transition: var(--transition);
      position: relative;
    }
    .account-card:hover { border-color: var(--border-light); transform: translateY(-2px); box-shadow: var(--shadow-md); }
    .account-card.liability-card { border-left: 3px solid var(--accent-red); }
    .account-card:not(.liability-card) { border-left: 3px solid var(--accent-green); }

    .ac-icon {
      width: 44px;
      height: 44px;
      border-radius: var(--radius-sm);
      border: 1px solid;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.25rem;
      position: absolute;
      top: 1.25rem;
      right: 1.25rem;
    }
    .ac-icon.asset-icon { background: rgba(76, 175, 80, 0.15); border-color: rgba(76, 175, 80, 0.3); }
    .ac-icon.liability-icon { background: rgba(239, 83, 80, 0.15); border-color: rgba(239, 83, 80, 0.3); }

    .ac-info { display: flex; flex-direction: column; gap: 0.25rem; width: 70%; }
    .ac-name { font-size: 1rem; font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ac-type { font-size: 0.7rem; align-self: flex-start; }

    .ac-balance { display: flex; flex-direction: column; gap: 0.125rem; margin-top: 0.5rem; }
    .balance-label { font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.02em; }
    .balance-value { font-size: 1.375rem; font-weight: 800; color: var(--text-primary); }

    .ac-actions { display: flex; gap: 0.25rem; justify-content: flex-end; border-top: 1px solid var(--border); padding-top: 0.75rem; margin-top: 0.25rem; }

    .add-account-card {
      background: transparent;
      border: 2px dashed var(--border);
      border-radius: var(--radius-lg);
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      color: var(--text-muted);
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: var(--transition);
      font-family: inherit;
      min-height: 170px;
    }
    .add-account-card:hover { border-color: var(--accent-blue); color: var(--accent-blue-light); background: rgba(92, 107, 192, 0.05); }
    .add-icon { font-size: 1.75rem; }

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

    @media (max-width: 768px) { .accounts-page { padding: 1rem; } }
  `]
})
export class AccountsComponent implements OnInit {
  accountService = inject(AccountService);
  private toast = inject(ToastService);

  activeTab = signal<'all' | 'asset' | 'liability'>('all');
  showForm = signal(false);
  editingAccount = signal<Account | undefined>(undefined);
  deletingAccount = signal<Account | undefined>(undefined);
  submitting = signal(false);

  form = { name: '', type: 'asset' as 'asset' | 'liability', initialBalance: null as number | null };

  filteredAccounts() {
    const tab = this.activeTab();
    if (tab === 'all') return this.accountService.accounts();
    if (tab === 'asset') return this.accountService.assetAccounts();
    return this.accountService.liabilityAccounts();
  }

  getAccountBalance(id: string): number {
    return this.accountService.accountBalances()[id] || 0;
  }

  ngOnInit() {
    this.accountService.loadAccounts().subscribe();
  }

  openForm() {
    this.form = { name: '', type: 'asset', initialBalance: null };
    this.editingAccount.set(undefined);
    this.showForm.set(true);
  }

  editAccount(acc: Account) {
    this.form = {
      name: acc.name,
      type: acc.type,
      initialBalance: acc.initialBalance != null ? Math.abs(acc.initialBalance) : null
    };
    this.editingAccount.set(acc);
    this.showForm.set(true);
  }

  closeForm() {
    this.showForm.set(false);
    this.editingAccount.set(undefined);
  }

  saveAccount() {
    if (!this.form.name) return;
    this.submitting.set(true);

    let initial = this.form.initialBalance != null ? Number(this.form.initialBalance) : 0;
    if (isNaN(initial)) {
      initial = 0;
    }
    // Always store as positive (absolute) — account.service.ts handles
    // the sign: assets add, liabilities subtract from net worth
    initial = Math.abs(initial);

    const payload = {
      name: this.form.name,
      type: this.form.type,
      initialBalance: initial
    };

    const obs = this.editingAccount()
      ? this.accountService.updateAccount(this.editingAccount()!.id, payload)
      : this.accountService.createAccount(payload);
    obs.subscribe(() => {
      this.submitting.set(false);
      this.closeForm();
      this.toast.success(this.editingAccount() ? 'Account updated!' : 'Account added!');
    });
  }

  confirmDelete(acc: Account) {
    this.deletingAccount.set(acc);
  }

  cancelDelete() {
    this.deletingAccount.set(undefined);
  }

  deleteAccount() {
    const acc = this.deletingAccount();
    if (!acc) return;
    this.accountService.deleteAccount(acc.id).subscribe(() => {
      this.deletingAccount.set(undefined);
      this.toast.success('Account deleted');
    });
  }

  onOverlayClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('modal-overlay')) {
      this.closeForm();
    }
  }
}

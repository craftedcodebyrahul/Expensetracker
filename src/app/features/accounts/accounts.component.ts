import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AccountService } from '../../core/services/account.service';
import { TransactionService } from '../../core/services/transaction.service';
import { CategoryService } from '../../core/services/category.service';
import { ToastService } from '../../core/services/toast.service';
import { HeaderComponent } from '../../layout/header.component';
import { CurrencyFormatPipe } from '../../shared/pipes/currency-format.pipe';
import { Account, Transaction } from '../../core/models';

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
          <div class="account-card"
               [class.liability-card]="acc.type === 'liability'"
               [class.active-card]="selectedAccount()?.id === acc.id"
               (click)="selectAccount(acc)"
               role="button"
               tabindex="0"
               (keydown.enter)="selectAccount(acc)"
               aria-label="View transactions for {{ acc.name }}">
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
            <div class="ac-actions" (click)="$event.stopPropagation()">
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

      <!-- ── Account Drilldown Panel ─────────────────────────────────────── -->
      @if (selectedAccount()) {
        @let acc = selectedAccount()!;
        @let balance = getAccountBalance(acc.id);
        @let stats = drilldownStats();
        @let txns = drilldownTxns();

        <div class="drilldown-panel" [style.border-left-color]="acc.type === 'asset' ? 'var(--accent-green)' : 'var(--accent-red)'">

          <!-- Panel Header -->
          <div class="dd-header">
            <div class="dd-title">
              <span class="dd-icon">{{ acc.type === 'asset' ? '🏦' : '💳' }}</span>
              <div>
                <h3>{{ acc.name }}</h3>
                <span class="dd-subtitle">{{ acc.type === 'asset' ? 'Asset account' : 'Liability account' }} · {{ txns.length }} transactions</span>
              </div>
            </div>
            <div class="dd-header-right">
              <!-- Date range filter -->
              <div class="dd-filter-group">
                <input type="date" class="form-control form-control-sm"
                       [value]="drilldownFrom()"
                       (change)="drilldownFrom.set($any($event.target).value)">
                <span class="dd-filter-sep">→</span>
                <input type="date" class="form-control form-control-sm"
                       [value]="drilldownTo()"
                       (change)="drilldownTo.set($any($event.target).value)">
              </div>
              <button class="btn btn-ghost btn-sm" (click)="closePanel()" aria-label="Close">✕ Close</button>
            </div>
          </div>

          <!-- Stats Row -->
          <div class="dd-stats">
            <div class="dd-stat">
              <span class="dd-stat-label">Current Balance</span>
              <span class="dd-stat-val" [class.text-income]="acc.type === 'asset' && balance >= 0"
                    [class.text-expense]="acc.type === 'liability' || balance < 0">
                {{ acc.type === 'asset' && balance < 0 ? '-' : '' }}{{ balance | currencyFormat }}
              </span>
            </div>
            <div class="dd-stat">
              <span class="dd-stat-label">Total In</span>
              <span class="dd-stat-val text-income">+{{ stats.totalIn | currencyFormat }}</span>
            </div>
            <div class="dd-stat">
              <span class="dd-stat-label">Total Out</span>
              <span class="dd-stat-val text-expense">-{{ stats.totalOut | currencyFormat }}</span>
            </div>
            <div class="dd-stat">
              <span class="dd-stat-label">Net Flow</span>
              <span class="dd-stat-val"
                    [class.text-income]="stats.netFlow >= 0"
                    [class.text-expense]="stats.netFlow < 0">
                {{ stats.netFlow >= 0 ? '+' : '-' }}{{ stats.netFlow | currencyFormat }}
              </span>
            </div>
            <div class="dd-stat">
              <span class="dd-stat-label">Transactions</span>
              <span class="dd-stat-val">{{ txns.length }}</span>
            </div>
            <div class="dd-stat">
              <span class="dd-stat-label">Avg Amount</span>
              <span class="dd-stat-val">{{ stats.avg | currencyFormat }}</span>
            </div>
          </div>

          <!-- Transaction Table -->
          @if (txns.length === 0) {
            <div class="dd-empty">
              <span>🪙</span>
              <p>No transactions in this period</p>
            </div>
          } @else {
            <!-- Type filter tabs -->
            <div class="dd-type-tabs">
              <button class="dd-tab" [class.active]="drilldownType() === 'all'" (click)="drilldownType.set('all')">
                All ({{ txns.length }})
              </button>
              <button class="dd-tab" [class.active]="drilldownType() === 'income'" (click)="drilldownType.set('income')">
                <span class="text-income">Income ({{ stats.incomeCount }})</span>
              </button>
              <button class="dd-tab" [class.active]="drilldownType() === 'expense'" (click)="drilldownType.set('expense')">
                <span class="text-expense">Expenses ({{ stats.expenseCount }})</span>
              </button>
              <button class="dd-tab" [class.active]="drilldownType() === 'transfer'" (click)="drilldownType.set('transfer')">
                Transfers ({{ stats.transferCount }})
              </button>
            </div>

            <div class="table-wrapper">
              <table class="dd-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Category</th>
                    <th>Type</th>
                    <th class="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  @for (t of txns; track t.id) {
                    <tr>
                      <td class="dd-date">{{ t.date }}</td>
                      <td class="dd-desc">
                        <span>{{ t.description }}</span>
                        @if (t.isRecurring) { <span class="recurring-pill">🔄</span> }
                      </td>
                      <td class="dd-cat">
                        @if (t.type === 'transfer') {
                          <span class="transfer-label">
                            {{ t.accountId === acc.id ? '→ ' + getAccountName(t.toAccountId || '') : '← ' + getAccountName(t.accountId) }}
                          </span>
                        } @else {
                          <span class="cat-badge">
                            {{ getCategoryIcon(t.category) }} {{ getCategoryName(t.category) }}
                          </span>
                        }
                      </td>
                      <td>
                        <span class="type-chip"
                              [class.chip-income]="t.type === 'income'"
                              [class.chip-expense]="t.type === 'expense'"
                              [class.chip-transfer]="t.type === 'transfer'">
                          {{ t.type }}
                        </span>
                      </td>
                      <td class="text-right dd-amount"
                          [class.text-income]="t.type === 'income' || (t.type === 'transfer' && t.toAccountId === acc.id)"
                          [class.text-expense]="t.type === 'expense' || (t.type === 'transfer' && t.accountId === acc.id)">
                        {{ (t.type === 'income' || (t.type === 'transfer' && t.toAccountId === acc.id)) ? '+' : '-' }}{{ t.amount | currencyFormat }}
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
              <input type="text" class="form-control" [(ngModel)]="form.name"
                     placeholder="Account name (e.g. Chequing Account, Credit Card)">
            </div>
            <div class="form-group">
              <label class="form-label">Type *</label>
              <select class="form-control" [(ngModel)]="form.type">
                <option value="asset">Asset (Money you own: cash, checking, savings)</option>
                <option value="liability">Liability (Money you owe: credit cards, loans, debt)</option>
              </select>
            </div>
            <div class="form-group" [class.disabled-field]="editingAccount()">
              <label class="form-label">Initial Balance</label>
              <div class="input-prefix">
                <span class="prefix">$</span>
                <input type="number" class="form-control" [(ngModel)]="form.initialBalance"
                       placeholder="0.00" step="0.01" [disabled]="!!editingAccount()">
              </div>
              @if (editingAccount()) {
                <span class="field-help text-xs text-muted" style="display: block; margin-top: 0.25rem;">Initial balance cannot be modified once the account is created. To adjust the balance, please log transactions.</span>
              } @else {
                <span class="field-help text-xs text-muted" style="display: block; margin-top: 0.25rem;">💡 **Tip:** If you plan to import or log past transactions for this account, set the initial balance to what it was *before* those transactions took place. Otherwise, leave it as 0.</span>
              }
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
            <p class="text-muted text-sm mt-2">Transactions using this account will keep the account ID
               but will not compute correctly in balances.</p>
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

    /* ── Net Worth Banner ─────────────────────────────────────────── */
    .net-worth-banner {
      background: linear-gradient(135deg, rgba(92,107,192,0.15) 0%, rgba(33,150,243,0.05) 100%);
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

    /* ── Type Tabs ────────────────────────────────────────────────── */
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
    .tab-btn.active { background: rgba(92,107,192,0.15); color: var(--accent-blue-light); border-color: var(--accent-blue); }

    /* ── Accounts Grid ────────────────────────────────────────────── */
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
      cursor: pointer;
      outline: none;
    }
    .account-card:hover, .account-card:focus {
      border-color: var(--border-light);
      transform: translateY(-2px);
      box-shadow: var(--shadow-md);
    }
    .account-card.active-card {
      border-color: var(--accent-blue) !important;
      box-shadow: 0 0 0 2px rgba(92,107,192,0.25), var(--shadow-md);
      transform: translateY(-2px);
    }
    .account-card.liability-card { border-left: 3px solid var(--accent-red); }
    .account-card:not(.liability-card) { border-left: 3px solid var(--accent-green); }

    .ac-icon {
      width: 44px; height: 44px;
      border-radius: var(--radius-sm);
      border: 1px solid;
      display: flex; align-items: center; justify-content: center;
      font-size: 1.25rem;
      position: absolute; top: 1.25rem; right: 1.25rem;
    }
    .ac-icon.asset-icon { background: rgba(76,175,80,0.15); border-color: rgba(76,175,80,0.3); }
    .ac-icon.liability-icon { background: rgba(239,83,80,0.15); border-color: rgba(239,83,80,0.3); }

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
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      gap: 0.5rem;
      color: var(--text-muted);
      font-size: 0.875rem; font-weight: 500;
      cursor: pointer;
      transition: var(--transition);
      font-family: inherit;
      min-height: 170px;
    }
    .add-account-card:hover { border-color: var(--accent-blue); color: var(--accent-blue-light); background: rgba(92,107,192,0.05); }
    .add-icon { font-size: 1.75rem; }

    /* ── Drilldown Panel ──────────────────────────────────────────── */
    .drilldown-panel {
      background: rgba(30, 33, 48, 0.92);
      border: 1px solid var(--border-light);
      border-left: 4px solid var(--accent-green);
      border-radius: var(--radius-xl);
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      animation: slideDown 0.2s ease;
      box-shadow: var(--shadow-glow-blue, 0 4px 24px rgba(0,0,0,0.3));
    }
    @keyframes slideDown {
      from { opacity: 0; transform: translateY(-8px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    .dd-header {
      display: flex; justify-content: space-between; align-items: flex-start;
      border-bottom: 1px solid var(--border);
      padding-bottom: 1rem;
      gap: 1rem;
      flex-wrap: wrap;
    }
    .dd-title { display: flex; align-items: center; gap: 0.875rem; }
    .dd-icon { font-size: 2rem; }
    .dd-title h3 { font-size: 1.125rem; font-weight: 700; color: var(--text-primary); margin: 0; }
    .dd-subtitle { font-size: 0.75rem; color: var(--text-muted); margin-top: 0.125rem; display: block; }

    .dd-header-right { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
    .dd-filter-group { display: flex; align-items: center; gap: 0.5rem; }
    .dd-filter-sep { color: var(--text-muted); font-size: 0.875rem; }
    .form-control-sm { padding: 0.375rem 0.625rem; font-size: 0.8125rem; height: auto; }

    /* Stats */
    .dd-stats {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 0.75rem;
    }
    .dd-stat {
      background: rgba(255,255,255,0.02);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 0.75rem 1rem;
      display: flex; flex-direction: column; gap: 0.25rem;
    }
    .dd-stat-label { font-size: 0.7rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
    .dd-stat-val { font-size: 1rem; font-weight: 700; color: var(--text-primary); }

    /* Type tabs */
    .dd-type-tabs { display: flex; gap: 0.5rem; border-bottom: 1px solid var(--border); padding-bottom: 0.75rem; flex-wrap: wrap; }
    .dd-tab {
      padding: 0.375rem 0.875rem;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--text-secondary);
      font-size: 0.8125rem;
      font-weight: 500;
      cursor: pointer;
      transition: var(--transition);
      font-family: inherit;
    }
    .dd-tab:hover { background: var(--bg-card); }
    .dd-tab.active { background: rgba(92,107,192,0.15); border-color: var(--accent-blue); color: var(--accent-blue-light); }

    /* Table */
    .table-wrapper { overflow-x: auto; border-radius: var(--radius-sm); border: 1px solid var(--border); }
    .dd-table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }
    .dd-table th {
      padding: 0.625rem 0.875rem;
      text-align: left;
      font-size: 0.7rem;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      background: rgba(255,255,255,0.02);
      border-bottom: 1px solid var(--border);
      white-space: nowrap;
    }
    .dd-table td {
      padding: 0.625rem 0.875rem;
      border-bottom: 1px solid rgba(255,255,255,0.04);
      vertical-align: middle;
    }
    .dd-table tr:last-child td { border-bottom: none; }
    .dd-table tr:hover td { background: rgba(255,255,255,0.02); }

    .dd-date { white-space: nowrap; color: var(--text-muted); font-size: 0.75rem; }
    .dd-desc { font-weight: 500; color: var(--text-primary); }
    .dd-cat { color: var(--text-secondary); }
    .dd-amount { font-weight: 600; white-space: nowrap; }
    .text-right { text-align: right; }

    .recurring-pill {
      display: inline-block;
      font-size: 0.65rem;
      margin-left: 0.375rem;
      opacity: 0.7;
    }
    .cat-badge { font-size: 0.75rem; }
    .transfer-label { font-size: 0.75rem; color: var(--text-muted); font-style: italic; }

    .type-chip {
      display: inline-block;
      padding: 0.15rem 0.5rem;
      border-radius: 100px;
      font-size: 0.65rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .chip-income  { background: rgba(76,175,80,0.15);  color: var(--accent-green); }
    .chip-expense { background: rgba(239,83,80,0.15);  color: var(--accent-red); }
    .chip-transfer{ background: rgba(92,107,192,0.15); color: var(--accent-blue-light); }

    .dd-empty {
      display: flex; flex-direction: column; align-items: center; gap: 0.5rem;
      padding: 2.5rem; color: var(--text-muted); font-size: 0.875rem; text-align: center;
    }
    .dd-empty span { font-size: 2rem; }

    /* ── Form helpers ─────────────────────────────────────────────── */
    .input-prefix { position: relative; }
    .prefix {
      position: absolute; left: 0.875rem; top: 50%;
      transform: translateY(-50%);
      color: var(--text-muted); font-weight: 600;
    }
    .input-prefix .form-control { padding-left: 1.75rem; }

    @media (max-width: 1024px) { .dd-stats { grid-template-columns: repeat(3, 1fr); } }
    @media (max-width: 768px)  {
      .accounts-page { padding: 1rem; }
      .dd-stats { grid-template-columns: repeat(2, 1fr); }
      .dd-header { flex-direction: column; }
      .dd-header-right { width: 100%; justify-content: space-between; }
    }
    @media (max-width: 480px) { .dd-stats { grid-template-columns: 1fr 1fr; } }
  `]
})
export class AccountsComponent implements OnInit {
  accountService  = inject(AccountService);
  private txnService  = inject(TransactionService);
  private catService  = inject(CategoryService);
  private toast       = inject(ToastService);

  // ── UI state ──────────────────────────────────────────────────────
  activeTab       = signal<'all' | 'asset' | 'liability'>('all');
  showForm        = signal(false);
  editingAccount  = signal<Account | undefined>(undefined);
  deletingAccount = signal<Account | undefined>(undefined);
  submitting      = signal(false);

  // ── Drilldown state ───────────────────────────────────────────────
  selectedAccount = signal<Account | undefined>(undefined);
  drilldownType   = signal<'all' | 'income' | 'expense' | 'transfer'>('all');

  // Default date range: start of current year → today
  private today = new Date().toLocaleDateString('en-CA');
  private yearStart = `${new Date().getFullYear()}-01-01`;
  drilldownFrom = signal(this.yearStart);
  drilldownTo   = signal(this.today);

  form = { name: '', type: 'asset' as 'asset' | 'liability', initialBalance: null as number | null };

  // ── Computed: transactions for selected account within date range ──
  drilldownTxns = computed<Transaction[]>(() => {
    const acc = this.selectedAccount();
    if (!acc) return [];
    const from = this.drilldownFrom();
    const to   = this.drilldownTo();
    const type = this.drilldownType();

    return this.txnService.postedTransactions()
      .filter(t => {
        const forThisAccount =
          t.accountId === acc.id ||
          (t.type === 'transfer' && t.toAccountId === acc.id);
        const inRange = t.date >= from && t.date <= to;
        const typeOk  = type === 'all' || t.type === type;
        return forThisAccount && inRange && typeOk;
      })
      .sort((a, b) => {
        if (a.date !== b.date) {
          return b.date.localeCompare(a.date);
        }
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });
  });

  // ── Computed: summary stats for the drilldown panel ───────────────
  drilldownStats = computed(() => {
    const acc = this.selectedAccount();
    if (!acc) return { totalIn: 0, totalOut: 0, netFlow: 0, avg: 0, incomeCount: 0, expenseCount: 0, transferCount: 0 };

    const from = this.drilldownFrom();
    const to   = this.drilldownTo();

    // All txns for this account regardless of type filter (stats always show all)
    const all = this.txnService.postedTransactions().filter(t => {
      const forThisAccount = t.accountId === acc.id || (t.type === 'transfer' && t.toAccountId === acc.id);
      return forThisAccount && t.date >= from && t.date <= to;
    });

    let totalIn = 0, totalOut = 0;
    let incomeCount = 0, expenseCount = 0, transferCount = 0;

    all.forEach(t => {
      if (t.type === 'income') {
        totalIn += t.amount;
        incomeCount++;
      } else if (t.type === 'expense') {
        totalOut += t.amount;
        expenseCount++;
      } else if (t.type === 'transfer') {
        transferCount++;
        if (t.toAccountId === acc.id) {
          totalIn  += t.amount; // money arriving
        } else {
          totalOut += t.amount; // money leaving
        }
      }
    });

    const netFlow = totalIn - totalOut;
    const avg = all.length > 0 ? (totalIn + totalOut) / all.length : 0;

    return { totalIn, totalOut, netFlow, avg, incomeCount, expenseCount, transferCount };
  });

  // ── Helpers ───────────────────────────────────────────────────────
  filteredAccounts() {
    const tab = this.activeTab();
    if (tab === 'asset')     return this.accountService.assetAccounts();
    if (tab === 'liability') return this.accountService.liabilityAccounts();
    return this.accountService.accounts();
  }

  getAccountBalance(id: string): number {
    return this.accountService.accountBalances()[id] ?? 0;
  }

  getAccountName(id: string): string {
    return this.accountService.getAccountById(id)?.name ?? id;
  }

  getCategoryIcon(id: string): string {
    return this.catService.getCategoryIcon(id);
  }

  getCategoryName(id: string): string {
    return this.catService.getCategoryById(id)?.name ?? id;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────
  ngOnInit() {
    this.accountService.loadAccounts().subscribe();
    this.txnService.loadTransactions().subscribe();
    this.catService.loadCategories().subscribe();
  }

  // ── Drilldown ─────────────────────────────────────────────────────
  selectAccount(acc: Account) {
    if (this.selectedAccount()?.id === acc.id) {
      this.selectedAccount.set(undefined); // toggle off
    } else {
      this.selectedAccount.set(acc);
      this.drilldownType.set('all');
    }
  }

  closePanel() {
    this.selectedAccount.set(undefined);
  }

  // ── Account CRUD ──────────────────────────────────────────────────
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

    const isEdit = !!this.editingAccount();
    let payload: any = { name: this.form.name, type: this.form.type };
    
    if (!isEdit) {
      let initial = this.form.initialBalance != null ? Number(this.form.initialBalance) : 0;
      if (isNaN(initial)) initial = 0;
      initial = Math.abs(initial);
      payload.initialBalance = initial;
    }

    const obs = isEdit
      ? this.accountService.updateAccount(this.editingAccount()!.id, payload)
      : this.accountService.createAccount(payload);

    obs.subscribe(() => {
      this.submitting.set(false);
      this.closeForm();
      this.toast.success(isEdit ? 'Account updated!' : 'Account added!');
    });
  }

  confirmDelete(acc: Account) { this.deletingAccount.set(acc); }
  cancelDelete()               { this.deletingAccount.set(undefined); }

  deleteAccount() {
    const acc = this.deletingAccount();
    if (!acc) return;
    this.accountService.deleteAccount(acc.id).subscribe(() => {
      this.deletingAccount.set(undefined);
      if (this.selectedAccount()?.id === acc.id) this.selectedAccount.set(undefined);
      this.toast.success('Account deleted');
    });
  }

  onOverlayClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('modal-overlay')) this.closeForm();
  }
}

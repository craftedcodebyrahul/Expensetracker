import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AccountService } from '../../core/services/account.service';
import { ApiService } from '../../core/services/api.service';
import { CategoryService } from '../../core/services/category.service';
import { ToastService } from '../../core/services/toast.service';
import { HeaderComponent } from '../../layout/header.component';
import { CurrencyFormatPipe } from '../../shared/pipes/currency-format.pipe';
import { Account, StockHolding, StockOrder, Transaction } from '../../core/models';
import { SettingsService } from '../../core/services/settings.service';

@Component({
  selector: 'app-accounts',
  standalone: true,
  imports: [CommonModule, FormsModule, HeaderComponent, CurrencyFormatPipe],
  template: `
    <app-header title="Accounts" subtitle="Manage your asset accounts, liabilities, and view current balances">
      <div style="display:flex;gap:0.5rem;align-items:center;">
        <button class="btn btn-outline btn-sm"
                [disabled]="accountService.refreshingPrices()"
                (click)="refreshPrices()"
                title="Refresh live stock prices">
          {{ accountService.refreshingPrices() ? '⏳ Refreshing…' : '🔄 Refresh Prices' }}
        </button>
        <button class="btn btn-primary btn-sm" (click)="openForm()">+ Add Account</button>
      </div>
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
        <button class="tab-btn" [class.active]="activeTab() === 'investment'" (click)="activeTab.set('investment')">
          📈 Investment ({{ accountService.investmentAccounts().length }})
        </button>
      </div>

      <!-- Accounts Grid -->
      <div class="accounts-grid">
        @for (acc of filteredAccounts(); track acc.id) {
          @let balance = getAccountBalance(acc.id);
          <div class="account-card"
               [class.liability-card]="acc.type === 'liability'"
               [class.investment-card]="acc.isInvestment"
               [class.active-card]="selectedAccount()?.id === acc.id"
               (click)="selectAccount(acc)"
               role="button"
               tabindex="0"
               (keydown.enter)="selectAccount(acc)"
               aria-label="View transactions for {{ acc.name }}">
            <div class="ac-icon" [class.asset-icon]="acc.type === 'asset' && !acc.isInvestment"
                 [class.liability-icon]="acc.type === 'liability'"
                 [class.investment-icon]="acc.isInvestment">
              <span>{{ acc.isInvestment ? '📈' : acc.type === 'asset' ? '🏦' : '💳' }}</span>
            </div>
            <div class="ac-info">
              <span class="ac-name">{{ acc.name }}</span>
              <div style="display:flex;gap:0.35rem;flex-wrap:wrap;align-items:center;">
                <span class="ac-type badge" [class.badge-income]="acc.type === 'asset'"
                      [class.badge-expense]="acc.type === 'liability'">
                  {{ acc.type === 'asset' ? 'Asset' : 'Liability' }}
                </span>
                @if (acc.isInvestment) {
                  <span class="badge badge-invest">📈 Investment</span>
                }
              </div>
            </div>
            <div class="ac-balance">
              <span class="balance-label">{{ acc.type === 'asset' ? 'Balance' : 'Owed' }}</span>
              <span class="balance-value"
                    [class.text-income]="acc.type === 'asset' && balance >= 0"
                    [class.text-expense]="acc.type === 'liability' || balance < 0">
                {{ acc.type === 'asset' && balance < 0 ? '-' : '' }}{{ balance | currencyFormat:settingsService.getSymbol(acc.currency || 'USD') }}
              </span>
              @if (acc.isInvestment && acc.stockHoldings?.length) {
                <span class="balance-sub">{{ acc.stockHoldings!.length }} holding{{ acc.stockHoldings!.length !== 1 ? 's' : '' }}</span>
              }
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

      <!-- ── Account Drilldown Panel ──────────────────────────────────────── -->
      @if (selectedAccount()) {
        @let acc = selectedAccount()!;
        @let balance = getAccountBalance(acc.id);
        @let stats = drilldownStats();
        @let txns = drilldownTxns();

        <div class="drilldown-panel" [style.border-left-color]="acc.type === 'asset' ? 'var(--accent-green)' : 'var(--accent-red)'">

          <!-- Panel Header -->
          <div class="dd-header">
            <div class="dd-title">
              <span class="dd-icon">{{ acc.isInvestment ? '📈' : acc.type === 'asset' ? '🏦' : '💳' }}</span>
              <div>
                <h3>{{ acc.name }}</h3>
                <span class="dd-subtitle">{{ acc.type === 'asset' ? 'Asset account' : 'Liability account' }}{{ acc.isInvestment ? ' · Investment' : '' }} · {{ txns.length }} transactions</span>
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

          <!-- ── Panel Sub-tabs ── -->
          <div class="dd-main-tabs">
            <button class="dd-main-tab" [class.active]="ddMainTab() === 'transactions'" (click)="ddMainTab.set('transactions')">
              📋 Transactions
            </button>
            @if (acc.isInvestment) {
              <button class="dd-main-tab" [class.active]="ddMainTab() === 'portfolio'" (click)="ddMainTab.set('portfolio')">
                📊 Portfolio
              </button>
            }
          </div>

          <!-- Transaction Table -->
          @if (ddMainTab() === 'transactions') {
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
          }

          <!-- ── Portfolio Tab ── -->
          @if (ddMainTab() === 'portfolio' && acc.isInvestment) {
            <div class="portfolio-section">
              <!-- Summary Dashboard -->
              <div class="portfolio-summary-dashboard" style="display:grid; grid-template-columns: repeat(3, 1fr); gap:1rem; padding: 1.25rem; background: rgba(245,158,11,0.06); border: 1px solid rgba(245,158,11,0.18); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm);">
                <div>
                  <span class="portfolio-label" style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; font-weight:600; display:block; margin-bottom:0.25rem;">Market Value</span>
                  <span class="portfolio-total text-income" style="font-size:1.5rem; font-weight:800; display:block;">{{ getInvestmentValue(acc) | currencyFormat }}</span>
                </div>
                <div>
                  <span class="portfolio-label" style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; font-weight:600; display:block; margin-bottom:0.25rem;">Total Cost</span>
                  <span style="font-size:1.5rem; font-weight:800; display:block; color:var(--text-primary);">{{ getHoldingsCost(acc) | currencyFormat }}</span>
                </div>
                @let totalRet = getInvestmentValue(acc) - getHoldingsCost(acc);
                @let totalCostVal = getHoldingsCost(acc);
                @let totalRetPct = totalCostVal > 0 ? (totalRet / totalCostVal) * 100 : 0;
                <div>
                  <span class="portfolio-label" style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; font-weight:600; display:block; margin-bottom:0.25rem;">Total Return</span>
                  <span [class.text-income]="totalRet >= 0" [class.text-expense]="totalRet < 0" style="font-size:1.5rem; font-weight:800; display:block;">
                    {{ totalRet >= 0 ? '+' : '' }}{{ totalRet | currencyFormat }}
                    <span style="font-size:0.875rem; font-weight:600; margin-left:0.25rem;">({{ totalRet >= 0 ? '+' : '' }}{{ totalRetPct | number:'1.1-2' }}%)</span>
                  </span>
                </div>
              </div>

              <!-- Portfolio Sub-tabs -->
              <div class="portfolio-sub-tabs" style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid var(--border); padding-bottom:0.5rem; margin-top:0.5rem;">
                <div style="display:flex; gap:0.5rem;">
                  <button class="dd-main-tab" [class.active]="portfolioSubTab() === 'holdings'" (click)="portfolioSubTab.set('holdings')">
                    📊 Current Holdings
                  </button>
                  <button class="dd-main-tab" [class.active]="portfolioSubTab() === 'orders'" (click)="portfolioSubTab.set('orders')">
                    📝 Order History
                  </button>
                </div>
                <button class="btn btn-primary btn-sm" (click)="openAddOrder(acc)">+ Log Order</button>
              </div>

              <!-- Holdings View -->
              @if (portfolioSubTab() === 'holdings') {
                @if (!acc.stockHoldings?.length) {
                  <div class="dd-empty">
                    <span>📊</span>
                    <p>No holdings yet. Click "Log Order" to track a stock or ETF purchase.</p>
                  </div>
                } @else {
                  <div class="table-wrapper">
                    <table class="dd-table">
                      <thead>
                        <tr>
                          <th>Ticker</th>
                          <th class="text-right">Shares</th>
                          <th class="text-right">Avg Cost</th>
                          <th class="text-right">Total Cost</th>
                          <th class="text-right">Live Price</th>
                          <th class="text-right">Market Value</th>
                          <th class="text-right">Total Return</th>
                          <th class="text-right">Weight</th>
                          <th>Last Updated</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (h of acc.stockHoldings!; track h.id) {
                          @let cost = h.shares * h.costBasis;
                          @let value = h.shares * h.price;
                          @let ret = value - cost;
                          @let retP = h.costBasis > 0 ? (ret / cost) * 100 : 0;
                          <tr>
                            <td><span class="ticker-badge">{{ h.ticker }}</span></td>
                            <td class="text-right">{{ h.shares }}</td>
                            <td class="text-right"><span>&#36;</span>{{ h.costBasis | number:'1.2-2' }}</td>
                            <td class="text-right">{{ cost | currencyFormat }}</td>
                            <td class="text-right"><span>&#36;</span>{{ h.price | number:'1.2-2' }}</td>
                            <td class="text-right text-income">{{ value | currencyFormat }}</td>
                            <td class="text-right" [class.text-income]="ret >= 0" [class.text-expense]="ret < 0">
                              {{ ret >= 0 ? '+' : '' }}{{ ret | currencyFormat }}
                              <span style="font-size:0.7rem; display:block; font-weight:600;">{{ ret >= 0 ? '+' : '' }}{{ retP | number:'1.1-2' }}%</span>
                            </td>
                            <td class="text-right text-muted">
                              {{ getInvestmentValue(acc) > 0 ? ((value / getInvestmentValue(acc)) * 100 | number:'1.1-1') + '%' : '—' }}
                            </td>
                            <td class="dd-date">{{ h.updatedAt | date:'MMM d, y, h:mm a' }}</td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>

                  <!-- Allocation bar -->
                  <div class="alloc-bar-section">
                    <span class="alloc-label">Allocation</span>
                    <div class="alloc-bar">
                      @for (h of acc.stockHoldings!; track h.id; let i = $index) {
                        <div class="alloc-segment"
                             [style.width]="getInvestmentValue(acc) > 0 ? ((h.shares * h.price / getInvestmentValue(acc)) * 100) + '%' : '0'"
                             [style.background]="allocColors[i % allocColors.length]"
                             [title]="h.ticker + ': ' + (getInvestmentValue(acc) > 0 ? ((h.shares * h.price / getInvestmentValue(acc)) * 100 | number:'1.1-1') : '0') + '%'">
                        </div>
                      }
                    </div>
                    <div class="alloc-legend">
                      @for (h of acc.stockHoldings!; track h.id; let i = $index) {
                        <span class="alloc-item">
                          <span class="alloc-dot" [style.background]="allocColors[i % allocColors.length]"></span>
                          {{ h.ticker }}
                        </span>
                      }
                    </div>
                  </div>
                }
              }

              <!-- Orders View -->
              @if (portfolioSubTab() === 'orders') {
                @if (stockOrders().length === 0) {
                  <div class="dd-empty">
                    <span>📝</span>
                    <p>No orders logged yet. Click "Log Order" to record your purchases or sales.</p>
                  </div>
                } @else {
                  <div class="table-wrapper">
                    <table class="dd-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Ticker</th>
                          <th>Type</th>
                          <th class="text-right">Shares</th>
                          <th class="text-right">Price per Share</th>
                          <th class="text-right">Total Amount</th>
                          <th class="text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (o of stockOrders(); track o.id) {
                          <tr>
                            <td class="dd-date">{{ o.date }}</td>
                            <td><span class="ticker-badge">{{ o.ticker }}</span></td>
                            <td>
                              <span class="type-chip" [class.chip-income]="o.type === 'SELL'" [class.chip-expense]="o.type === 'BUY'">
                                {{ o.type }}
                              </span>
                            </td>
                            <td class="text-right">{{ o.shares }}</td>
                            <td class="text-right"><span>&#36;</span>{{ o.pricePerShare | number:'1.2-2' }}</td>
                            <td class="text-right" [class.text-income]="o.type === 'SELL'" [class.text-expense]="o.type === 'BUY'">
                              {{ o.type === 'SELL' ? '+' : '-' }}{{ (o.shares * o.pricePerShare) | currencyFormat }}
                            </td>
                            <td class="text-right">
                              <div style="display:flex;gap:0.25rem;justify-content:flex-end;">
                                <button class="btn btn-ghost btn-icon btn-sm" (click)="openEditOrder(acc, o)" title="Edit order">✏️</button>
                                <button class="btn btn-ghost btn-icon btn-sm" (click)="deleteOrder(acc, o)" title="Delete order">🗑️</button>
                              </div>
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                }
              }
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
            <div class="form-group">
              <label class="form-label">Currency *</label>
              <select class="form-control" [(ngModel)]="form.currency">
                @for (c of settingsService.currencies; track c.code) {
                  <option [value]="c.code">{{ c.code }} — {{ c.name }} ({{ c.symbol }})</option>
                }
              </select>
            </div>
            <div class="form-group" [class.disabled-field]="editingAccount()">
              <label class="form-label">Initial Balance</label>
              <div class="input-prefix">
                <span class="prefix">{{ settingsService.getSymbol(form.currency) }}</span>
                <input type="number" class="form-control" [(ngModel)]="form.initialBalance"
                       placeholder="0.00" step="0.01" [disabled]="!!editingAccount()">
              </div>
              @if (editingAccount()) {
                <span class="field-help text-xs text-muted" style="display: block; margin-top: 0.25rem;">Initial balance cannot be modified once the account is created. To adjust the balance, please log transactions.</span>
              } @else {
                <span class="field-help text-xs text-muted" style="display: block; margin-top: 0.25rem;">💡 **Tip:** If you plan to import or log past transactions for this account, set the initial balance to what it was *before* those transactions took place. Otherwise, leave it as 0.</span>
              }
            </div>

            <!-- Investment toggle -->
            <div class="form-group">
              <label class="form-label invest-toggle-label">
                <input type="checkbox" [(ngModel)]="form.isInvestment" class="invest-checkbox">
                <span class="invest-toggle-text">📈 Investment Account (holds stocks / ETFs)</span>
              </label>
              @if (form.isInvestment) {
                <p class="field-help text-xs text-muted" style="margin-top:0.4rem;">
                  Investment accounts let you track share positions. The total balance will include both deposited cash and the live market value of your holdings.
                </p>
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

    <!-- Add / Edit Order Modal -->
    @if (showOrderForm()) {
      <div class="modal-overlay" (click)="onOrderOverlayClick($event)">
        <div class="modal" style="max-width: 440px;" role="dialog" aria-modal="true">
          <div class="modal-header">
            <h3>{{ editingOrder() ? 'Edit Order' : 'Add Stock Order' }}</h3>
            <button class="btn btn-ghost btn-icon" (click)="closeOrderForm()">✕</button>
          </div>
          <div class="modal-body">
            <!-- Ticker (Disabled if editing) -->
            @if (!editingOrder()) {
              <div class="form-group" style="position: relative;">
                <label class="form-label">Ticker Symbol *</label>
                <input type="text" class="form-control" 
                       [ngModel]="orderForm.ticker"
                       (ngModelChange)="onTickerInput($event)"
                       (keydown)="onTickerKeydown($event)"
                       placeholder="e.g. AAPL, VFV.TO"
                       style="text-transform:uppercase;"
                       autocomplete="off">
                
                <!-- Autocomplete Dropdown -->
                @if (suggestions().length > 0) {
                  <div class="autocomplete-dropdown">
                    @for (s of suggestions(); track s.symbol; let idx = $index) {
                      <div class="autocomplete-item" 
                           [class.active]="idx === selectedSuggestionIndex()"
                           (click)="selectSuggestion(s)">
                        <span class="ac-item-sym">{{ s.symbol }}</span>
                        <span class="ac-item-name">{{ s.name }}</span>
                        <span class="ac-item-exch">{{ s.exchange }}</span>
                      </div>
                    }
                  </div>
                }
                
                @if (fetchingPrice()) {
                  <span class="field-help text-xs text-muted" style="display:block;margin-top:0.3rem;">⚡ Fetching price...</span>
                } @else if (priceMessage()) {
                  <span class="field-help text-xs text-income" style="display:block;margin-top:0.3rem;font-weight:600;">{{ priceMessage() }}</span>
                } @else {
                  <span class="field-help text-xs text-muted" style="display:block;margin-top:0.3rem;">
                    Type Yahoo Finance ticker. Autocomplete suggestions will appear.
                  </span>
                }
              </div>
            } @else {
              <div class="form-group">
                <label class="form-label">Ticker</label>
                <input type="text" class="form-control" [value]="editingOrder()!.ticker" disabled>
              </div>
            }

            <!-- Type: BUY or SELL (Disabled if editing) -->
            <div class="form-group">
              <label class="form-label">Order Type *</label>
              <div style="display:flex; gap:0.5rem;">
                <button type="button" class="btn btn-outline" style="flex:1;"
                        [class.active-buy]="orderForm.type === 'BUY'"
                        [disabled]="!!editingOrder()"
                        (click)="orderForm.type = 'BUY'">🟢 BUY</button>
                <button type="button" class="btn btn-outline" style="flex:1;"
                        [class.active-sell]="orderForm.type === 'SELL'"
                        [disabled]="!!editingOrder()"
                        (click)="orderForm.type = 'SELL'">🔴 SELL</button>
              </div>
            </div>

            <!-- Shares -->
            <div class="form-group">
              <label class="form-label">Number of Shares *</label>
              <input type="number" class="form-control" [(ngModel)]="orderForm.shares"
                     placeholder="e.g. 10" step="0.0001" min="0.0001">
            </div>

            <!-- Price per Share -->
            <div class="form-group">
              <label class="form-label">Price per Share ($) *</label>
              <input type="number" class="form-control" [(ngModel)]="orderForm.pricePerShare"
                     placeholder="e.g. 150.00" step="0.01" min="0.01">
            </div>

            <!-- Date -->
            <div class="form-group">
              <label class="form-label">Order Date *</label>
              <input type="date" class="form-control" [(ngModel)]="orderForm.date">
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" (click)="closeOrderForm()">Cancel</button>
            <button class="btn btn-primary" (click)="saveOrder()" 
                    [disabled]="savingOrder() || !orderForm.shares || !orderForm.pricePerShare || !orderForm.ticker || !orderForm.date">
              {{ savingOrder() ? 'Saving…' : editingOrder() ? 'Update Order' : 'Log Order' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .accounts-page { padding: 1.5rem 2rem; display: flex; flex-direction: column; gap: 1.5rem; }

    /* ── Net Worth Banner ─────────────────────────────────────────── */
    .net-worth-banner {
      background: linear-gradient(135deg, rgba(92, 107, 192, 0.25) 0%, rgba(103, 58, 183, 0.15) 50%, rgba(3, 169, 244, 0.1) 100%);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: var(--radius-lg);
      padding: 2rem 2.5rem;
      display: flex;
      justify-content: center;
      align-items: center;
      text-align: center;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25), var(--shadow-glow-blue);
      position: relative;
      overflow: hidden;
    }
    .net-worth-banner::before {
      content: '';
      position: absolute;
      inset: 0;
      background: radial-gradient(circle at top left, rgba(255, 255, 255, 0.04), transparent 75%);
      pointer-events: none;
    }
    .nw-content { display: flex; flex-direction: column; gap: 0.5rem; }
    .nw-label { font-size: 0.875rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .nw-value { font-size: 2.5rem; font-weight: 800; color: var(--accent-green); margin: 0; }
    .nw-value.negative { color: var(--accent-red); }
    .nw-sub { font-size: 0.75rem; }

    /* ── Type Tabs ────────────────────────────────────────────────── */
    .type-tabs { display: flex; gap: 0.5rem; flex-wrap: wrap; }
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
    .account-card.investment-card { border-left: 3px solid #f59e0b !important; }
    .account-card:not(.liability-card):not(.investment-card) { border-left: 3px solid var(--accent-green); }

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
    .ac-icon.investment-icon { background: rgba(245,158,11,0.15); border-color: rgba(245,158,11,0.35); }

    .ac-info { display: flex; flex-direction: column; gap: 0.25rem; width: 70%; }
    .ac-name { font-size: 1rem; font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ac-type { font-size: 0.7rem; align-self: flex-start; }
    .badge-invest { background: rgba(245,158,11,0.18); color: #f59e0b; font-size: 0.7rem; padding: 0.15rem 0.5rem; border-radius: 100px; font-weight: 600; }

    .ac-balance { display: flex; flex-direction: column; gap: 0.125rem; margin-top: 0.5rem; }
    .balance-label { font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.02em; }
    .balance-value { font-size: 1.375rem; font-weight: 800; color: var(--text-primary); }
    .balance-sub { font-size: 0.7rem; color: var(--text-muted); }

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

    /* Main Sub-tabs */
    .dd-main-tabs { display: flex; gap: 0.5rem; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; }
    .dd-main-tab {
      padding: 0.45rem 1rem;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--text-secondary);
      font-size: 0.8125rem;
      font-weight: 600;
      cursor: pointer;
      transition: var(--transition);
      font-family: inherit;
    }
    .dd-main-tab:hover { background: var(--bg-card); }
    .dd-main-tab.active { background: rgba(92,107,192,0.18); border-color: var(--accent-blue); color: var(--accent-blue-light); }

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

    /* ── Portfolio ── */
    .portfolio-section { display: flex; flex-direction: column; gap: 1rem; }
    .portfolio-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 0.75rem 1rem;
      background: rgba(245,158,11,0.07);
      border: 1px solid rgba(245,158,11,0.22);
      border-radius: var(--radius-sm);
    }
    .portfolio-label { font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; display: block; margin-bottom: 0.15rem; }
    .portfolio-total { font-size: 1.375rem; font-weight: 800; }

    .ticker-badge {
      display: inline-block;
      padding: 0.2rem 0.6rem;
      background: rgba(92,107,192,0.15);
      color: var(--accent-blue-light);
      border-radius: var(--radius-sm);
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      font-family: monospace;
    }

    /* Allocation bar */
    .alloc-bar-section { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.25rem; }
    .alloc-label { font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600; letter-spacing: 0.04em; }
    .alloc-bar {
      height: 10px;
      border-radius: 100px;
      display: flex;
      overflow: hidden;
      background: var(--border);
    }
    .alloc-segment { height: 100%; transition: width 0.4s ease; }
    .alloc-legend { display: flex; gap: 0.75rem; flex-wrap: wrap; }
    .alloc-item { display: flex; align-items: center; gap: 0.3rem; font-size: 0.75rem; color: var(--text-secondary); }
    .alloc-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

    /* ── Form helpers ─────────────────────────────────────────────── */
    .input-prefix { position: relative; }
    .prefix {
      position: absolute; left: 0.875rem; top: 50%;
      transform: translateY(-50%);
      color: var(--text-muted); font-weight: 600;
    }
    .input-prefix .form-control { padding-left: 1.75rem; }

    .invest-toggle-label { display: flex; align-items: center; gap: 0.625rem; cursor: pointer; font-size: 0.875rem; font-weight: 600; color: var(--text-primary); }
    .invest-checkbox { width: 16px; height: 16px; cursor: pointer; accent-color: #f59e0b; }
    .invest-toggle-text { user-select: none; }

    .btn-outline {
      background: transparent;
      border: 1px solid var(--border-light);
      color: var(--text-secondary);
      padding: 0.5rem 1rem;
      border-radius: var(--radius-sm);
      font-size: 0.8125rem;
      font-weight: 500;
      cursor: pointer;
      transition: var(--transition);
      font-family: inherit;
    }
    .btn-outline:hover:not(:disabled) { border-color: var(--accent-blue); color: var(--accent-blue-light); }
    .btn-outline:disabled { opacity: 0.5; cursor: not-allowed; }

    @media (max-width: 1024px) { .dd-stats { grid-template-columns: repeat(3, 1fr); } }
    @media (max-width: 768px)  {
      .accounts-page { padding: 1rem; }
      .dd-stats { grid-template-columns: repeat(2, 1fr); }
      .dd-header { flex-direction: column; }
      .dd-header-right { width: 100%; justify-content: space-between; }
    }
    @media (max-width: 600px) {
      .type-tabs {
        flex-wrap: nowrap;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        padding-bottom: 0.5rem;
        width: 100%;
      }
      .tab-btn { flex-shrink: 0; }
    }
    @media (max-width: 480px) { 
      .dd-stats { grid-template-columns: 1fr 1fr; } 
      .accounts-grid { grid-template-columns: 1fr; }
    }

    /* Autocomplete dropdown styles */
    .autocomplete-dropdown {
      position: absolute;
      top: 100%; left: 0; right: 0;
      background: #1a1b2f;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      max-height: 180px;
      overflow-y: auto;
      z-index: 1000;
      box-shadow: 0 6px 20px rgba(0,0,0,0.5);
    }
    .autocomplete-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.625rem 0.875rem;
      cursor: pointer;
      border-bottom: 1px solid rgba(255,255,255,0.03);
      font-size: 0.8125rem;
    }
    .autocomplete-item:last-child { border-bottom: none; }
    .autocomplete-item:hover, .autocomplete-item.active {
      background: rgba(92,107,192,0.25);
    }
    .ac-item-sym { font-weight: 700; color: var(--accent-blue-light); font-family: monospace; }
    .ac-item-name { flex: 1; margin: 0 0.75rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-primary); }
    .ac-item-exch { font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; }

    /* Active BUY/SELL buttons */
    .active-buy {
      background: rgba(76,175,80,0.2) !important;
      border-color: var(--accent-green) !important;
      color: var(--accent-green) !important;
      font-weight: 600;
    }
    .active-sell {
      background: rgba(239,83,80,0.2) !important;
      border-color: var(--accent-red) !important;
      color: var(--accent-red) !important;
      font-weight: 600;
    }
  `]
})
export class AccountsComponent implements OnInit {
  accountService  = inject(AccountService);
  settingsService = inject(SettingsService);
  private api         = inject(ApiService);
  private catService  = inject(CategoryService);
  private toast       = inject(ToastService);

  readonly allocColors = [
    '#5c6bc0','#26a69a','#f59e0b','#ef5350','#ab47bc',
    '#42a5f5','#66bb6a','#ff7043','#ec407a','#29b6f6'
  ];

  // ── UI state ──────────────────────────────────────────────────────
  activeTab       = signal<'all' | 'asset' | 'liability' | 'investment'>('all');
  showForm        = signal(false);
  editingAccount  = signal<Account | undefined>(undefined);
  deletingAccount = signal<Account | undefined>(undefined);
  submitting      = signal(false);

  // ── Drilldown state ───────────────────────────────────────────────
  selectedAccount = signal<Account | undefined>(undefined);
  drilldownType   = signal<'all' | 'income' | 'expense' | 'transfer'>('all');
  ddMainTab       = signal<'transactions' | 'portfolio'>('transactions');
  accountTransactions = signal<Transaction[]>([]);

  // Default date range: start of current year → today
  private today = new Date().toLocaleDateString('en-CA');
  private yearStart = `${new Date().getFullYear()}-01-01`;
  drilldownFrom = signal(this.yearStart);
  drilldownTo   = signal(this.today);

  form = { name: '', type: 'asset' as 'asset' | 'liability', initialBalance: null as number | null, isInvestment: false, currency: 'USD' };

  // ── Portfolio & Order state ──────────────────────────────────────
  portfolioSubTab  = signal<'holdings' | 'orders'>('holdings');
  stockOrders      = signal<StockOrder[]>([]);
  showOrderForm    = signal(false);
  orderAccountId   = signal<string>('');
  editingOrder     = signal<StockOrder | undefined>(undefined);
  orderForm        = { ticker: '', type: 'BUY' as 'BUY' | 'SELL', shares: null as number | null, pricePerShare: null as number | null, date: '' };
  savingOrder      = signal(false);

  // Autocomplete states
  suggestions             = signal<any[]>([]);
  selectedSuggestionIndex = signal<number>(-1);
  fetchingPrice           = signal<boolean>(false);
  priceMessage            = signal<string>('');

  // Legacy compatibility (retaining definitions so no compilation issues)
  showHoldingForm  = signal(false);
  holdingAccountId = signal<string>('');
  editingHolding   = signal<StockHolding | undefined>(undefined);
  holdingForm      = { ticker: '', shares: null as number | null };
  savingHolding    = signal(false);

  loadAccountTransactions(accountId: string) {
    this.api.getTransactions({ accountId, limit: 'all' }).subscribe(res => {
      if (res.success && res.data) {
        const txns = Array.isArray(res.data) ? res.data : (res.data.transactions || []);
        this.accountTransactions.set(txns);
      }
    });
  }

  // ── Computed: transactions for selected account within date range ──
  drilldownTxns = computed<Transaction[]>(() => {
    const acc = this.selectedAccount();
    if (!acc) return [];
    const from = this.drilldownFrom();
    const to   = this.drilldownTo();
    const type = this.drilldownType();

    return this.accountTransactions()
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
    const all = this.accountTransactions().filter(t => {
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
    if (tab === 'asset')      return this.accountService.assetAccounts();
    if (tab === 'liability')  return this.accountService.liabilityAccounts();
    if (tab === 'investment') return this.accountService.investmentAccounts();
    return this.accountService.accounts();
  }

  getAccountBalance(id: string): number {
    return this.accountService.accountBalances()[id] ?? 0;
  }

  getInvestmentValue(acc: Account): number {
    if (!acc.stockHoldings?.length) return 0;
    return acc.stockHoldings.reduce((s, h) => s + h.shares * h.price, 0);
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
    this.catService.loadCategories().subscribe();
  }

  // ── Drilldown ─────────────────────────────────────────────────────
  selectAccount(acc: Account) {
    if (this.selectedAccount()?.id === acc.id) {
      this.selectedAccount.set(undefined); // toggle off
    } else {
      this.selectedAccount.set(acc);
      this.drilldownType.set('all');
      this.ddMainTab.set(acc.isInvestment ? 'portfolio' : 'transactions');
      this.loadAccountTransactions(acc.id);
      if (acc.isInvestment) {
        this.loadAccountOrders(acc.id);
      }
    }
  }

  closePanel() {
    this.selectedAccount.set(undefined);
  }

  // ── Account CRUD ──────────────────────────────────────────────────
  openForm() {
    this.form = { name: '', type: 'asset', initialBalance: null, isInvestment: false, currency: 'USD' };
    this.editingAccount.set(undefined);
    this.showForm.set(true);
  }

  editAccount(acc: Account) {
    this.form = {
      name: acc.name,
      type: acc.type,
      initialBalance: acc.initialBalance != null ? Math.abs(acc.initialBalance) : null,
      isInvestment: !!acc.isInvestment,
      currency: acc.currency || 'USD'
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
    let payload: any = { 
      name: this.form.name, 
      type: this.form.type, 
      isInvestment: this.form.isInvestment,
      currency: this.form.currency || 'USD'
    };
    
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

  // ── Stock Price Refresh ───────────────────────────────────────────
  refreshPrices() {
    this.accountService.refreshStockPrices().subscribe(() => {
      this.toast.success('Stock prices updated!');
      // Sync selectedAccount signal if it's an investment account
      const sel = this.selectedAccount();
      if (sel?.isInvestment) {
        const fresh = this.accountService.getAccountById(sel.id);
        if (fresh) this.selectedAccount.set(fresh);
      }
    });
  }

  // ── Holdings CRUD ─────────────────────────────────────────────────
  openAddHolding(acc: Account) {
    this.holdingAccountId.set(acc.id);
    this.editingHolding.set(undefined);
    this.holdingForm = { ticker: '', shares: null };
    this.showHoldingForm.set(true);
  }

  openEditHolding(acc: Account, h: StockHolding) {
    this.holdingAccountId.set(acc.id);
    this.editingHolding.set(h);
    this.holdingForm = { ticker: h.ticker, shares: h.shares };
    this.showHoldingForm.set(true);
  }

  closeHoldingForm() {
    this.showHoldingForm.set(false);
    this.editingHolding.set(undefined);
  }

  saveHolding() {
    if (!this.holdingForm.shares) return;
    const accId = this.holdingAccountId();
    this.savingHolding.set(true);

    const obs = this.editingHolding()
      ? this.accountService.updateHolding(accId, this.editingHolding()!.id, this.holdingForm.shares)
      : this.accountService.addHolding(accId, this.holdingForm.ticker, this.holdingForm.shares);

    obs.subscribe(() => {
      this.savingHolding.set(false);
      this.closeHoldingForm();
      // Sync selectedAccount
      const fresh = this.accountService.getAccountById(accId);
      if (fresh) this.selectedAccount.set(fresh);
      this.toast.success(this.editingHolding() ? 'Holding updated!' : 'Holding added with live price!');
    });
  }

  deleteHolding(acc: Account, h: StockHolding) {
    this.accountService.deleteHolding(acc.id, h.id).subscribe(() => {
      const fresh = this.accountService.getAccountById(acc.id);
      if (fresh) this.selectedAccount.set(fresh);
      this.toast.success('Holding removed');
    });
  }

  onHoldingOverlayClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('modal-overlay')) this.closeHoldingForm();
  }

  loadAccountOrders(accountId: string) {
    this.accountService.getStockOrders(accountId).subscribe(res => {
      if (res.success) {
        this.stockOrders.set(res.data);
      }
    });
  }

  getHoldingsCost(acc: Account): number {
    if (!acc.stockHoldings?.length) return 0;
    return acc.stockHoldings.reduce((s, h) => s + h.shares * (h.costBasis ?? 0), 0);
  }

  // ── Stock Orders CRUD ──────────────────────────────────────────────
  openAddOrder(acc: Account) {
    this.orderAccountId.set(acc.id);
    this.editingOrder.set(undefined);
    this.orderForm = {
      ticker: '',
      type: 'BUY',
      shares: null,
      pricePerShare: null,
      date: new Date().toISOString().split('T')[0]
    };
    this.suggestions.set([]);
    this.selectedSuggestionIndex.set(-1);
    this.priceMessage.set('');
    this.showOrderForm.set(true);
  }

  openEditOrder(acc: Account, o: StockOrder) {
    this.orderAccountId.set(acc.id);
    this.editingOrder.set(o);
    this.orderForm = {
      ticker: o.ticker,
      type: o.type,
      shares: o.shares,
      pricePerShare: o.pricePerShare,
      date: o.date
    };
    this.suggestions.set([]);
    this.selectedSuggestionIndex.set(-1);
    this.priceMessage.set('');
    this.showOrderForm.set(true);
  }

  closeOrderForm() {
    this.showOrderForm.set(false);
    this.editingOrder.set(undefined);
  }

  saveOrder() {
    if (!this.orderForm.shares || !this.orderForm.pricePerShare || !this.orderForm.ticker || !this.orderForm.date) return;
    const accId = this.orderAccountId();
    this.savingOrder.set(true);

    const obs = this.editingOrder()
      ? this.accountService.updateStockOrder(accId, this.editingOrder()!.id, this.orderForm.shares, this.orderForm.pricePerShare, this.orderForm.date)
      : this.accountService.addStockOrder(accId, this.orderForm.ticker, this.orderForm.type, this.orderForm.shares, this.orderForm.pricePerShare, this.orderForm.date);

    obs.subscribe(res => {
      this.savingOrder.set(false);
      if (res && res.success) {
        this.closeOrderForm();
        const fresh = this.accountService.getAccountById(accId);
        if (fresh) this.selectedAccount.set(fresh);
        this.loadAccountOrders(accId);
        this.toast.success(this.editingOrder() ? 'Order updated!' : 'Order logged successfully!');
      } else {
        this.toast.error('Failed to log order');
      }
    });
  }

  deleteOrder(acc: Account, o: StockOrder) {
    if (confirm(`Are you sure you want to delete this order?`)) {
      this.accountService.deleteStockOrder(acc.id, o.id).subscribe(res => {
        if (res && res.success) {
          const fresh = this.accountService.getAccountById(acc.id);
          if (fresh) this.selectedAccount.set(fresh);
          this.loadAccountOrders(acc.id);
          this.toast.success('Order deleted');
        } else {
          this.toast.error('Failed to delete order');
        }
      });
    }
  }

  onOrderOverlayClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('modal-overlay')) this.closeOrderForm();
  }

  // ── Autocomplete Search handlers ───────────────────────────────────
  onTickerInput(val: string) {
    this.orderForm.ticker = val.toUpperCase();
    const query = val.trim();
    if (query.length < 2) {
      this.suggestions.set([]);
      return;
    }
    this.accountService.api.searchStocks(query).subscribe(res => {
      if (res.success) {
        this.suggestions.set(res.data || []);
        this.selectedSuggestionIndex.set(-1);
      }
    });
  }

  onTickerKeydown(e: KeyboardEvent) {
    const list = this.suggestions();
    if (list.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.selectedSuggestionIndex.update(idx => Math.min(list.length - 1, idx + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.selectedSuggestionIndex.update(idx => Math.max(0, idx - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const idx = this.selectedSuggestionIndex();
      if (idx >= 0 && idx < list.length) {
        this.selectSuggestion(list[idx]);
      } else if (list.length > 0) {
        this.selectSuggestion(list[0]);
      }
    } else if (e.key === 'Escape') {
      this.suggestions.set([]);
    }
  }

  selectSuggestion(s: any) {
    this.orderForm.ticker = s.symbol;
    this.suggestions.set([]);
    this.selectedSuggestionIndex.set(-1);

    this.fetchingPrice.set(true);
    this.priceMessage.set('Fetching live price...');
    this.accountService.api.getStockPrice(s.symbol).subscribe(res => {
      this.fetchingPrice.set(false);
      if (res.success && res.data && res.data.price !== null) {
        this.orderForm.pricePerShare = res.data.price;
        this.priceMessage.set(`Live Price: $${res.data.price.toFixed(2)} (${s.name})`);
      } else {
        this.priceMessage.set(`Selected: ${s.name} (Live price unavailable. Enter manually)`);
      }
    });
  }
}

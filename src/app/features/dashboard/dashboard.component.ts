import { Component, OnInit, inject, signal, computed, AfterViewInit, ElementRef, ViewChild, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TransactionService } from '../../core/services/transaction.service';
import { CategoryService } from '../../core/services/category.service';
import { parseLocalDate } from '../../shared/utils/date.utils';
import { BudgetService } from '../../core/services/budget.service';
import { AccountService } from '../../core/services/account.service';
import { ApiService } from '../../core/services/api.service';
import { GoalService } from '../../core/services/goal.service';
import { RecurringService } from '../../core/services/recurring.service';
import { HeaderComponent } from '../../layout/header.component';
import { CurrencyFormatPipe } from '../../shared/pipes/currency-format.pipe';
import { AnomalyDetectorComponent } from '../../shared/components/anomaly-detector.component';
import { Chart, registerables } from 'chart.js';
import { Goal } from '../../core/models';
import { SettingsService } from '../../core/services/settings.service';

Chart.register(...registerables);

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, HeaderComponent, CurrencyFormatPipe, AnomalyDetectorComponent],
  template: `
    <app-header title="Dashboard" subtitle="Your financial overview at a glance">
      <button class="btn btn-primary btn-sm" routerLink="/quick-log">⚡ Quick Log</button>
    </app-header>

    <div class="dashboard-content">

      <!-- Getting Started Guide -->
      @if (showOnboarding() && settingsService.dashboardWidgets().onboarding) {
        <div class="onboarding-card">
          <button class="onboarding-close-btn" (click)="dismissOnboarding.set(true)" title="Dismiss checklist">✕</button>
          
          <div class="ob-header">
            <h3 class="ob-title">👋 Welcome to FinTrack Pro!</h3>
            <p class="ob-subtitle">Let's get your dashboard set up. Follow these quick steps to get a full view of your financial health.</p>
          </div>

          <div class="ob-progress-wrap">
            <div class="ob-progress-info">
              <span>Setup Progress</span>
              <span class="ob-progress-pct">{{ onboardingProgress() }} of 4 steps completed ({{ onboardingProgress() * 25 }}%)</span>
            </div>
            <div class="ob-progress-track">
              <div class="ob-progress-fill" [style.width.%]="onboardingProgress() * 25"></div>
            </div>
          </div>

          <div class="ob-list">
            <!-- Step 1: Add Account -->
            <div class="ob-item" [class.completed]="hasAccounts()">
              <div class="ob-item-content">
                <div class="ob-icon-wrapper">🏦</div>
                <div class="ob-text-wrap">
                  <span class="ob-item-title">Add your first account</span>
                  <span class="ob-item-desc">Create checkings, savings or credit cards</span>
                </div>
              </div>
              @if (hasAccounts()) {
                <div class="ob-check-mark">✓</div>
              } @else {
                <a routerLink="/accounts" class="ob-action-link">Add →</a>
              }
            </div>

            <!-- Step 2: Log Transaction -->
            <div class="ob-item" [class.completed]="hasTransactions()">
              <div class="ob-item-content">
                <div class="ob-icon-wrapper">⚡</div>
                <div class="ob-text-wrap">
                  <span class="ob-item-title">Log a transaction</span>
                  <span class="ob-item-desc">Record an income or expense transaction</span>
                </div>
              </div>
              @if (hasTransactions()) {
                <div class="ob-check-mark">✓</div>
              } @else {
                <a routerLink="/quick-log" class="ob-action-link">Log →</a>
              }
            </div>

            <!-- Step 3: Set Budget -->
            <div class="ob-item" [class.completed]="hasBudgets()">
              <div class="ob-item-content">
                <div class="ob-icon-wrapper">🎯</div>
                <div class="ob-text-wrap">
                  <span class="ob-item-title">Set a category budget</span>
                  <span class="ob-item-desc">Control outflows with a monthly ceiling</span>
                </div>
              </div>
              @if (hasBudgets()) {
                <div class="ob-check-mark">✓</div>
              } @else {
                <a routerLink="/budgets" class="ob-action-link">Set →</a>
              }
            </div>

            <!-- Step 4: Add Recurring Bill -->
            <div class="ob-item" [class.completed]="hasSchedules()">
              <div class="ob-item-content">
                <div class="ob-icon-wrapper">📅</div>
                <div class="ob-text-wrap">
                  <span class="ob-item-title">Schedule a recurring bill</span>
                  <span class="ob-item-desc">Track subscriptions & payments easily</span>
                </div>
              </div>
              @if (hasSchedules()) {
                <div class="ob-check-mark">✓</div>
              } @else {
                <a routerLink="/budgets" class="ob-action-link">Schedule →</a>
              }
            </div>
          </div>
        </div>
      }

      <!-- Month comparison bar -->
      @if (settingsService.dashboardWidgets().monthComparison) {
        <div class="month-bar">
          <div class="month-stat">
            <span class="ms-label">This Month</span>
            <span class="ms-value text-income">+{{ thisMonthIncome() | currencyFormat }}</span>
            <span class="ms-value text-expense">-{{ thisMonthExpenses() | currencyFormat }}</span>
            <a routerLink="/insights" [queryParams]="{ mode: 'this-month' }" class="ms-link">View Insights →</a>
          </div>
          <div class="month-divider"></div>
          <div class="month-stat">
            <span class="ms-label">Last Month</span>
            <span class="ms-value text-income">+{{ lastMonthIncome() | currencyFormat }}</span>
            <span class="ms-value text-expense">-{{ lastMonthExpenses() | currencyFormat }}</span>
            <a routerLink="/insights" [queryParams]="{ mode: 'last-month' }" class="ms-link">View Insights →</a>
          </div>
          <div class="month-divider"></div>
          <div class="month-stat">
            <span class="ms-label">Expense Change</span>
            @if (lastMonthExpenses() === 0) {
              <span class="ms-value text-muted">No prior data</span>
            } @else {
              <span class="ms-value"
                    [class.text-income]="expenseChange() <= 0"
                    [class.text-expense]="expenseChange() > 0">
                {{ expenseChange() > 0 ? '▲' : '▼' }}
                {{ Math.min(Math.abs(expenseChange()), 999) | number:'1.0-0' }}%
              </span>
            }
          </div>
          <div class="month-divider"></div>
          <div class="month-stat">
            <span class="ms-label">Health Score</span>
            <div class="health-score" [class.good]="healthScore() >= 70" [class.ok]="healthScore() >= 40 && healthScore() < 70" [class.bad]="healthScore() < 40">
              <span class="hs-num">{{ healthScore() }}</span>
              <span class="hs-label">/100</span>
            </div>
          </div>
        </div>
      }

      <!-- System Alerts & Auditing -->
      @if (settingsService.dashboardWidgets().anomalyDetector) {
        <app-anomaly-detector></app-anomaly-detector>
      }

      <!-- Summary Cards -->
      @if (settingsService.dashboardWidgets().summaryGrid) {
        <div class="summary-grid">
          <div class="summary-card income-card">
            <div class="summary-icon">📈</div>
            <div class="summary-info">
              <span class="summary-label">Total Income</span>
              <span class="summary-value text-income">{{ currentMonthSummary().totalIncome | currencyFormat }}</span>
              <span class="summary-sub">{{ currentPeriod }}</span>
            </div>
          </div>
          <div class="summary-card expense-card">
            <div class="summary-icon">📉</div>
            <div class="summary-info">
              <span class="summary-label">Total Expenses</span>
              <span class="summary-value text-expense">{{ currentMonthSummary().totalExpenses | currencyFormat }}</span>
              <span class="summary-sub">{{ currentPeriod }}</span>
            </div>
          </div>
          <div class="summary-card balance-card" [class.positive]="currentMonthSummary().netBalance >= 0" [class.negative]="currentMonthSummary().netBalance < 0">
            <div class="summary-icon">{{ currentMonthSummary().netBalance >= 0 ? '💚' : '🔴' }}</div>
            <div class="summary-info">
              <span class="summary-label">Net Balance</span>
              <span class="summary-value" [class.text-income]="currentMonthSummary().netBalance >= 0" [class.text-expense]="currentMonthSummary().netBalance < 0">
                {{ currentMonthSummary().netBalance | currencyFormat }}
              </span>
              <span class="summary-sub">
                {{ savingsRate() >= 0 ? savingsRate() + '% savings rate' : 'Spending deficit' }}
              </span>
            </div>
          </div>
          <div class="summary-card txn-card">
            <div class="summary-icon">🔢</div>
            <div class="summary-info">
              <span class="summary-label">Transactions</span>
              <span class="summary-value">{{ currentMonthSummary().transactionCount }}</span>
              <span class="summary-sub">Avg: {{ currentMonthSummary().avgTransaction | currencyFormat }}</span>
            </div>
          </div>
        </div>
      }

      <!-- Charts Row -->
      @if (settingsService.dashboardWidgets().chartsRow) {
        <div class="charts-row">
          <div class="card chart-card">
            <div class="card-header"><span class="card-title">Income vs Expenses</span></div>
            <div class="chart-container-sm"><canvas #doughnutChart></canvas></div>
          </div>
          <div class="card chart-card chart-card-wide">
            <div class="card-header"><span class="card-title">Monthly Trend ({{ currentYear }})</span></div>
            <div class="chart-container"><canvas #barChart></canvas></div>
          </div>
        </div>
      }

      <!-- Bottom Row -->
      @if (settingsService.dashboardWidgets().bottomRow || settingsService.dashboardWidgets().upcomingBills || settingsService.dashboardWidgets().categorySpend) {
        <div class="bottom-row">
          @if (settingsService.dashboardWidgets().bottomRow) {
            <!-- Recent Transactions -->
            <div class="card recent-card">
          <div class="card-header">
            <span class="card-title">Recent Transactions</span>
            <a routerLink="/transactions" class="btn btn-ghost btn-sm">View All</a>
          </div>
          @if (txnService.loading()) {
            @for (i of [1,2,3,4,5]; track i) {
              <div class="skeleton" style="height:52px;margin-bottom:8px;border-radius:8px;"></div>
            }
          } @else if (recentTransactions().length === 0) {
            <div class="empty-state">
              <span class="empty-icon">💳</span>
              <p>No transactions this month</p>
              <a routerLink="/quick-log" class="btn btn-primary btn-sm">⚡ Quick Log</a>
            </div>
          } @else {
            <div class="txn-list">
              @for (txn of recentTransactions(); track txn.id) {
                <div class="txn-item">
                  <div class="txn-icon">{{ txn.type === 'transfer' ? '🔄' : getCategoryIcon(txn.category) }}</div>
                  <div class="txn-details">
                    <span class="txn-desc">{{ txn.description }}</span>
                    <span class="txn-meta">
                      @if (txn.type === 'transfer') {
                        <span class="text-accent" style="font-weight: 500;">
                          Transfer: {{ getAccountName(txn.accountId) }} ➔ {{ getAccountName(txn.toAccountId || '') }}
                        </span>
                      } @else {
                        {{ getCategoryName(txn.category) }}
                      }
                      · {{ formatDate(txn.date) }}
                      @if (txn.isRecurring) { <span class="recurring-badge">🔄</span> }
                    </span>
                  </div>
                  <span class="txn-amount" 
                        [class.text-income]="txn.type === 'income'" 
                        [class.text-expense]="txn.type === 'expense'"
                        [class.text-accent]="txn.type === 'transfer'">
                    {{ txn.type === 'income' ? '+' : txn.type === 'expense' ? '-' : '' }}{{ txn.amount | currencyFormat:getAccountCurrencySymbol(txn.accountId) }}
                  </span>
                </div>
              }
            </div>
          }
        </div>

        <!-- Accounts & Balances -->
        <div class="card accounts-card">
          <div class="card-header">
            <span class="card-title">Accounts & Balances</span>
            <a routerLink="/accounts" class="btn btn-ghost btn-sm">Manage</a>
          </div>
          <div class="net-worth-section">
            <span class="nw-label">Net Worth</span>
            <span class="nw-value" [class.negative]="accountService.netWorth() < 0">
              {{ accountService.netWorth() < 0 ? '-' : '' }}{{ accountService.netWorth() | currencyFormat }}
            </span>
          </div>
          <div class="account-list-mini">
            @for (acc of accountService.accounts(); track acc.id) {
              @let balance = accountService.accountBalances()[acc.id] || 0;
              <div class="mini-account-item">
                <span class="mini-acc-icon">{{ acc.type === 'asset' ? '🏦' : '💳' }}</span>
                <div class="mini-acc-details">
                  <span class="mini-acc-name">{{ acc.name }}</span>
                  <span class="mini-acc-type">{{ acc.type === 'asset' ? 'Asset' : 'Liability' }}</span>
                </div>
                <span class="mini-acc-balance"
                      [class.text-income]="acc.type === 'asset' && balance >= 0"
                      [class.text-expense]="acc.type === 'liability' || balance < 0">
                  {{ acc.type === 'asset' && balance < 0 ? '-' : '' }}{{ balance | currencyFormat:settingsService.getSymbol(acc.currency || 'USD') }}
                </span>
              </div>
            }
          </div>
        </div>

        <!-- Budget Alerts -->
        <div class="card budget-card">
          <div class="card-header">
            <span class="card-title">Budget Status</span>
            <a routerLink="/budgets" class="btn btn-ghost btn-sm">Manage</a>
          </div>

          @let pacing = budgetService.pacingStatus();
          @if (budgetService.totalPlannedOutflow() > 0) {
            <div class="dash-pacing-summary" [class]="pacing.class">
              <div class="dash-pacing-meta">
                <span class="dash-pacing-badge">
                  {{ pacing.icon }} {{ pacing.label }}
                </span>
                <span class="dash-pacing-amounts">
                  {{ budgetService.totalActualExpenses() | currencyFormat }} / {{ budgetService.totalPlannedOutflow() | currencyFormat }}
                </span>
              </div>
              <div class="pacing-progress-bar" style="height: 8px; margin-top: 0.5rem; margin-bottom: 0.75rem;">
                <div class="time-marker" [style.left.%]="budgetService.monthProgressPercentage()" style="width: 2px;"></div>
                <div class="pacing-fill" [style.width.%]="Math.min(budgetService.pacingPercentage(), 100)"
                     [style.background]="pacing.status === 'exceeded' ? 'var(--accent-red)' :
                                          pacing.status === 'warning_fast' ? 'var(--accent-yellow)' :
                                          pacing.status === 'warning_slight' ? 'var(--accent-blue-light)' :
                                          'var(--accent-green)'">
                </div>
              </div>
              <p class="dash-pacing-desc">{{ pacing.description }}</p>
              <div class="dash-pacing-divider"></div>
            </div>
          }

          @if (budgetService.totalPlannedOutflow() === 0) {
            <div class="empty-state">
              <span class="empty-icon">🎯</span>
              <p>No budgets or bills set</p>
              <a routerLink="/budgets" class="btn btn-primary btn-sm">Set Budgets</a>
            </div>
          } @else if (budgetService.budgetAlerts().length === 0) {
            <div class="empty-state" style="padding: 1rem;">
              <p style="font-size: 0.8rem;">No category budgets set. Your pacing includes scheduled recurring bills.</p>
            </div>
          } @else {
            <div class="budget-list">
              @for (alert of budgetService.budgetAlerts().slice(0, 5); track alert.categoryId) {
                <div class="budget-item">
                  <div class="budget-header">
                    <span class="budget-name">{{ alert.categoryName }}</span>
                    <span class="budget-pct" [class.text-expense]="alert.status === 'exceeded'"
                          [class.text-income]="alert.status === 'safe'"
                          [style.color]="alert.status === 'warning' ? 'var(--accent-yellow)' : ''">
                      {{ alert.percentage }}%
                    </span>
                  </div>
                  <div class="progress-bar">
                    <div class="progress-fill" [style.width.%]="Math.min(alert.percentage, 100)"
                         [style.background]="alert.status === 'exceeded' ? 'var(--accent-red)' : alert.status === 'warning' ? 'var(--accent-yellow)' : 'var(--accent-green)'">
                    </div>
                  </div>
                  <div class="budget-amounts">
                    <span>{{ alert.spentAmount | currencyFormat }} spent</span>
                    <span>of {{ alert.budgetAmount | currencyFormat }}</span>
                  </div>
                </div>
              }
            </div>
          }
        </div>

        <!-- Goals Progress Widget -->
        <div class="card dashboard-goals-card">
          <div class="card-header">
            <span class="card-title">Savings Goals</span>
            <a routerLink="/goals" class="btn btn-ghost btn-sm">View All</a>
          </div>
          @if (goalService.goals().length === 0) {
            <div class="empty-state">
              <span class="empty-icon">🏆</span>
              <p>No goals set</p>
              <a routerLink="/goals" class="btn btn-primary btn-sm">Set Goals</a>
            </div>
          } @else {
            <div class="dash-goal-list">
              @for (goal of goalService.goals().slice(0, 3); track goal.id) {
                @let pct = getGoalPct(goal);
                <div class="dash-goal-item">
                  <div class="dg-header">
                    <span class="dg-name">{{ goal.name }}</span>
                    <span class="dg-pct">{{ pct }}%</span>
                  </div>
                  <div class="progress-bar" style="height: 5px; margin: 0.25rem 0;">
                    <div class="progress-fill" [style.width.%]="pct"
                         [style.background]="pct >= 100 ? 'var(--accent-green)' : 'var(--accent-blue)'"></div>
                  </div>
                  <div class="dg-amounts">
                    <span>{{ goal.currentAmount | currencyFormat }}</span>
                    <span>of {{ goal.targetAmount | currencyFormat }}</span>
                  </div>
                </div>
              }
            </div>
          }
        </div>
      }

      @if (settingsService.dashboardWidgets().upcomingBills) {
          <!-- Upcoming Bills Widget -->
          <div class="card dashboard-bills-card">
            <div class="card-header">
              <span class="card-title">Upcoming Bills</span>
              <a routerLink="/bills-calendar" class="btn btn-ghost btn-sm">Calendar</a>
            </div>
            @if (recurringService.schedules().length === 0) {
              <div class="empty-state">
                <span class="empty-icon">📅</span>
                <p>No schedules set</p>
                <a routerLink="/bills-calendar" class="btn btn-primary btn-sm">Add Schedule</a>
              </div>
            } @else {
              <div class="dash-bill-list">
                @for (schedule of recurringService.schedules().slice(0, 3); track schedule.id) {
                  <div class="dash-bill-item">
                    <span class="db-icon">{{ schedule.type === 'transfer' ? '🔄' : getCategoryIcon(schedule.category) }}</span>
                    <div class="db-details">
                      <span class="db-desc">{{ schedule.description }}</span>
                      <span class="db-date">Due: {{ formatDueDate(schedule.nextDueDate) }}</span>
                    </div>
                    <span class="db-amount" [class.text-expense]="schedule.type === 'expense'" [class.text-income]="schedule.type === 'income'">
                      {{ schedule.amount | currencyFormat:getAccountCurrencySymbol(schedule.accountId) }}
                    </span>
                  </div>
                }
              </div>
            }
          </div>
        }

        @if (settingsService.dashboardWidgets().categorySpend) {
          <!-- Top Spending Pie -->
          <div class="card category-card">
            <div class="card-header"><span class="card-title">Top Spending</span></div>
            <div class="chart-container-sm"><canvas #pieChart></canvas></div>
          </div>
        }
      </div>
    }

      <!-- AI Smart Audit Banner -->
      <div class="card ai-banner" *ngIf="aiAudit() && settingsService.dashboardWidgets().aiAudit">
        <div class="ai-banner-header">
          <span class="ai-banner-title">🤖 AI Smart Financial Audit</span>
          <span class="ai-badge animate-pulse" [class.heuristic]="!aiAudit().isAiGenerated">
            {{ aiAudit().isAiGenerated ? 'Gemini AI Active' : 'Heuristic Active' }}
          </span>
        </div>
        <p class="ai-banner-text">"{{ aiAudit().healthOverview }}"</p>
        <div class="ai-recommendations" *ngIf="aiAudit().recommendations?.length > 0">
          <span class="rec-label">💡 AI Action Items:</span>
          <ul>
            <li *ngFor="let rec of aiAudit().recommendations">{{ rec }}</li>
          </ul>
        </div>
      </div>

    </div>
  `,
  styles: [`
    .dashboard-content { padding: 1.5rem 2rem; display: flex; flex-direction: column; gap: 1.5rem; }

    /* Month comparison bar */
    .month-bar {
      display: flex; align-items: center; gap: 1.5rem;
      background: var(--bg-card); border: 1px solid var(--border);
      border-radius: var(--radius-lg); padding: 1rem 1.5rem; flex-wrap: wrap;
    }
    .month-stat { display: flex; flex-direction: column; gap: 0.25rem; }
    .ms-label { font-size: 0.7rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .ms-value { font-size: 0.9375rem; font-weight: 700; }
    .ms-link { font-size: 0.7rem; color: var(--accent-blue-light); text-decoration: none; margin-top: 0.125rem; font-weight: 500; transition: var(--transition); }
    .ms-link:hover { color: var(--text-primary); text-decoration: underline; }
    .month-divider { width: 1px; height: 40px; background: var(--border); flex-shrink: 0; }
    .health-score { display: flex; align-items: baseline; gap: 0.125rem; }
    .hs-num { font-size: 1.25rem; font-weight: 800; }
    .hs-label { font-size: 0.75rem; color: var(--text-muted); }
    .health-score.good .hs-num { color: var(--accent-green); }
    .health-score.ok .hs-num { color: var(--accent-yellow); }
    .health-score.bad .hs-num { color: var(--accent-red); }

    /* Summary Cards */
    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; }
    .summary-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 1.25rem; display: flex; align-items: center; gap: 1rem; transition: var(--transition); }
    .summary-card:hover { border-color: var(--border-light); transform: translateY(-2px); box-shadow: var(--shadow-md); }
    .income-card { border-left: 3px solid var(--income-color); }
    .expense-card { border-left: 3px solid var(--expense-color); }
    .balance-card.positive { border-left: 3px solid var(--income-color); }
    .balance-card.negative { border-left: 3px solid var(--expense-color); }
    .txn-card { border-left: 3px solid var(--accent-blue); }
    .summary-icon { font-size: 2rem; flex-shrink: 0; }
    .summary-info { display: flex; flex-direction: column; gap: 0.25rem; }
    .summary-label { font-size: 0.75rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .summary-value { font-size: 1.5rem; font-weight: 700; color: var(--text-primary); }
    .summary-sub { font-size: 0.75rem; color: var(--text-muted); }

    /* Charts */
    .charts-row { display: grid; grid-template-columns: 280px 1fr; gap: 1rem; }
    .chart-card { display: flex; flex-direction: column; }
    .chart-container { height: 220px; position: relative; }
    .chart-container-sm { height: 200px; position: relative; }

    /* Bottom Row Grid */
    .bottom-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.25rem; }
    .recent-card, .accounts-card, .budget-card, .category-card, .dashboard-goals-card, .dashboard-bills-card { display: flex; flex-direction: column; }

    /* Accounts Widget */
    .net-worth-section {
      background: linear-gradient(135deg, rgba(92, 107, 192, 0.12) 0%, rgba(33, 150, 243, 0.04) 100%);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 0.75rem 1rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.125rem;
    }
    .nw-label { font-size: 0.65rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .nw-value { font-size: 1.5rem; font-weight: 800; color: var(--accent-green); }
    .nw-value.negative { color: var(--accent-red); }

    .account-list-mini { display: flex; flex-direction: column; gap: 0.5rem; max-height: 250px; overflow-y: auto; }
    .mini-account-item {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      padding: 0.5rem 0.625rem;
      border-radius: var(--radius-sm);
      background: var(--bg-input);
      border: 1px solid var(--border);
      transition: var(--transition);
    }
    .mini-account-item:hover { border-color: var(--border-light); background: var(--bg-card-hover); }
    .mini-acc-icon { font-size: 1.1rem; flex-shrink: 0; }
    .mini-acc-details { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .mini-acc-name { font-size: 0.8125rem; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .mini-acc-type { font-size: 0.65rem; color: var(--text-muted); text-transform: capitalize; }
    .mini-acc-balance { font-size: 0.875rem; font-weight: 750; flex-shrink: 0; }

    /* Transaction List */
    .txn-list { display: flex; flex-direction: column; gap: 0.5rem; }
    .txn-item { display: flex; align-items: center; gap: 0.75rem; padding: 0.625rem 0.75rem; border-radius: var(--radius-sm); transition: var(--transition); }
    .txn-item:hover { background: var(--bg-card-hover); }
    .txn-icon { font-size: 1.25rem; width: 32px; text-align: center; flex-shrink: 0; }
    .txn-details { flex: 1; min-width: 0; }
    .txn-desc { display: block; font-size: 0.875rem; font-weight: 500; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .txn-meta { font-size: 0.75rem; color: var(--text-muted); display: flex; align-items: center; gap: 0.25rem; }
    .recurring-badge { font-size: 0.7rem; }
    .txn-amount { font-size: 0.875rem; font-weight: 600; flex-shrink: 0; }

    /* Budget List */
    .budget-list { display: flex; flex-direction: column; gap: 0.875rem; }
    .budget-item { display: flex; flex-direction: column; gap: 0.375rem; }
    .budget-header { display: flex; justify-content: space-between; align-items: center; }
    .budget-name { font-size: 0.8125rem; font-weight: 500; color: var(--text-primary); }
    .budget-pct { font-size: 0.75rem; font-weight: 600; }
    .budget-amounts { display: flex; justify-content: space-between; font-size: 0.7rem; color: var(--text-muted); }

    /* Empty State */
    .empty-state { display: flex; flex-direction: column; align-items: center; gap: 0.75rem; padding: 2rem 1rem; text-align: center; }
    .empty-icon { font-size: 2.5rem; }
    .empty-state p { color: var(--text-muted); font-size: 0.875rem; }

    /* Dashboard Pacing Styles */
    .dash-pacing-summary { display: flex; flex-direction: column; margin-bottom: 0.875rem; }
    .dash-pacing-meta { display: flex; justify-content: space-between; align-items: center; }
    .dash-pacing-badge {
      font-size: 0.75rem;
      font-weight: 700;
      padding: 0.2rem 0.5rem;
      border-radius: 100px;
    }
    .dash-pacing-summary.status-success .dash-pacing-badge { background: rgba(76, 175, 80, 0.15); color: var(--accent-green); }
    .dash-pacing-summary.status-warning .dash-pacing-badge { background: rgba(255, 193, 7, 0.15); color: var(--accent-yellow); }
    .dash-pacing-summary.status-info .dash-pacing-badge { background: rgba(121, 134, 203, 0.15); color: var(--accent-blue-light); }
    .dash-pacing-summary.status-danger .dash-pacing-badge { background: rgba(239, 83, 80, 0.15); color: var(--accent-red); }

    .dash-pacing-amounts { font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); }
    .dash-pacing-desc { font-size: 0.75rem; color: var(--text-muted); line-height: 1.4; margin: 0; }
    .dash-pacing-divider { height: 1px; background: var(--border); margin-top: 0.875rem; }

    .pacing-progress-bar {
      height: 8px;
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
    .time-marker {
      position: absolute;
      top: -2px;
      bottom: -2px;
      width: 2px;
      background: #ffffff;
      box-shadow: 0 0 4px #ffffff;
      z-index: 2;
      transform: translateX(-50%);
      pointer-events: none;
      border-radius: 1px;
    }

    /* AI Smart Audit Banner styling */
    .ai-banner {
      background: linear-gradient(135deg, rgba(92, 107, 192, 0.08) 0%, rgba(30, 33, 48, 0.95) 100%);
      border: 1px solid var(--border-light);
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      position: relative;
      overflow: hidden;
      box-shadow: var(--shadow-glow-blue);
      margin-top: 0.5rem;
    }
    .ai-banner-header { display: flex; justify-content: space-between; align-items: center; }
    .ai-banner-title { font-size: 0.95rem; font-weight: 700; color: var(--text-primary); }
    .ai-banner-text { font-size: 0.875rem; color: var(--text-secondary); font-style: italic; line-height: 1.45; }
    .ai-recommendations { display: flex; flex-direction: column; gap: 0.375rem; margin-top: 0.25rem; }
    .rec-label { font-size: 0.75rem; font-weight: 700; color: var(--accent-blue-light); text-transform: uppercase; }
    .ai-recommendations ul { list-style: none; padding-left: 0.25rem; display: flex; flex-direction: column; gap: 0.25rem; }
    .ai-recommendations li { font-size: 0.8125rem; color: var(--text-secondary); position: relative; padding-left: 1rem; }
    .ai-recommendations li::before { content: '•'; position: absolute; left: 0; color: var(--accent-blue-light); }

    .ai-badge {
      background: linear-gradient(135deg, var(--accent-blue) 0%, var(--accent-purple) 100%);
      color: #fff;
      font-size: 0.65rem;
      font-weight: 700;
      padding: 0.2rem 0.5rem;
      border-radius: 100px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .ai-badge.heuristic {
      background: var(--bg-input);
      color: var(--text-secondary);
      border: 1px solid var(--border);
    }

    /* Goals Widget styling */
    .dash-goal-list { display: flex; flex-direction: column; gap: 0.75rem; }
    .dash-goal-item { display: flex; flex-direction: column; gap: 0.125rem; }
    .dg-header { display: flex; justify-content: space-between; font-size: 0.8125rem; font-weight: 500; }
    .dg-pct { font-weight: 700; color: var(--accent-blue-light); }
    .dg-amounts { display: flex; justify-content: space-between; font-size: 0.7rem; color: var(--text-muted); }

    /* Bills Widget styling */
    .dash-bill-list { display: flex; flex-direction: column; gap: 0.5rem; }
    .dash-bill-item { display: flex; align-items: center; gap: 0.625rem; padding: 0.375rem 0.5rem; border-radius: var(--radius-sm); background: var(--bg-input); border: 1px solid var(--border); }
    .db-icon { font-size: 1.1rem; flex-shrink: 0; }
    .db-details { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .db-desc { font-size: 0.8125rem; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .db-date { font-size: 0.65rem; color: var(--text-muted); }
    .db-amount { font-size: 0.8125rem; font-weight: 700; }

    @media (max-width: 1400px) {
      .bottom-row { grid-template-columns: repeat(2, 1fr); }
    }
    @media (max-width: 1200px) {
      .summary-grid { grid-template-columns: repeat(2, 1fr); }
      .charts-row { grid-template-columns: 1fr; }
      .bottom-row { grid-template-columns: 1fr; }
      .month-bar { gap: 1rem; }
    }
    @media (max-width: 768px) {
      .dashboard-content { padding: 1rem; }
      .summary-grid { grid-template-columns: 1fr 1fr; }
      .month-divider { display: none; }
    }
    @media (max-width: 480px) {
      .summary-grid { grid-template-columns: 1fr; }
      .month-bar { flex-direction: column; align-items: stretch; gap: 0.75rem; }
    }

    /* Onboarding Card styling */
    .onboarding-card {
      background: linear-gradient(135deg, rgba(92, 107, 192, 0.12) 0%, rgba(30, 33, 48, 0.95) 50%, rgba(3, 169, 244, 0.05) 100%);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: var(--radius-lg);
      padding: 1.5rem;
      margin-bottom: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25), var(--shadow-glow-blue);
      position: relative;
      overflow: hidden;
      animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      transition: box-shadow 0.3s ease;
    }
    .onboarding-card:hover {
      box-shadow: 0 15px 35px rgba(0, 0, 0, 0.35), var(--shadow-glow-blue);
    }
    .onboarding-close-btn {
      position: absolute;
      top: 1rem;
      right: 1.25rem;
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      font-size: 1.1rem;
      transition: var(--transition);
    }
    .onboarding-close-btn:hover {
      color: var(--text-primary);
    }
    .ob-header {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      text-align: left;
    }
    .ob-title {
      font-size: 1.1rem;
      font-weight: 700;
      color: var(--text-primary);
      margin: 0;
    }
    .ob-subtitle {
      font-size: 0.8125rem;
      color: var(--text-muted);
      margin: 0;
    }
    .ob-progress-wrap {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
    }
    .ob-progress-info {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-secondary);
    }
    .ob-progress-pct {
      color: var(--accent-blue-light);
      font-weight: 700;
    }
    .ob-progress-track {
      height: 6px;
      background: var(--border);
      border-radius: 100px;
      overflow: hidden;
    }
    .ob-progress-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--accent-blue-light) 0%, var(--accent-cyan) 100%);
      border-radius: 100px;
      transition: width 0.4s ease;
    }
    .ob-list {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0.75rem;
    }
    @media (max-width: 768px) {
      .ob-list {
        grid-template-columns: 1fr;
      }
    }
    .ob-item {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 0.75rem 1rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      transition: var(--transition);
    }
    .ob-item:hover {
      border-color: var(--border-light);
      background: rgba(255, 255, 255, 0.04);
    }
    .ob-item.completed {
      border-color: rgba(76, 175, 80, 0.2);
      background: rgba(76, 175, 80, 0.03);
    }
    .ob-item-content {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      min-width: 0;
      text-align: left;
    }
    .ob-icon-wrapper {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.95rem;
      background: var(--bg-input);
      border: 1px solid var(--border);
      flex-shrink: 0;
    }
    .ob-item.completed .ob-icon-wrapper {
      background: rgba(76, 175, 80, 0.15);
      border-color: rgba(76, 175, 80, 0.3);
    }
    .ob-text-wrap {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .ob-item-title {
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .ob-item.completed .ob-item-title {
      text-decoration: line-through;
      color: var(--text-muted);
    }
    .ob-item-desc {
      font-size: 0.7rem;
      color: var(--text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .ob-action-link {
      font-size: 0.75rem;
      font-weight: 700;
      color: var(--accent-blue-light);
      text-decoration: none;
      display: flex;
      align-items: center;
      gap: 0.125rem;
      flex-shrink: 0;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      transition: var(--transition);
    }
    .ob-action-link:hover {
      background: rgba(92, 107, 192, 0.15);
      color: #fff;
    }
    .ob-check-mark {
      font-size: 0.9rem;
      color: var(--accent-green);
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
  `]
})
export class DashboardComponent implements OnInit, AfterViewInit {
  settingsService = inject(SettingsService);
  txnService = inject(TransactionService);
  categoryService = inject(CategoryService);
  budgetService = inject(BudgetService);
  accountService = inject(AccountService);
  api = inject(ApiService);
  goalService = inject(GoalService);
  recurringService = inject(RecurringService);

  aiAudit = signal<any>(null);

  constructor() {
    effect(() => {
      this.settingsService.themeName();
      this.settingsService.accentColor();
      setTimeout(() => this.updateCharts(), 100);
    });
  }

  // Onboarding Checklist state
  dismissOnboarding = signal(false);
  
  hasAccounts = computed(() => this.accountService.accounts().length > 0);
  hasTransactions = computed(() => this.txnService.transactions().length > 0);
  hasBudgets = computed(() => this.budgetService.budgets().length > 0);
  hasSchedules = computed(() => this.recurringService.schedules().length > 0);

  onboardingProgress = computed(() => {
    let count = 0;
    if (this.hasAccounts()) count++;
    if (this.hasTransactions()) count++;
    if (this.hasBudgets()) count++;
    if (this.hasSchedules()) count++;
    return count;
  });

  showOnboarding = computed(() => {
    if (this.dismissOnboarding()) return false;
    return this.onboardingProgress() < 4;
  });

  @ViewChild('doughnutChart') doughnutRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('barChart') barRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('pieChart') pieRef!: ElementRef<HTMLCanvasElement>;

  protected Math = Math;
  currentYear = new Date().getFullYear();
  currentPeriod = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  private doughnutChart?: Chart;
  private barChart?: Chart;
  private pieChart?: Chart;

  // ── Current month summary — always current month regardless of any filter ──

  dashboardStats = signal<any>(null);

  currentMonthSummary = computed(() => {
    const stats = this.dashboardStats()?.currentMonthSummary;
    if (stats) return stats;
    return { totalIncome: 0, totalExpenses: 0, netBalance: 0, transactionCount: 0, avgTransaction: 0 };
  });

  recentTransactions = computed(() => {
    return this.dashboardStats()?.recentTransactions ?? [];
  });

  thisMonthIncome = computed(() => this.currentMonthSummary().totalIncome);
  thisMonthExpenses = computed(() => this.currentMonthSummary().totalExpenses);
  lastMonthIncome = computed(() => this.dashboardStats()?.lastMonthSummary?.totalIncome ?? 0);
  lastMonthExpenses = computed(() => this.dashboardStats()?.lastMonthSummary?.totalExpenses ?? 0);
  expenseChange = computed(() => this.dashboardStats()?.lastMonthSummary?.expenseChange ?? 0);
  savingsRate = computed(() => this.dashboardStats()?.savingsRate ?? 0);
  healthScore = computed(() => this.dashboardStats()?.healthScore ?? 50);

  ngOnInit() {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();

    this.api.getDashboardStats().subscribe(res => {
      if (res.success) {
        this.dashboardStats.set(res.data);
        this.updateCharts();
      }
    });

    this.categoryService.loadCategories().subscribe();
    this.budgetService.loadBudgets(y, m + 1).subscribe();
    this.accountService.loadAccounts().subscribe();
    this.goalService.loadGoals().subscribe();
    this.recurringService.loadSchedules().subscribe();

    // Load AI smart audit banner
    const startStr = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m + 1, 0).getDate();
    const endStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    this.api.getExecutiveReport(startStr, endStr).subscribe(res => {
      if (res.success) this.aiAudit.set(res.data);
    });
  }

  getGoalPct(goal: Goal): number {
    if (goal.targetAmount <= 0) return 0;
    return Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100));
  }

  formatDueDate(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  ngAfterViewInit() { this.initCharts(); }

  getCategoryIcon(id: string) { return this.categoryService.getCategoryIcon(id); }
  getCategoryName(id: string) { return this.categoryService.getCategoryById(id)?.name ?? id; }
  getAccountName(id: string) {
    const acc = this.accountService.accounts().find(a => a.id === id);
    return acc ? acc.name : id;
  }
  getAccountCurrencySymbol(accountId: string): string {
    const acc = this.accountService.accounts().find(a => a.id === accountId);
    return acc ? this.settingsService.getSymbol(acc.currency || 'USD') : this.settingsService.currencySymbol();
  }
  formatDate(date: string) { return parseLocalDate(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }

  private getChartTextColor() {
    if (typeof window === 'undefined') return '#9fa8da';
    return window.getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#9fa8da';
  }
  private getChartGridColor() {
    if (typeof window === 'undefined') return 'rgba(46,50,80,0.3)';
    return window.getComputedStyle(document.documentElement).getPropertyValue('--border').trim() || 'rgba(46,50,80,0.3)';
  }

  private initCharts() { this.initDoughnutChart(); this.initBarChart(); this.initPieChart(); }
  private updateCharts() { this.updateDoughnutChart(); this.updateBarChart(); this.updatePieChart(); }

  private initDoughnutChart() {
    if (!this.doughnutRef) return;
    const s = this.currentMonthSummary();
    this.doughnutChart = new Chart(this.doughnutRef.nativeElement, {
      type: 'doughnut',
      data: { labels: ['Income', 'Expenses'], datasets: [{ data: [s.totalIncome, s.totalExpenses], backgroundColor: ['rgba(76,175,80,0.8)', 'rgba(239,83,80,0.8)'], borderColor: ['#4caf50', '#ef5350'], borderWidth: 2 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: this.getChartTextColor(), font: { size: 11 } } }, tooltip: { callbacks: { label: ctx => ` $${ctx.parsed.toLocaleString()}` } } }, cutout: '65%' }
    });
  }

  private updateDoughnutChart() {
    if (!this.doughnutChart) { this.initDoughnutChart(); return; }
    const s = this.currentMonthSummary();
    this.doughnutChart.data.datasets[0].data = [s.totalIncome, s.totalExpenses];
    this.doughnutChart.options.plugins!.legend!.labels!.color = this.getChartTextColor();
    this.doughnutChart.update();
  }

  private initBarChart() {
    if (!this.barRef) return;
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const { incomeData, expenseData } = this.getMonthlyData();
    this.barChart = new Chart(this.barRef.nativeElement, {
      type: 'bar',
      data: { labels: months, datasets: [
        { label: 'Income', data: incomeData, backgroundColor: 'rgba(76,175,80,0.7)', borderColor: '#4caf50', borderWidth: 1, borderRadius: 4 },
        { label: 'Expenses', data: expenseData, backgroundColor: 'rgba(239,83,80,0.7)', borderColor: '#ef5350', borderWidth: 1, borderRadius: 4 }
      ]},
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: this.getChartTextColor(), font: { size: 11 } } }, tooltip: { callbacks: { label: (ctx: any) => ` $${ctx.parsed.y?.toLocaleString() ?? 0}` } } }, scales: { x: { ticks: { color: this.getChartTextColor() }, grid: { color: this.getChartGridColor() } }, y: { ticks: { color: this.getChartTextColor(), callback: (v: any) => `$${Number(v).toLocaleString()}` }, grid: { color: this.getChartGridColor() } } } }
    });
  }

  private updateBarChart() {
    if (!this.barChart) { this.initBarChart(); return; }
    const { incomeData, expenseData } = this.getMonthlyData();
    this.barChart.data.datasets[0].data = incomeData;
    this.barChart.data.datasets[1].data = expenseData;
    this.barChart.options.plugins!.legend!.labels!.color = this.getChartTextColor();
    this.barChart.options.scales!['x']!.ticks!.color = this.getChartTextColor();
    this.barChart.options.scales!['x']!.grid!.color = this.getChartGridColor();
    this.barChart.options.scales!['y']!.ticks!.color = this.getChartTextColor();
    this.barChart.options.scales!['y']!.grid!.color = this.getChartGridColor();
    this.barChart.update();
  }

  private getMonthlyData() {
    const incomeData = Array(12).fill(0);
    const expenseData = Array(12).fill(0);
    const breakdown = this.dashboardStats()?.monthlyBreakdown || [];
    breakdown.forEach((item: any) => {
      const idx = item.monthIndex - 1;
      if (idx >= 0 && idx < 12) {
        incomeData[idx] = item.income;
        expenseData[idx] = item.expense;
      }
    });
    return { incomeData, expenseData };
  }

  private initPieChart() {
    if (!this.pieRef) return;
    const { labels, data, colors } = this.getCategoryData();
    this.pieChart = new Chart(this.pieRef.nativeElement, {
      type: 'pie',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 1, borderColor: 'var(--bg-card)' }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: this.getChartTextColor(), font: { size: 10 }, boxWidth: 12 } }, tooltip: { callbacks: { label: ctx => ` $${ctx.parsed.toLocaleString()}` } } } }
    });
  }

  private updatePieChart() {
    if (!this.pieChart) { this.initPieChart(); return; }
    const { labels, data, colors } = this.getCategoryData();
    this.pieChart.data.labels = labels;
    this.pieChart.data.datasets[0].data = data;
    (this.pieChart.data.datasets[0] as any).backgroundColor = colors;
    this.pieChart.options.plugins!.legend!.labels!.color = this.getChartTextColor();
    this.pieChart.update();
  }

  private getCategoryData() {
    const breakdown = this.dashboardStats()?.categoryBreakdown || [];
    const sorted = breakdown.slice(0, 6);
    return {
      labels: sorted.map((c: any) => c.categoryName),
      data: sorted.map((c: any) => c.amount),
      colors: sorted.map((c: any) => c.color)
    };
  }
}

import { Component, OnInit, inject, signal, computed, AfterViewInit, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TransactionService } from '../../core/services/transaction.service';
import { CategoryService } from '../../core/services/category.service';
import { BudgetService } from '../../core/services/budget.service';
import { HeaderComponent } from '../../layout/header.component';
import { CurrencyFormatPipe } from '../../shared/pipes/currency-format.pipe';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, HeaderComponent, CurrencyFormatPipe],
  template: `
    <app-header title="Dashboard" subtitle="Your financial overview at a glance">
      <button class="btn btn-primary btn-sm" routerLink="/quick-log">⚡ Quick Log</button>
    </app-header>

    <div class="dashboard-content">

      <!-- Month comparison bar -->
      <div class="month-bar">
        <div class="month-stat">
          <span class="ms-label">This Month</span>
          <span class="ms-value text-income">+{{ thisMonthIncome() | currencyFormat }}</span>
          <span class="ms-value text-expense">-{{ thisMonthExpenses() | currencyFormat }}</span>
        </div>
        <div class="month-divider"></div>
        <div class="month-stat">
          <span class="ms-label">Last Month</span>
          <span class="ms-value text-income">+{{ lastMonthIncome() | currencyFormat }}</span>
          <span class="ms-value text-expense">-{{ lastMonthExpenses() | currencyFormat }}</span>
        </div>
        <div class="month-divider"></div>
        <div class="month-stat">
          <span class="ms-label">Expense Change</span>
          <span class="ms-value" [class.text-income]="expenseChange() <= 0" [class.text-expense]="expenseChange() > 0">
            {{ expenseChange() > 0 ? '▲' : '▼' }} {{ Math.abs(expenseChange()) | number:'1.1-1' }}%
          </span>
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

      <!-- Summary Cards -->
      <div class="summary-grid">
        <div class="summary-card income-card">
          <div class="summary-icon">📈</div>
          <div class="summary-info">
            <span class="summary-label">Total Income</span>
            <span class="summary-value text-income">{{ txnService.summary().totalIncome | currencyFormat }}</span>
            <span class="summary-sub">{{ currentPeriod }}</span>
          </div>
        </div>
        <div class="summary-card expense-card">
          <div class="summary-icon">📉</div>
          <div class="summary-info">
            <span class="summary-label">Total Expenses</span>
            <span class="summary-value text-expense">{{ txnService.summary().totalExpenses | currencyFormat }}</span>
            <span class="summary-sub">{{ currentPeriod }}</span>
          </div>
        </div>
        <div class="summary-card balance-card" [class.positive]="txnService.summary().netBalance >= 0" [class.negative]="txnService.summary().netBalance < 0">
          <div class="summary-icon">{{ txnService.summary().netBalance >= 0 ? '💚' : '🔴' }}</div>
          <div class="summary-info">
            <span class="summary-label">Net Balance</span>
            <span class="summary-value" [class.text-income]="txnService.summary().netBalance >= 0" [class.text-expense]="txnService.summary().netBalance < 0">
              {{ txnService.summary().netBalance | currencyFormat }}
            </span>
            <span class="summary-sub">{{ savingsRate() }}% savings rate</span>
          </div>
        </div>
        <div class="summary-card txn-card">
          <div class="summary-icon">🔢</div>
          <div class="summary-info">
            <span class="summary-label">Transactions</span>
            <span class="summary-value">{{ txnService.summary().transactionCount }}</span>
            <span class="summary-sub">Avg: {{ txnService.summary().avgTransaction | currencyFormat }}</span>
          </div>
        </div>
      </div>

      <!-- Charts Row -->
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

      <!-- Bottom Row -->
      <div class="bottom-row">
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
          } @else if (txnService.recentTransactions().length === 0) {
            <div class="empty-state">
              <span class="empty-icon">💳</span>
              <p>No transactions yet</p>
              <a routerLink="/quick-log" class="btn btn-primary btn-sm">⚡ Quick Log</a>
            </div>
          } @else {
            <div class="txn-list">
              @for (txn of txnService.recentTransactions(); track txn.id) {
                <div class="txn-item">
                  <div class="txn-icon">{{ getCategoryIcon(txn.category) }}</div>
                  <div class="txn-details">
                    <span class="txn-desc">{{ txn.description }}</span>
                    <span class="txn-meta">
                      {{ getCategoryName(txn.category) }} · {{ formatDate(txn.date) }}
                      @if (txn.isRecurring) { <span class="recurring-badge">🔄</span> }
                    </span>
                  </div>
                  <span class="txn-amount" [class.text-income]="txn.type === 'income'" [class.text-expense]="txn.type === 'expense'">
                    {{ txn.type === 'income' ? '+' : '-' }}{{ txn.amount | currencyFormat }}
                  </span>
                </div>
              }
            </div>
          }
        </div>

        <!-- Budget Alerts -->
        <div class="card budget-card">
          <div class="card-header">
            <span class="card-title">Budget Status</span>
            <a routerLink="/budgets" class="btn btn-ghost btn-sm">Manage</a>
          </div>
          @if (budgetService.budgetAlerts().length === 0) {
            <div class="empty-state">
              <span class="empty-icon">🎯</span>
              <p>No budgets set</p>
              <a routerLink="/budgets" class="btn btn-primary btn-sm">Set Budgets</a>
            </div>
          } @else {
            <div class="budget-list">
              @for (alert of budgetService.budgetAlerts().slice(0, 6); track alert.categoryId) {
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

        <!-- Top Spending Pie -->
        <div class="card category-card">
          <div class="card-header"><span class="card-title">Top Spending</span></div>
          <div class="chart-container-sm"><canvas #pieChart></canvas></div>
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

    /* Bottom Row */
    .bottom-row { display: grid; grid-template-columns: 1fr 320px 280px; gap: 1rem; }
    .recent-card, .budget-card, .category-card { display: flex; flex-direction: column; }

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
  `]
})
export class DashboardComponent implements OnInit, AfterViewInit {
  txnService = inject(TransactionService);
  categoryService = inject(CategoryService);
  budgetService = inject(BudgetService);

  @ViewChild('doughnutChart') doughnutRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('barChart') barRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('pieChart') pieRef!: ElementRef<HTMLCanvasElement>;

  protected Math = Math;
  currentYear = new Date().getFullYear();
  currentPeriod = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  private doughnutChart?: Chart;
  private barChart?: Chart;
  private pieChart?: Chart;

  // ── Month-over-month computed signals ──────────────────────────────────────

  private get thisMonth() { return new Date().getMonth(); }
  private get thisYear() { return new Date().getFullYear(); }

  thisMonthIncome = computed(() =>
    this.txnService.transactions()
      .filter(t => { const d = new Date(t.date); return t.type === 'income' && d.getMonth() === this.thisMonth && d.getFullYear() === this.thisYear; })
      .reduce((s, t) => s + t.amount, 0)
  );

  thisMonthExpenses = computed(() =>
    this.txnService.transactions()
      .filter(t => { const d = new Date(t.date); return t.type === 'expense' && d.getMonth() === this.thisMonth && d.getFullYear() === this.thisYear; })
      .reduce((s, t) => s + t.amount, 0)
  );

  lastMonthIncome = computed(() => {
    const lm = this.thisMonth === 0 ? 11 : this.thisMonth - 1;
    const ly = this.thisMonth === 0 ? this.thisYear - 1 : this.thisYear;
    return this.txnService.transactions()
      .filter(t => { const d = new Date(t.date); return t.type === 'income' && d.getMonth() === lm && d.getFullYear() === ly; })
      .reduce((s, t) => s + t.amount, 0);
  });

  lastMonthExpenses = computed(() => {
    const lm = this.thisMonth === 0 ? 11 : this.thisMonth - 1;
    const ly = this.thisMonth === 0 ? this.thisYear - 1 : this.thisYear;
    return this.txnService.transactions()
      .filter(t => { const d = new Date(t.date); return t.type === 'expense' && d.getMonth() === lm && d.getFullYear() === ly; })
      .reduce((s, t) => s + t.amount, 0);
  });

  expenseChange = computed(() => {
    const last = this.lastMonthExpenses();
    const curr = this.thisMonthExpenses();
    if (last === 0) return 0;
    return Math.round(((curr - last) / last) * 100);
  });

  savingsRate = computed(() => {
    const s = this.txnService.summary();
    if (s.totalIncome === 0) return 0;
    return Math.round(((s.totalIncome - s.totalExpenses) / s.totalIncome) * 100);
  });

  // Financial health score 0-100
  healthScore = computed(() => {
    let score = 50;
    const sr = this.savingsRate();
    if (sr >= 20) score += 20;
    else if (sr >= 10) score += 10;
    else if (sr < 0) score -= 20;
    const ec = this.expenseChange();
    if (ec < 0) score += 15;
    else if (ec > 20) score -= 15;
    const alerts = this.budgetService.budgetAlerts();
    const exceeded = alerts.filter(a => a.status === 'exceeded').length;
    score -= exceeded * 10;
    return Math.max(0, Math.min(100, score));
  });

  ngOnInit() {
    const now = new Date();
    this.txnService.loadTransactions({ dateFrom: `${now.getFullYear()}-01-01`, dateTo: `${now.getFullYear()}-12-31` })
      .subscribe(() => this.updateCharts());
    this.categoryService.loadCategories().subscribe();
    this.budgetService.loadBudgets(now.getFullYear(), now.getMonth() + 1).subscribe();
  }

  ngAfterViewInit() { this.initCharts(); }

  getCategoryIcon(id: string) { return this.categoryService.getCategoryIcon(id); }
  getCategoryName(id: string) { return this.categoryService.getCategoryById(id)?.name ?? id; }
  formatDate(date: string) { return new Date(date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }

  private initCharts() { this.initDoughnutChart(); this.initBarChart(); this.initPieChart(); }
  private updateCharts() { this.updateDoughnutChart(); this.updateBarChart(); this.updatePieChart(); }

  private initDoughnutChart() {
    if (!this.doughnutRef) return;
    const s = this.txnService.summary();
    this.doughnutChart = new Chart(this.doughnutRef.nativeElement, {
      type: 'doughnut',
      data: { labels: ['Income', 'Expenses'], datasets: [{ data: [s.totalIncome, s.totalExpenses], backgroundColor: ['rgba(76,175,80,0.8)', 'rgba(239,83,80,0.8)'], borderColor: ['#4caf50', '#ef5350'], borderWidth: 2 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#9fa8da', font: { size: 11 } } }, tooltip: { callbacks: { label: ctx => ` $${ctx.parsed.toLocaleString()}` } } }, cutout: '65%' }
    });
  }

  private updateDoughnutChart() {
    if (!this.doughnutChart) { this.initDoughnutChart(); return; }
    const s = this.txnService.summary();
    this.doughnutChart.data.datasets[0].data = [s.totalIncome, s.totalExpenses];
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
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#9fa8da', font: { size: 11 } } }, tooltip: { callbacks: { label: (ctx: any) => ` $${ctx.parsed.y?.toLocaleString() ?? 0}` } } }, scales: { x: { ticks: { color: '#9fa8da' }, grid: { color: 'rgba(46,50,80,0.5)' } }, y: { ticks: { color: '#9fa8da', callback: (v: any) => `$${Number(v).toLocaleString()}` }, grid: { color: 'rgba(46,50,80,0.5)' } } } }
    });
  }

  private updateBarChart() {
    if (!this.barChart) { this.initBarChart(); return; }
    const { incomeData, expenseData } = this.getMonthlyData();
    this.barChart.data.datasets[0].data = incomeData;
    this.barChart.data.datasets[1].data = expenseData;
    this.barChart.update();
  }

  private getMonthlyData() {
    const incomeData = Array(12).fill(0);
    const expenseData = Array(12).fill(0);
    this.txnService.transactions().forEach(t => {
      const m = new Date(t.date).getMonth();
      if (t.type === 'income') incomeData[m] += t.amount;
      else expenseData[m] += t.amount;
    });
    return { incomeData, expenseData };
  }

  private initPieChart() {
    if (!this.pieRef) return;
    const { labels, data, colors } = this.getCategoryData();
    this.pieChart = new Chart(this.pieRef.nativeElement, {
      type: 'pie',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 1, borderColor: 'var(--bg-card)' }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#9fa8da', font: { size: 10 }, boxWidth: 12 } }, tooltip: { callbacks: { label: ctx => ` $${ctx.parsed.toLocaleString()}` } } } }
    });
  }

  private updatePieChart() {
    if (!this.pieChart) { this.initPieChart(); return; }
    const { labels, data, colors } = this.getCategoryData();
    this.pieChart.data.labels = labels;
    this.pieChart.data.datasets[0].data = data;
    (this.pieChart.data.datasets[0] as any).backgroundColor = colors;
    this.pieChart.update();
  }

  private getCategoryData() {
    const byCategory: Record<string, number> = {};
    this.txnService.transactions().filter(t => t.type === 'expense').forEach(t => { byCategory[t.category] = (byCategory[t.category] || 0) + t.amount; });
    const sorted = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 6);
    return {
      labels: sorted.map(([cat]) => this.categoryService.getCategoryById(cat)?.name ?? cat),
      data: sorted.map(([, v]) => v),
      colors: sorted.map(([cat]) => this.categoryService.getCategoryColor(cat))
    };
  }
}

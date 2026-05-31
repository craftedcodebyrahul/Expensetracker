import { Component, OnInit, inject, signal, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { CategoryService } from '../../core/services/category.service';
import { HeaderComponent } from '../../layout/header.component';
import { CurrencyFormatPipe } from '../../shared/pipes/currency-format.pipe';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, HeaderComponent, CurrencyFormatPipe],
  template: `
    <app-header title="Reports & Analytics" subtitle="Deep insights into your financial patterns">
    </app-header>

    <div class="reports-page">

      <!-- Controls -->
      <div class="card controls-card">
        <div class="controls-row">
          <div class="control-group">
            <label class="form-label">Report Type</label>
            <select class="form-control" [(ngModel)]="reportType" (ngModelChange)="loadReport()">
              <option value="monthly">Monthly Report</option>
              <option value="yearly">Yearly Report</option>
            </select>
          </div>
          <div class="control-group">
            <label class="form-label">Year</label>
            <select class="form-control" [(ngModel)]="selectedYear" (ngModelChange)="loadReport()">
              @for (y of years; track y) {
                <option [value]="y">{{ y }}</option>
              }
            </select>
          </div>
          @if (reportType === 'monthly') {
            <div class="control-group">
              <label class="form-label">Month</label>
              <select class="form-control" [(ngModel)]="selectedMonth" (ngModelChange)="loadReport()">
                @for (m of months; track m.value) {
                  <option [value]="m.value">{{ m.label }}</option>
                }
              </select>
            </div>
          }
          <button class="btn btn-primary" (click)="loadReport()" [disabled]="loading()">
            {{ loading() ? 'Loading...' : '🔄 Refresh' }}
          </button>
        </div>
      </div>

      @if (loading()) {
        <div class="loading-state">
          <div class="spinner"></div>
          <p>Generating report...</p>
        </div>
      } @else if (reportData()) {
        <!-- KPI Cards -->
        <div class="kpi-grid">
          <div class="kpi-card">
            <span class="kpi-icon">📈</span>
            <div class="kpi-info">
              <span class="kpi-label">Total Income</span>
              <span class="kpi-value text-income">{{ reportData().totalIncome | currencyFormat }}</span>
            </div>
          </div>
          <div class="kpi-card">
            <span class="kpi-icon">📉</span>
            <div class="kpi-info">
              <span class="kpi-label">Total Expenses</span>
              <span class="kpi-value text-expense">{{ reportData().totalExpenses | currencyFormat }}</span>
            </div>
          </div>
          <div class="kpi-card">
            <span class="kpi-icon">💰</span>
            <div class="kpi-info">
              <span class="kpi-label">Net Balance</span>
              <span class="kpi-value" [class.text-income]="reportData().netBalance >= 0"
                    [class.text-expense]="reportData().netBalance < 0">
                {{ reportData().netBalance | currencyFormat }}
              </span>
            </div>
          </div>
          <div class="kpi-card">
            <span class="kpi-icon">💹</span>
            <div class="kpi-info">
              <span class="kpi-label">Savings Rate</span>
              <span class="kpi-value"
                    [class.text-income]="reportData().savingsRate >= 20"
                    [class.text-expense]="reportData().savingsRate < 0"
                    [style.color]="reportData().savingsRate >= 0 && reportData().savingsRate < 20 ? 'var(--accent-yellow)' : ''">
                {{ reportData().savingsRate | number:'1.0-0' }}%
              </span>
            </div>
          </div>
          <div class="kpi-card">
            <span class="kpi-icon">🔢</span>
            <div class="kpi-info">
              <span class="kpi-label">Transactions</span>
              <span class="kpi-value">{{ reportData().transactionCount }}</span>
            </div>
          </div>
        </div>

        <!-- Charts -->
        <div class="charts-grid">
          <!-- Category Breakdown -->
          <div class="card">
            <div class="card-header">
              <span class="card-title">Spending by Category</span>
            </div>
            <div class="chart-container">
              <canvas #categoryChart></canvas>
            </div>
          </div>

          <!-- Yearly trend (only for yearly report) -->
          @if (reportType === 'yearly' && reportData().monthlyBreakdown) {
            <div class="card">
              <div class="card-header">
                <span class="card-title">Monthly Breakdown {{ selectedYear }}</span>
              </div>
              <div class="chart-container">
                <canvas #trendChart></canvas>
              </div>
            </div>
          }
        </div>

        <!-- Category Table -->
        <div class="card">
          <div class="card-header">
            <span class="card-title">Category Breakdown</span>
          </div>
          <div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th class="text-right">Amount</th>
                  <th class="text-right">% of Total</th>
                  <th>Share</th>
                </tr>
              </thead>
              <tbody>
                @for (entry of categoryBreakdown(); track entry.category) {
                  <tr>
                    <td>
                      <div class="cat-cell">
                        <span>{{ getCategoryIcon(entry.category) }}</span>
                        <span>{{ getCategoryName(entry.category) }}</span>
                      </div>
                    </td>
                    <td class="text-right font-semibold">{{ entry.amount | currencyFormat }}</td>
                    <td class="text-right">{{ entry.pct | number:'1.1-1' }}%</td>
                    <td style="width: 200px;">
                      <div class="progress-bar">
                        <div class="progress-fill" [style.width.%]="entry.pct"
                             [style.background]="getCategoryColor(entry.category)"></div>
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        <!-- Monthly breakdown table for yearly report -->
        @if (reportType === 'yearly' && reportData().monthlyBreakdown) {
          <div class="card">
            <div class="card-header">
              <span class="card-title">Month-by-Month Summary</span>
            </div>
            <div class="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th class="text-right">Income</th>
                    <th class="text-right">Expenses</th>
                    <th class="text-right">Net</th>
                    <th class="text-right">Savings Rate</th>
                  </tr>
                </thead>
                <tbody>
                  @for (m of reportData().monthlyBreakdown; track m.month) {
                    <tr>
                      <td>{{ monthName(m.month) }}</td>
                      <td class="text-right text-income">{{ m.income | currencyFormat }}</td>
                      <td class="text-right text-expense">{{ m.expenses | currencyFormat }}</td>
                      <td class="text-right" [class.text-income]="m.net >= 0" [class.text-expense]="m.net < 0">
                        {{ m.net | currencyFormat }}
                      </td>
                      <td class="text-right">
                        <span [class.text-income]="m.income > 0 && monthlySavingsRate(m) >= 20"
                              [class.text-expense]="m.income > 0 && monthlySavingsRate(m) < 0"
                              [class.text-muted]="m.income === 0">
                          {{ m.income > 0 ? (monthlySavingsRate(m) | number:'1.0-0') + '%' : '—' }}
                        </span>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }
      } @else {
        <div class="card empty-state">
          <span class="empty-icon">📊</span>
          <h3>No data available</h3>
          <p>Add some transactions to see your reports.</p>
        </div>
      }
    </div>
  `,
  styles: [`
    .reports-page { padding: 1.5rem 2rem; display: flex; flex-direction: column; gap: 1.25rem; }

    .controls-card { padding: 1rem 1.25rem; }
    .controls-row { display: flex; gap: 1rem; align-items: flex-end; flex-wrap: wrap; }
    .control-group { display: flex; flex-direction: column; gap: 0.375rem; min-width: 140px; }

    .kpi-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 1rem; }
    .kpi-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 1.25rem;
      display: flex;
      align-items: center;
      gap: 0.875rem;
    }
    .kpi-icon { font-size: 1.75rem; flex-shrink: 0; }
    .kpi-info { display: flex; flex-direction: column; gap: 0.25rem; }
    .kpi-label { font-size: 0.75rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
    .kpi-value { font-size: 1.25rem; font-weight: 700; }

    .charts-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; }
    .chart-container { height: 280px; position: relative; }

    .cat-cell { display: flex; align-items: center; gap: 0.5rem; }

    .loading-state { display: flex; flex-direction: column; align-items: center; gap: 1rem; padding: 3rem; }
    .spinner { width: 32px; height: 32px; border: 3px solid var(--border); border-top-color: var(--accent-blue); border-radius: 50%; animation: spin 0.8s linear infinite; }
    .empty-state { display: flex; flex-direction: column; align-items: center; gap: 0.75rem; padding: 3rem; text-align: center; }
    .empty-icon { font-size: 3rem; }
    .empty-state h3 { color: var(--text-primary); }
    .empty-state p { color: var(--text-muted); }

    @media (max-width: 1200px) { .kpi-grid { grid-template-columns: repeat(3, 1fr); } }
    @media (max-width: 768px) {
      .reports-page { padding: 1rem; }
      .kpi-grid { grid-template-columns: repeat(2, 1fr); }
      .charts-grid { grid-template-columns: 1fr; }
    }
  `]
})
export class ReportsComponent implements OnInit, AfterViewInit {
  private api = inject(ApiService);
  categoryService = inject(CategoryService);

  @ViewChild('categoryChart') categoryChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('trendChart') trendChartRef!: ElementRef<HTMLCanvasElement>;

  loading = signal(false);
  reportData = signal<any>(null);
  reportType = 'monthly';
  selectedYear = new Date().getFullYear();
  selectedMonth = new Date().getMonth() + 1;

  years = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i);
  months = [
    { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
    { value: 4, label: 'April' }, { value: 5, label: 'May' }, { value: 6, label: 'June' },
    { value: 7, label: 'July' }, { value: 8, label: 'August' }, { value: 9, label: 'September' },
    { value: 10, label: 'October' }, { value: 11, label: 'November' }, { value: 12, label: 'December' },
  ];

  private categoryChartInstance?: Chart;
  private trendChartInstance?: Chart;

  categoryBreakdown() {
    const data = this.reportData();
    if (!data?.categoryBreakdown) return [];
    const total = Object.values(data.categoryBreakdown as Record<string, number>).reduce((s: number, v) => s + (v as number), 0);
    return Object.entries(data.categoryBreakdown as Record<string, number>)
      .map(([category, amount]) => ({ category, amount, pct: total > 0 ? (amount / total) * 100 : 0 }))
      .sort((a, b) => b.amount - a.amount);
  }

  ngOnInit() {
    this.categoryService.loadCategories().subscribe();
    this.loadReport();
  }

  ngAfterViewInit() {}

  loadReport() {
    this.loading.set(true);
    const obs = this.reportType === 'monthly'
      ? this.api.getMonthlyReport(this.selectedYear, this.selectedMonth)
      : this.api.getYearlyReport(this.selectedYear);

    obs.subscribe({
      next: res => {
        this.loading.set(false);
        if (res.success) {
          this.reportData.set(res.data);
          setTimeout(() => this.renderCharts(), 100);
        }
      },
      error: () => {
        this.loading.set(false);
        this.reportData.set(null);
      }
    });
  }

  private renderCharts() {
    this.renderCategoryChart();
    if (this.reportType === 'yearly') this.renderTrendChart();
  }

  private renderCategoryChart() {
    if (!this.categoryChartRef) return;
    this.categoryChartInstance?.destroy();
    const breakdown = this.categoryBreakdown();
    const labels = breakdown.map(e => this.getCategoryName(e.category));
    const data = breakdown.map(e => e.amount);
    const colors = breakdown.map(e => this.getCategoryColor(e.category));

    this.categoryChartInstance = new Chart(this.categoryChartRef.nativeElement, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: 'var(--bg-card)' }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { color: '#9fa8da', font: { size: 11 }, boxWidth: 14 } },
          tooltip: { callbacks: { label: ctx => ` $${ctx.parsed.toLocaleString()} (${breakdown[ctx.dataIndex].pct.toFixed(1)}%)` } }
        },
        cutout: '55%',
      }
    });
  }

  private renderTrendChart() {
    if (!this.trendChartRef) return;
    this.trendChartInstance?.destroy();
    const data = this.reportData();
    if (!data?.monthlyBreakdown) return;
    const labels = data.monthlyBreakdown.map((m: any) => this.monthName(m.month).slice(0, 3));
    this.trendChartInstance = new Chart(this.trendChartRef.nativeElement, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Income', data: data.monthlyBreakdown.map((m: any) => m.income), borderColor: '#4caf50', backgroundColor: 'rgba(76,175,80,0.1)', fill: true, tension: 0.4 },
          { label: 'Expenses', data: data.monthlyBreakdown.map((m: any) => m.expenses), borderColor: '#ef5350', backgroundColor: 'rgba(239,83,80,0.1)', fill: true, tension: 0.4 },
          { label: 'Net', data: data.monthlyBreakdown.map((m: any) => m.net), borderColor: '#5c6bc0', backgroundColor: 'rgba(92,107,192,0.1)', fill: false, tension: 0.4, borderDash: [5, 5] },
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#9fa8da', font: { size: 11 } } } },
        scales: {
          x: { ticks: { color: '#9fa8da' }, grid: { color: 'rgba(46,50,80,0.5)' } },
          y: { ticks: { color: '#9fa8da', callback: (v: any) => `$${Number(v).toLocaleString()}` }, grid: { color: 'rgba(46,50,80,0.5)' } }
        }
      }
    });
  }

  monthName(m: number) { return this.months.find(mo => mo.value === m)?.label ?? ''; }
  getCategoryIcon(id: string) { return this.categoryService.getCategoryIcon(id); }
  getCategoryColor(id: string) { return this.categoryService.getCategoryColor(id); }
  getCategoryName(id: string) { return this.categoryService.getCategoryById(id)?.name ?? id; }

  /** Savings rate for a monthly row — capped at -100% to avoid wild numbers */
  monthlySavingsRate(m: { income: number; net: number }): number {
    if (m.income <= 0) return 0;
    const rate = (m.net / m.income) * 100;
    return Math.round(Math.max(rate, -100));
  }
}

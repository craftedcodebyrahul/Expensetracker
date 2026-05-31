import {
  Component, OnInit, OnDestroy, inject, signal, computed,
  AfterViewInit, ViewChild, ElementRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TransactionService } from '../../core/services/transaction.service';
import { CategoryService } from '../../core/services/category.service';
import { HeaderComponent } from '../../layout/header.component';
import { CurrencyFormatPipe } from '../../shared/pipes/currency-format.pipe';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

interface AutoInsight { icon: string; text: string; type: 'good' | 'warn' | 'info' | 'bad'; }
interface CategoryTrend { id: string; name: string; icon: string; color: string; current: number; previous: number; change: number; barPct: number; }

@Component({
  selector: 'app-insights',
  standalone: true,
  imports: [CommonModule, FormsModule, HeaderComponent, CurrencyFormatPipe],
  templateUrl: './insights.component.html',
  styleUrl: './insights.component.css'
})
export class InsightsComponent implements OnInit, AfterViewInit, OnDestroy {
  private txnService = inject(TransactionService);
  private catService = inject(CategoryService);

  protected Math = Math;

  @ViewChild('trajectoryChart') trajectoryRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('trendChart')      trendRef!:      ElementRef<HTMLCanvasElement>;
  @ViewChild('savingsRateChart') srRef!:         ElementRef<HTMLCanvasElement>;
  @ViewChild('dowChart')        dowRef!:         ElementRef<HTMLCanvasElement>;
  @ViewChild('donutChart')      donutRef!:       ElementRef<HTMLCanvasElement>;
  @ViewChild('goalChart')       goalRef!:        ElementRef<HTMLCanvasElement>;

  loading = signal(true);
  period = 6; // months to analyse

  // Goal simulator inputs
  goalAmount = 10000;
  goalMonthly = 500;

  private charts: Chart[] = [];

  // ── Derived month buckets ─────────────────────────────────────────────────

  private monthBuckets = computed(() => {
    const txns = this.txnService.transactions();
    const now = new Date();
    const buckets: Array<{ label: string; income: number; expenses: number; net: number; year: number; month: number }> = [];

    for (let i = this.period - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear(), m = d.getMonth();
      const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      const monthTxns = txns.filter(t => {
        const td = new Date(t.date);
        return td.getFullYear() === y && td.getMonth() === m;
      });
      const income   = monthTxns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
      const expenses = monthTxns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
      buckets.push({ label, income, expenses, net: income - expenses, year: y, month: m });
    }
    return buckets;
  });

  // ── KPI signals ───────────────────────────────────────────────────────────

  totalSaved = computed(() => this.monthBuckets().reduce((s, b) => s + b.net, 0));

  avgMonthlySavings = computed(() => {
    const b = this.monthBuckets();
    return b.length ? this.totalSaved() / b.length : 0;
  });

  avgSavingsRate = computed(() => {
    const b = this.monthBuckets();
    // Only include months that had income to avoid dividing by zero
    const rates = b.filter(m => m.income > 0).map(m => (m.net / m.income) * 100);
    if (!rates.length) return 0;
    const avg = rates.reduce((s, r) => s + r, 0) / rates.length;
    // Clamp to -100% minimum for display sanity
    return Math.round(Math.max(avg, -100));
  });

  dailyBurnRate = computed(() => {
    const now = new Date();
    const txns = this.txnService.transactions().filter(t => {
      const d = new Date(t.date);
      return t.type === 'expense' && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });
    const total = txns.reduce((s, t) => s + t.amount, 0);
    const daysElapsed = now.getDate();
    return daysElapsed > 0 ? total / daysElapsed : 0;
  });

  runway = computed(() => {
    const avgExpenses = this.monthBuckets().reduce((s, b) => s + b.expenses, 0) / (this.period || 1);
    const saved = this.totalSaved();
    // Only meaningful when you have positive savings AND expenses
    if (avgExpenses <= 0 || saved <= 0) return 0;
    return saved / avgExpenses;
  });

  // ── Projections ───────────────────────────────────────────────────────────

  projection3m  = computed(() => this.totalSaved() + this.avgMonthlySavings() * 3);
  projection6m  = computed(() => this.totalSaved() + this.avgMonthlySavings() * 6);
  projection12m = computed(() => this.totalSaved() + this.avgMonthlySavings() * 12);
  projection24m = computed(() => this.totalSaved() + this.avgMonthlySavings() * 24);

  // ── Category trends ───────────────────────────────────────────────────────

  categoryTrends = computed<CategoryTrend[]>(() => {
    const txns = this.txnService.transactions();
    const now = new Date();
    const half = Math.ceil(this.period / 2);

    const sumByCategory = (monthsBack: number, count: number) => {
      const map: Record<string, number> = {};
      for (let i = monthsBack; i < monthsBack + count; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        txns.filter(t => {
          const td = new Date(t.date);
          return t.type === 'expense' && td.getFullYear() === d.getFullYear() && td.getMonth() === d.getMonth();
        }).forEach(t => { map[t.category] = (map[t.category] || 0) + t.amount; });
      }
      return map;
    };

    const current  = sumByCategory(0, half);
    const previous = sumByCategory(half, half);
    const maxVal   = Math.max(...Object.values(current), 1);

    return Object.entries(current)
      .map(([id, curr]) => {
        const prev = previous[id] ?? 0;
        const change = prev > 0 ? Math.round(((curr - prev) / prev) * 100) : 0;
        const cat = this.catService.getCategoryById(id);
        return {
          id, current: curr, previous: prev, change,
          name:   cat?.name  ?? id,
          icon:   cat?.icon  ?? '💸',
          color:  cat?.color ?? '#607D8B',
          barPct: Math.round((curr / maxVal) * 100),
        };
      })
      .sort((a, b) => b.current - a.current)
      .slice(0, 10);
  });

  // ── Auto-generated insights ───────────────────────────────────────────────

  autoInsights = computed<AutoInsight[]>(() => {
    const insights: AutoInsight[] = [];
    const sr  = this.avgSavingsRate();
    const avg = this.avgMonthlySavings();
    const run = this.runway();
    const trends = this.categoryTrends();

    // Savings rate insight
    if (sr >= 20) {
      insights.push({ icon: '🌟', text: `Great job! You're saving ${sr.toFixed(1)}% of your income on average.`, type: 'good' });
    } else if (sr >= 10) {
      insights.push({ icon: '👍', text: `You're saving ${sr.toFixed(1)}% of income. Aim for 20%+ for financial security.`, type: 'info' });
    } else if (sr >= 0) {
      insights.push({ icon: '💡', text: `Savings rate is ${sr.toFixed(1)}%. Small cuts in top categories can make a big difference.`, type: 'warn' });
    } else {
      // In deficit — show how much over budget
      const deficit = Math.abs(avg);
      insights.push({ icon: '⚠️', text: `You're spending ${deficit > 0 ? '$' + deficit.toFixed(0) + ' more than you earn' : 'more than you earn'} on average. Review your top expenses.`, type: 'bad' });
    }

    // Runway insight
    if (run >= 6) {
      insights.push({ icon: '🛡️', text: `Your net savings cover ${run.toFixed(1)} months of expenses — solid buffer.`, type: 'good' });
    } else if (run >= 1) {
      insights.push({ icon: '⚡', text: `Only ${run.toFixed(1)} months of expense coverage from savings. Build your buffer.`, type: 'warn' });
    } else if (avg < 0) {
      insights.push({ icon: '🔴', text: `You're in a spending deficit. Focus on reducing your top expense categories.`, type: 'bad' });
    }

    // Category trend insights
    const bigRise = trends.find(t => t.change > 30);
    if (bigRise) {
      insights.push({ icon: '📈', text: `${bigRise.name} spending rose ${bigRise.change}% vs last period — worth reviewing.`, type: 'warn' });
    }

    const bigDrop = trends.find(t => t.change < -20);
    if (bigDrop) {
      insights.push({ icon: '✂️', text: `${bigDrop.name} spending dropped ${Math.abs(bigDrop.change)}% — nice reduction!`, type: 'good' });
    }

    // Projection insight (only when positive)
    if (avg > 0) {
      const annual = avg * 12;
      insights.push({ icon: '🚀', text: `At your current rate you'll save $${annual.toLocaleString('en-US', { maximumFractionDigits: 0 })} over the next 12 months.`, type: 'info' });
    }

    return insights.slice(0, 5);
  });

  // ── Goal simulator ────────────────────────────────────────────────────────

  goalMonths = signal(0);
  goalYears  = signal('');
  goalMonthsAtCurrentRate = signal(0);

  recalcGoal() {
    if (!this.goalAmount || !this.goalMonthly || this.goalMonthly <= 0) { this.goalMonths.set(0); return; }
    const months = Math.ceil(this.goalAmount / this.goalMonthly);
    this.goalMonths.set(months);
    const y = Math.floor(months / 12), m = months % 12;
    this.goalYears.set(y > 0 ? `${y}y ${m}m` : `${m} months`);
    const avg = this.avgMonthlySavings();
    this.goalMonthsAtCurrentRate.set(avg > 0 ? Math.ceil(this.goalAmount / avg) : 0);
    setTimeout(() => this.renderGoalChart(), 50);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit() {
    this.txnService.loadTransactions({
      dateFrom: this.nMonthsAgo(this.period + 6),
      dateTo: new Date().toISOString().split('T')[0]
    }).subscribe(() => {
      this.loading.set(false);
      setTimeout(() => this.renderAllCharts(), 100);
    });
    this.catService.loadCategories().subscribe();
  }

  ngAfterViewInit() {}

  ngOnDestroy() { this.charts.forEach(c => c.destroy()); }

  setPeriod(p: number) {
    this.period = p;
    this.charts.forEach(c => c.destroy());
    this.charts = [];
    setTimeout(() => this.renderAllCharts(), 100);
  }

  // ── Chart rendering ───────────────────────────────────────────────────────

  private renderAllCharts() {
    this.renderTrajectoryChart();
    this.renderTrendChart();
    this.renderSavingsRateChart();
    this.renderDowChart();
    this.renderDonutChart();
    this.recalcGoal();
  }

  private mk(ref: ElementRef<HTMLCanvasElement> | undefined, config: any): Chart | null {
    if (!ref?.nativeElement) return null;
    const c = new Chart(ref.nativeElement, config);
    this.charts.push(c);
    return c;
  }

  private renderTrajectoryChart() {
    const buckets = this.monthBuckets();
    // Cumulative actual savings
    let cumulative = 0;
    const actualData = buckets.map(b => { cumulative += b.net; return cumulative; });
    const labels = buckets.map(b => b.label);

    // Project 12 more months from last actual point
    const avg = this.avgMonthlySavings();
    const projLabels: string[] = [];
    const projData: (number | null)[] = actualData.map(() => null);
    let last = cumulative;
    const now = new Date();
    for (let i = 1; i <= 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      projLabels.push(d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }));
      last += avg;
      projData.push(last);
    }
    // Connect last actual to first projected
    projData[buckets.length - 1] = cumulative;

    this.mk(this.trajectoryRef, {
      type: 'line',
      data: {
        labels: [...labels, ...projLabels],
        datasets: [
          {
            label: 'Actual Savings',
            data: [...actualData, ...Array(projLabels.length).fill(null)],
            borderColor: '#4caf50', backgroundColor: 'rgba(76,175,80,0.1)',
            fill: true, tension: 0.4, pointRadius: 4, borderWidth: 2,
          },
          {
            label: 'Projected',
            data: projData,
            borderColor: '#5c6bc0', backgroundColor: 'rgba(92,107,192,0.05)',
            fill: true, tension: 0.4, borderDash: [6, 4], pointRadius: 3, borderWidth: 2,
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#9fa8da', font: { size: 11 } } },
          tooltip: { callbacks: { label: (ctx: any) => ` $${ctx.parsed.y?.toLocaleString() ?? 0}` } }
        },
        scales: {
          x: { ticks: { color: '#9fa8da', maxTicksLimit: 12 }, grid: { color: 'rgba(46,50,80,0.4)' } },
          y: { ticks: { color: '#9fa8da', callback: (v: any) => '$' + Number(v).toLocaleString() }, grid: { color: 'rgba(46,50,80,0.4)' } }
        }
      }
    });
  }

  private renderTrendChart() {
    const b = this.monthBuckets();
    this.mk(this.trendRef, {
      type: 'bar',
      data: {
        labels: b.map(m => m.label),
        datasets: [
          { label: 'Income', data: b.map(m => m.income), backgroundColor: 'rgba(76,175,80,0.7)', borderColor: '#4caf50', borderWidth: 1, borderRadius: 4 },
          { label: 'Expenses', data: b.map(m => m.expenses), backgroundColor: 'rgba(239,83,80,0.7)', borderColor: '#ef5350', borderWidth: 1, borderRadius: 4 },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#9fa8da', font: { size: 11 } } } },
        scales: {
          x: { ticks: { color: '#9fa8da' }, grid: { color: 'rgba(46,50,80,0.4)' } },
          y: { ticks: { color: '#9fa8da', callback: (v: any) => '$' + Number(v).toLocaleString() }, grid: { color: 'rgba(46,50,80,0.4)' } }
        }
      }
    });
  }

  private renderSavingsRateChart() {
    const b = this.monthBuckets();
    const rates = b.map(m => m.income > 0 ? Math.round((m.net / m.income) * 100) : 0);
    this.mk(this.srRef, {
      type: 'bar',
      data: {
        labels: b.map(m => m.label),
        datasets: [{
          label: 'Savings Rate %',
          data: rates,
          backgroundColor: rates.map(r => r >= 20 ? 'rgba(76,175,80,0.75)' : r >= 0 ? 'rgba(255,193,7,0.75)' : 'rgba(239,83,80,0.75)'),
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx: any) => ` ${ctx.parsed.y}%` } }
        },
        scales: {
          x: { ticks: { color: '#9fa8da' }, grid: { color: 'rgba(46,50,80,0.4)' } },
          y: { ticks: { color: '#9fa8da', callback: (v: any) => v + '%' }, grid: { color: 'rgba(46,50,80,0.4)' } }
        }
      }
    });
  }

  private renderDowChart() {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const totals = Array(7).fill(0);
    const now = new Date();
    this.txnService.transactions()
      .filter(t => {
        const d = new Date(t.date);
        return t.type === 'expense' && (now.getTime() - d.getTime()) < this.period * 30 * 24 * 3600 * 1000;
      })
      .forEach(t => { totals[new Date(t.date).getDay()] += t.amount; });

    this.mk(this.dowRef, {
      type: 'bar',
      data: {
        labels: days,
        datasets: [{
          label: 'Total Spent',
          data: totals,
          backgroundColor: 'rgba(92,107,192,0.7)',
          borderColor: '#5c6bc0',
          borderWidth: 1,
          borderRadius: 6,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx: any) => ` $${ctx.parsed.y?.toLocaleString() ?? 0}` } }
        },
        scales: {
          x: { ticks: { color: '#9fa8da' }, grid: { display: false } },
          y: { ticks: { color: '#9fa8da', callback: (v: any) => '$' + Number(v).toLocaleString() }, grid: { color: 'rgba(46,50,80,0.4)' } }
        }
      }
    });
  }

  private renderDonutChart() {
    const trends = this.categoryTrends();
    this.mk(this.donutRef, {
      type: 'doughnut',
      data: {
        labels: trends.map(t => t.name),
        datasets: [{
          data: trends.map(t => t.current),
          backgroundColor: trends.map(t => t.color + 'cc'),
          borderColor: trends.map(t => t.color),
          borderWidth: 1,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { color: '#9fa8da', font: { size: 10 }, boxWidth: 12 } },
          tooltip: { callbacks: { label: (ctx: any) => ` $${ctx.parsed?.toLocaleString() ?? 0}` } }
        },
        cutout: '60%',
      }
    });
  }

  private renderGoalChart() {
    if (!this.goalRef?.nativeElement || !this.goalAmount || !this.goalMonthly) return;
    // Destroy existing goal chart
    const existing = this.charts.find(c => c.canvas === this.goalRef.nativeElement);
    if (existing) { existing.destroy(); this.charts = this.charts.filter(c => c !== existing); }

    const months = this.goalMonths();
    const labels = Array.from({ length: months + 1 }, (_, i) => i === 0 ? 'Now' : `M${i}`);
    const data   = Array.from({ length: months + 1 }, (_, i) => i * this.goalMonthly);

    this.mk(this.goalRef, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Savings Progress',
            data,
            borderColor: '#5c6bc0', backgroundColor: 'rgba(92,107,192,0.1)',
            fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2,
          },
          {
            label: 'Goal',
            data: Array(months + 1).fill(this.goalAmount),
            borderColor: '#4caf50', borderDash: [6, 4],
            pointRadius: 0, borderWidth: 2, fill: false,
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#9fa8da', font: { size: 11 } } },
          tooltip: { callbacks: { label: (ctx: any) => ` $${ctx.parsed.y?.toLocaleString() ?? 0}` } }
        },
        scales: {
          x: { ticks: { color: '#9fa8da', maxTicksLimit: 8 }, grid: { color: 'rgba(46,50,80,0.4)' } },
          y: { ticks: { color: '#9fa8da', callback: (v: any) => '$' + Number(v).toLocaleString() }, grid: { color: 'rgba(46,50,80,0.4)' } }
        }
      }
    });
  }

  private nMonthsAgo(n: number): string {
    const d = new Date();
    d.setMonth(d.getMonth() - n);
    return d.toISOString().split('T')[0];
  }
}

import {
  Component, OnInit, OnDestroy, inject, signal, computed,
  AfterViewInit, ViewChild, ElementRef, effect
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { TransactionService } from '../../core/services/transaction.service';
import { CategoryService } from '../../core/services/category.service';
import { ApiService } from '../../core/services/api.service';
import { HeaderComponent } from '../../layout/header.component';
import { CurrencyFormatPipe } from '../../shared/pipes/currency-format.pipe';
import { parseLocalDate } from '../../shared/utils/date.utils';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

type PeriodType = 'monthly' | 'quarterly' | 'semi-annually' | 'yearly';
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
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);

  protected Math = Math;

  @ViewChild('trajectoryChart') trajectoryRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('trendChart')      trendRef!:      ElementRef<HTMLCanvasElement>;
  @ViewChild('savingsRateChart') srRef!:        ElementRef<HTMLCanvasElement>;
  @ViewChild('dowChart')        dowRef!:        ElementRef<HTMLCanvasElement>;
  @ViewChild('donutChart')      donutRef!:      ElementRef<HTMLCanvasElement>;
  @ViewChild('goalChart')       goalRef!:       ElementRef<HTMLCanvasElement>;

  loading = signal(true);

  // Selector Signals
  periodType = signal<PeriodType>('monthly');
  selectedYear = signal<number>(new Date().getFullYear());
  selectedMonth = signal<number>(new Date().getMonth());
  selectedQuarter = signal<number>(Math.floor(new Date().getMonth() / 3) + 1);
  selectedHalf = signal<number>(new Date().getMonth() < 6 ? 1 : 2);

  // AI Advice Modal Signals
  showAiAdviceDialog = signal(false);
  aiLoading = signal(false);
  aiSummary = signal('');
  aiAdvice = signal<any[]>([]);
  aiError = signal('');

  goalAmount = 10000;
  goalMonthly = 500;

  private charts: Chart[] = [];

  constructor() {
    // Reactively re-render charts when parameters or data changes
    effect(() => {
      this.periodBoundaries();
      this.txnService.postedTransactions();
      const isLoading = this.loading();
      if (!isLoading) {
        setTimeout(() => this.renderAllCharts(), 50);
      }
    });
  }

  // Listing available years dynamically from transaction dates
  availableYears = computed(() => {
    const txns = this.txnService.postedTransactions();
    const years = new Set<number>();
    years.add(new Date().getFullYear());
    txns.forEach(t => {
      const d = parseLocalDate(t.date);
      years.add(d.getFullYear());
    });
    return Array.from(years).sort((a, b) => b - a);
  });

  // Calculate start/end dates for current and previous comparative periods
  periodBoundaries = computed(() => {
    const type = this.periodType();
    const y = this.selectedYear();
    let startDate = '';
    let endDate = '';
    let prevStartDate = '';
    let prevEndDate = '';
    let label = '';
    let prevLabel = '';
    let daysInPeriod = 30;

    if (type === 'monthly') {
      const m = this.selectedMonth();
      startDate = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(y, m + 1, 0).getDate();
      endDate = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      daysInPeriod = lastDay;
      label = new Date(y, m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

      const py = m === 0 ? y - 1 : y;
      const pm = m === 0 ? 11 : m - 1;
      prevStartDate = `${py}-${String(pm + 1).padStart(2, '0')}-01`;
      const prevLastDay = new Date(py, pm + 1, 0).getDate();
      prevEndDate = `${py}-${String(pm + 1).padStart(2, '0')}-${String(prevLastDay).padStart(2, '0')}`;
      prevLabel = new Date(py, pm, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    else if (type === 'quarterly') {
      const q = this.selectedQuarter();
      const startMonth = (q - 1) * 3;
      startDate = `${y}-${String(startMonth + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(y, startMonth + 3, 0).getDate();
      endDate = `${y}-${String(startMonth + 3).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      daysInPeriod = q === 1 || q === 4 ? 90 : 91;
      if (q === 1 && y % 4 === 0) daysInPeriod = 91; // Leap year
      label = `Q${q} ${y}`;

      const pq = q === 1 ? 4 : q - 1;
      const py = q === 1 ? y - 1 : y;
      const pStartMonth = (pq - 1) * 3;
      prevStartDate = `${py}-${String(pStartMonth + 1).padStart(2, '0')}-01`;
      const pLastDay = new Date(py, pStartMonth + 3, 0).getDate();
      prevEndDate = `${py}-${String(pStartMonth + 3).padStart(2, '0')}-${String(pLastDay).padStart(2, '0')}`;
      prevLabel = `Q${pq} ${py}`;
    }
    else if (type === 'semi-annually') {
      const h = this.selectedHalf();
      if (h === 1) {
        startDate = `${y}-01-01`;
        endDate = `${y}-06-30`;
        daysInPeriod = y % 4 === 0 ? 182 : 181;
        label = `H1 ${y}`;

        prevStartDate = `${y - 1}-07-01`;
        prevEndDate = `${y - 1}-12-31`;
        prevLabel = `H2 ${y - 1}`;
      } else {
        startDate = `${y}-07-01`;
        endDate = `${y}-12-31`;
        daysInPeriod = 184;
        label = `H2 ${y}`;

        prevStartDate = `${y}-01-01`;
        prevEndDate = `${y}-06-30`;
        prevLabel = `H1 ${y}`;
      }
    }
    else if (type === 'yearly') {
      startDate = `${y}-01-01`;
      endDate = `${y}-12-31`;
      daysInPeriod = y % 4 === 0 ? 366 : 365;
      label = `Year ${y}`;

      prevStartDate = `${y - 1}-01-01`;
      prevEndDate = `${y - 1}-12-31`;
      prevLabel = `Year ${y - 1}`;
    }

    return { startDate, endDate, prevStartDate, prevEndDate, label, prevLabel, daysInPeriod };
  });

  // Filtered transactions for the current period
  currentPeriodTransactions = computed(() => {
    const txns = this.txnService.postedTransactions();
    const { startDate, endDate } = this.periodBoundaries();
    return txns.filter(t => t.date >= startDate && t.date <= endDate);
  });

  // Filtered transactions for the previous period
  previousPeriodTransactions = computed(() => {
    const txns = this.txnService.postedTransactions();
    const { prevStartDate, prevEndDate } = this.periodBoundaries();
    return txns.filter(t => t.date >= prevStartDate && t.date <= prevEndDate);
  });

  currentPeriodSummary = computed(() => {
    const txns = this.currentPeriodTransactions();
    const income = txns.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const expenses = txns.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const net = income - expenses;
    const savingsRate = income > 0 ? (net / income) * 100 : (expenses > 0 ? -100 : 0);
    const dailySpend = this.periodBoundaries().daysInPeriod > 0 ? expenses / this.periodBoundaries().daysInPeriod : 0;
    return { income, expenses, net, savingsRate, dailySpend };
  });

  previousPeriodSummary = computed(() => {
    const txns = this.previousPeriodTransactions();
    const income = txns.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const expenses = txns.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const net = income - expenses;
    const savingsRate = income > 0 ? (net / income) * 100 : (expenses > 0 ? -100 : 0);
    return { income, expenses, net, savingsRate };
  });

  popComparison = computed(() => {
    const curr = this.currentPeriodSummary();
    const prev = this.previousPeriodSummary();

    const pctChange = (c: number, p: number) => {
      if (p === 0) return c > 0 ? 100 : 0;
      return Math.round(((c - p) / p) * 100);
    };

    return {
      incomeChange: pctChange(curr.income, prev.income),
      expenseChange: pctChange(curr.expenses, prev.expenses),
      netChange: curr.net >= prev.net ? 1 : -1,
      netDiff: Math.abs(curr.net - prev.net)
    };
  });

  categoryTrends = computed<CategoryTrend[]>(() => {
    const currTxns = this.currentPeriodTransactions();
    const prevTxns = this.previousPeriodTransactions();

    const sumByCategory = (txns: any[]) => {
      const map: Record<string, number> = {};
      txns.filter(t => t.type === 'expense').forEach(t => {
        map[t.category] = (map[t.category] || 0) + t.amount;
      });
      return map;
    };

    const current = sumByCategory(currTxns);
    const previous = sumByCategory(prevTxns);

    const maxVal = Math.max(...Object.values(current), 1);

    return Object.entries(current)
      .map(([id, currVal]) => {
        const prevVal = previous[id] ?? 0;
        const change = prevVal > 0 ? Math.round(((currVal - prevVal) / prevVal) * 100) : (prevVal === 0 && currVal > 0 ? 100 : 0);
        const cat = this.catService.getCategoryById(id);
        return {
          id,
          current: currVal,
          previous: prevVal,
          change,
          name: cat?.name ?? id,
          icon: cat?.icon ?? '💸',
          color: cat?.color ?? '#607D8B',
          barPct: Math.round((currVal / maxVal) * 100)
        };
      })
      .sort((a, b) => b.current - a.current)
      .slice(0, 10);
  });

  // Local indicator chips (Heuristic Advice)
  heuristicInsights = computed<AutoInsight[]>(() => {
    const curr = this.currentPeriodSummary();
    const prev = this.previousPeriodSummary();
    const trends = this.categoryTrends();
    const insights: AutoInsight[] = [];

    // Savings Rate Indicator
    if (curr.savingsRate >= 20) {
      insights.push({ icon: '🌟', text: `Excellent! Your savings rate for this period is ${curr.savingsRate.toFixed(1)}%.`, type: 'good' });
    } else if (curr.savingsRate >= 10) {
      insights.push({ icon: '👍', text: `You saved ${curr.savingsRate.toFixed(1)}% of your income. Trimming minor categories can push you towards 20%.`, type: 'info' });
    } else if (curr.savingsRate >= 0) {
      insights.push({ icon: '💡', text: `Savings rate is ${curr.savingsRate.toFixed(1)}%. Trimming minor categories could help.`, type: 'warn' });
    } else {
      insights.push({ icon: '⚠️', text: `Spending deficit: You spent $${Math.abs(curr.net).toFixed(0)} more than you earned this period.`, type: 'bad' });
    }

    // Total Spending PoP
    if (prev.expenses > 0) {
      const change = ((curr.expenses - prev.expenses) / prev.expenses) * 100;
      if (change > 15) {
        insights.push({ icon: '📈', text: `Total expenses increased by ${change.toFixed(0)}% compared to the previous period.`, type: 'warn' });
      } else if (change < -10) {
        insights.push({ icon: '✂️', text: `Nice job! Total expenses decreased by ${Math.abs(change).toFixed(0)}% compared to the previous period.`, type: 'good' });
      }
    }

    // Category Spike
    const bigRise = trends.find(t => t.change > 25);
    if (bigRise) {
      insights.push({ icon: '🔍', text: `${bigRise.name} spending jumped by ${bigRise.change}% vs the previous period.`, type: 'warn' });
    }

    return insights;
  });

  savingsOpportunities = computed(() => {
    const trends = this.categoryTrends();
    const curr = this.currentPeriodSummary();
    const opps: Array<{ icon: string; title: string; text: string; action: string }> = [];

    trends.forEach(t => {
      if (t.change > 15 && t.current > 100) {
        const potentialSavings = t.current * 0.2;
        opps.push({
          icon: '📉',
          title: `Optimize ${t.name}`,
          text: `Your ${t.name} spending jumped by ${t.change}% PoP, reaching $${t.current.toFixed(0)}.`,
          action: `Reducing this category by 20% next period would save you $${potentialSavings.toFixed(0)}.`
        });
      }
    });

    if (curr.savingsRate < 20) {
      const gap = (curr.income * 0.2) - curr.net;
      if (gap > 0 && curr.income > 0) {
        opps.push({
          icon: '🎯',
          title: 'Reach 20% Savings Rate',
          text: `You are currently saving ${curr.savingsRate.toFixed(1)}%. To reach the recommended 20% benchmark, you need to save an additional $${gap.toFixed(0)} this period.`,
          action: `Consider setting a weekly variable spending limit of $${Math.max(10, ((curr.expenses - gap) / 4.3)).toFixed(0)}.`
        });
      }
    }

    if (opps.length === 0) {
      opps.push({
        icon: '💡',
        title: 'Review Variable Outflows',
        text: 'Your category spending is stable compared to the previous period.',
        action: 'Consider setting up automatic savings transfers to build your emergency fund faster.'
      });
    }

    return opps.slice(0, 3);
  });

  // AI Advice dialog query
  askAiAdvisor() {
    this.showAiAdviceDialog.set(true);
    this.aiLoading.set(true);
    this.aiError.set('');
    this.aiSummary.set('');
    this.aiAdvice.set([]);

    const { startDate, endDate, prevStartDate, prevEndDate } = this.periodBoundaries();
    
    this.api.getAiAdvice(startDate, endDate, prevStartDate, prevEndDate).subscribe({
      next: res => {
        this.aiLoading.set(false);
        if (res.success && res.data) {
          this.aiSummary.set(res.data.summary);
          this.aiAdvice.set(res.data.advice);
        } else {
          this.aiError.set(res.error ?? 'Failed to load AI advice.');
        }
      },
      error: err => {
        this.aiLoading.set(false);
        this.aiError.set('An error occurred while connecting to the AI service.');
      }
    });
  }

  closeAiAdvice() {
    this.showAiAdviceDialog.set(false);
  }

  // Goal Simulator
  goalMonths = signal(0);
  goalYears  = signal('');
  goalMonthsAtCurrentRate = signal(0);

  recalcGoal() {
    if (!this.goalAmount || !this.goalMonthly || this.goalMonthly <= 0) { this.goalMonths.set(0); return; }
    const months = Math.ceil(this.goalAmount / this.goalMonthly);
    this.goalMonths.set(months);
    const y = Math.floor(months / 12), m = months % 12;
    this.goalYears.set(y > 0 ? `${y}y ${m}m` : `${m} months`);
    
    const curr = this.currentPeriodSummary();
    const periodDays = this.periodBoundaries().daysInPeriod;
    const monthlyEquivalent = this.periodType() === 'monthly' ? curr.net : (curr.net / (periodDays / 30));
    
    this.goalMonthsAtCurrentRate.set(monthlyEquivalent > 0 ? Math.ceil(this.goalAmount / monthlyEquivalent) : 0);
    setTimeout(() => this.renderGoalChart(), 50);
  }

  ngOnInit() {
    // Bind query parameters to preset period selectors if coming from Dashboard
    this.route.queryParams.subscribe(params => {
      const mode = params['mode'];
      if (mode === 'this-month') {
        this.periodType.set('monthly');
        this.selectedYear.set(new Date().getFullYear());
        this.selectedMonth.set(new Date().getMonth());
      } else if (mode === 'last-month') {
        this.periodType.set('monthly');
        const now = new Date();
        const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        this.selectedYear.set(d.getFullYear());
        this.selectedMonth.set(d.getMonth());
      }
    });

    // Load full transaction list
    this.txnService.loadTransactions().subscribe(() => {
      this.loading.set(false);
    });
    this.catService.loadCategories().subscribe();
  }

  ngAfterViewInit() {}
  ngOnDestroy() { this.charts.forEach(c => c.destroy()); }

  // ── Charts ────────────────────────────────────────────────────────────────

  private renderAllCharts() {
    this.charts.forEach(c => c.destroy());
    this.charts = [];

    if (this.loading() || this.currentPeriodTransactions().length === 0) return;

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

  private getSubPeriodTrendData() {
    const type = this.periodType();
    const currTxns = this.currentPeriodTransactions();

    let labels: string[] = [];
    let incomeData: number[] = [];
    let expenseData: number[] = [];

    if (type === 'yearly') {
      labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      incomeData = Array(12).fill(0);
      expenseData = Array(12).fill(0);
      currTxns.forEach(t => {
        const m = parseLocalDate(t.date).getMonth();
        if (t.type === 'income') incomeData[m] += t.amount;
        else if (t.type === 'expense') expenseData[m] += t.amount;
      });
    }
    else if (type === 'semi-annually') {
      const h = this.selectedHalf();
      const months = h === 1 ? [0, 1, 2, 3, 4, 5] : [6, 7, 8, 9, 10, 11];
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      labels = months.map(m => monthNames[m]);
      incomeData = Array(6).fill(0);
      expenseData = Array(6).fill(0);
      currTxns.forEach(t => {
        const m = parseLocalDate(t.date).getMonth();
        const idx = months.indexOf(m);
        if (idx >= 0) {
          if (t.type === 'income') incomeData[idx] += t.amount;
          else if (t.type === 'expense') expenseData[idx] += t.amount;
        }
      });
    }
    else if (type === 'quarterly') {
      const q = this.selectedQuarter();
      const months = q === 1 ? [0, 1, 2] : q === 2 ? [3, 4, 5] : q === 3 ? [6, 7, 8] : [9, 10, 11];
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      labels = months.map(m => monthNames[m]);
      incomeData = Array(3).fill(0);
      expenseData = Array(3).fill(0);
      currTxns.forEach(t => {
        const m = parseLocalDate(t.date).getMonth();
        const idx = months.indexOf(m);
        if (idx >= 0) {
          if (t.type === 'income') incomeData[idx] += t.amount;
          else if (t.type === 'expense') expenseData[idx] += t.amount;
        }
      });
    }
    else if (type === 'monthly') {
      labels = ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5'];
      incomeData = Array(5).fill(0);
      expenseData = Array(5).fill(0);
      currTxns.forEach(t => {
        const dateNum = parseLocalDate(t.date).getDate();
        let idx = 0;
        if (dateNum <= 7) idx = 0;
        else if (dateNum <= 14) idx = 1;
        else if (dateNum <= 21) idx = 2;
        else if (dateNum <= 28) idx = 3;
        else idx = 4;

        if (t.type === 'income') incomeData[idx] += t.amount;
        else if (t.type === 'expense') expenseData[idx] += t.amount;
      });
    }

    return { labels, incomeData, expenseData };
  }

  private renderTrajectoryChart() {
    const trend = this.getSubPeriodTrendData();
    let cumulative = 0;
    const actualData = trend.incomeData.map((inc, i) => {
      cumulative += (inc - trend.expenseData[i]);
      return cumulative;
    });

    const avgNet = actualData.length ? cumulative / actualData.length : 0;
    const projLabels: string[] = [];
    const projData: (number | null)[] = actualData.map(() => null);
    let last = cumulative;

    const type = this.periodType();
    for (let i = 1; i <= 6; i++) {
      projLabels.push(`+${i}${type === 'monthly' ? 'W' : 'M'}`);
      last += avgNet;
      projData.push(last);
    }
    projData[actualData.length - 1] = cumulative;

    this.mk(this.trajectoryRef, {
      type: 'line',
      data: { labels: [...trend.labels, ...projLabels], datasets: [
        { label: 'Actual Net Saved', data: [...actualData, ...Array(projLabels.length).fill(null)], borderColor: '#4caf50', backgroundColor: 'rgba(76,175,80,0.1)', fill: true, tension: 0.4, pointRadius: 4, borderWidth: 2 },
        { label: 'Projected Net Saved', data: projData, borderColor: '#5c6bc0', backgroundColor: 'rgba(92,107,192,0.05)', fill: true, tension: 0.4, borderDash: [6, 4], pointRadius: 3, borderWidth: 2 }
      ]},
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#9fa8da', font: { size: 11 } } }, tooltip: { callbacks: { label: (ctx: any) => ` $${ctx.parsed.y?.toLocaleString() ?? 0}` } } }, scales: { x: { ticks: { color: '#9fa8da', maxTicksLimit: 12 }, grid: { color: 'rgba(46,50,80,0.4)' } }, y: { ticks: { color: '#9fa8da', callback: (v: any) => '$' + Number(v).toLocaleString() }, grid: { color: 'rgba(46,50,80,0.4)' } } } }
    });
  }

  private renderTrendChart() {
    const trend = this.getSubPeriodTrendData();
    this.mk(this.trendRef, {
      type: 'bar',
      data: { labels: trend.labels, datasets: [
        { label: 'Income', data: trend.incomeData, backgroundColor: 'rgba(76,175,80,0.7)', borderColor: '#4caf50', borderWidth: 1, borderRadius: 4 },
        { label: 'Expenses', data: trend.expenseData, backgroundColor: 'rgba(239,83,80,0.7)', borderColor: '#ef5350', borderWidth: 1, borderRadius: 4 }
      ]},
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#9fa8da', font: { size: 11 } } } }, scales: { x: { ticks: { color: '#9fa8da' }, grid: { color: 'rgba(46,50,80,0.4)' } }, y: { ticks: { color: '#9fa8da', callback: (v: any) => '$' + Number(v).toLocaleString() }, grid: { color: 'rgba(46,50,80,0.4)' } } } }
    });
  }

  private renderSavingsRateChart() {
    const trend = this.getSubPeriodTrendData();
    const rates = trend.incomeData.map((inc, i) => {
      const exp = trend.expenseData[i];
      const net = inc - exp;
      if (inc === 0) return exp > 0 ? -100 : 0;
      return Math.round(Math.max((net / inc) * 100, -100));
    });

    this.mk(this.srRef, {
      type: 'bar',
      data: { labels: trend.labels, datasets: [{ label: 'Savings Rate %', data: rates, backgroundColor: rates.map(r => r >= 20 ? 'rgba(76,175,80,0.75)' : r >= 0 ? 'rgba(255,193,7,0.75)' : 'rgba(239,83,80,0.75)'), borderRadius: 4 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx: any) => ` ${ctx.parsed.y}%` } } }, scales: { x: { ticks: { color: '#9fa8da' }, grid: { color: 'rgba(46,50,80,0.4)' } }, y: { ticks: { color: '#9fa8da', callback: (v: any) => v + '%' }, grid: { color: 'rgba(46,50,80,0.4)' } } } }
    });
  }

  private renderDowChart() {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const totals = Array(7).fill(0);
    const currTxns = this.currentPeriodTransactions();
    currTxns.filter(t => t.type === 'expense').forEach(t => {
      totals[parseLocalDate(t.date).getDay()] += t.amount;
    });

    this.mk(this.dowRef, {
      type: 'bar',
      data: { labels: days, datasets: [{ label: 'Spent', data: totals, backgroundColor: 'rgba(92,107,192,0.7)', borderColor: '#5c6bc0', borderWidth: 1, borderRadius: 6 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx: any) => ` $${ctx.parsed.y?.toLocaleString() ?? 0}` } } }, scales: { x: { ticks: { color: '#9fa8da' }, grid: { display: false } }, y: { ticks: { color: '#9fa8da', callback: (v: any) => '$' + Number(v).toLocaleString() }, grid: { color: 'rgba(46,50,80,0.4)' } } } }
    });
  }

  private renderDonutChart() {
    const trends = this.categoryTrends();
    this.mk(this.donutRef, {
      type: 'doughnut',
      data: { labels: trends.map(t => t.name), datasets: [{ data: trends.map(t => t.current), backgroundColor: trends.map(t => t.color + 'cc'), borderColor: trends.map(t => t.color), borderWidth: 1 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#9fa8da', font: { size: 10 }, boxWidth: 12 } }, tooltip: { callbacks: { label: (ctx: any) => ` $${ctx.parsed?.toLocaleString() ?? 0}` } } }, cutout: '60%' }
    });
  }

  private renderGoalChart() {
    if (!this.goalRef?.nativeElement || !this.goalAmount || !this.goalMonthly) return;
    const existing = this.charts.find(c => c.canvas === this.goalRef.nativeElement);
    if (existing) { existing.destroy(); this.charts = this.charts.filter(c => c !== existing); }
    const months = this.goalMonths();
    const labels = Array.from({ length: months + 1 }, (_, i) => i === 0 ? 'Now' : `M${i}`);
    const data   = Array.from({ length: months + 1 }, (_, i) => i * this.goalMonthly);
    this.mk(this.goalRef, {
      type: 'line',
      data: { labels, datasets: [
        { label: 'Savings Progress', data, borderColor: '#5c6bc0', backgroundColor: 'rgba(92,107,192,0.1)', fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2 },
        { label: 'Goal', data: Array(months + 1).fill(this.goalAmount), borderColor: '#4caf50', borderDash: [6, 4], pointRadius: 0, borderWidth: 2, fill: false }
      ]},
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#9fa8da', font: { size: 11 } } }, tooltip: { callbacks: { label: (ctx: any) => ` $${ctx.parsed.y?.toLocaleString() ?? 0}` } } }, scales: { x: { ticks: { color: '#9fa8da', maxTicksLimit: 8 }, grid: { color: 'rgba(46,50,80,0.4)' } }, y: { ticks: { color: '#9fa8da', callback: (v: any) => '$' + Number(v).toLocaleString() }, grid: { color: 'rgba(46,50,80,0.4)' } } } }
    });
  }
}

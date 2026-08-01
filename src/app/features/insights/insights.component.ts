import {
  Component, OnInit, OnDestroy, inject, signal, computed,
  AfterViewInit, ViewChild, ElementRef, effect
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { TransactionService } from '../../core/services/transaction.service';
import { CategoryService } from '../../core/services/category.service';
import { AccountService } from '../../core/services/account.service';
import { ApiService } from '../../core/services/api.service';
import { SettingsService } from '../../core/services/settings.service';
import { HeaderComponent } from '../../layout/header.component';
import { CurrencyFormatPipe } from '../../shared/pipes/currency-format.pipe';
import { PredictiveRunwayComponent } from '../../shared/components/predictive-runway.component';
import { parseLocalDate } from '../../shared/utils/date.utils';
import { ToastService } from '../../core/services/toast.service';
import { ChatMessage, CategorySplitSuggestion } from '../../core/models';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

type PeriodType = 'monthly' | 'quarterly' | 'semi-annually' | 'yearly';
interface AutoInsight { icon: string; text: string; type: 'good' | 'warn' | 'info' | 'bad'; }
interface CategoryTrend { id: string; name: string; icon: string; color: string; current: number; previous: number; change: number; barPct: number; }

export interface SunburstSegment {
  id: string;
  name: string;
  value: number;
  type: 'income' | 'expense' | 'root';
  depth: number;
  startAngle: number;
  endAngle: number;
  path: string;
  color: string;
  icon: string;
  percentage: number;
  textX?: number;
  textY?: number;
  showText?: boolean;
}

interface HeatmapDay {
  date: string;
  dayOfWeek: number;
  amount: number;
  level: number;
  tooltip: string;
  isBuffer?: boolean;
}

@Component({
  selector: 'app-insights',
  standalone: true,
  imports: [CommonModule, FormsModule, HeaderComponent, CurrencyFormatPipe, PredictiveRunwayComponent],
  templateUrl: './insights.component.html',
  styleUrl: './insights.component.css'
})
export class InsightsComponent implements OnInit, AfterViewInit, OnDestroy {
  private txnService = inject(TransactionService);
  protected catService = inject(CategoryService);
  private accountService = inject(AccountService);
  private api = inject(ApiService);
  protected settingsService = inject(SettingsService);
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

  setYear(val: any) { this.selectedYear.set(Number(val)); }
  setMonth(val: any) { this.selectedMonth.set(Number(val)); }
  setQuarter(val: any) { this.selectedQuarter.set(Number(val)); }
  setHalf(val: any) { this.selectedHalf.set(Number(val)); }



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
    const txns = this.txnService.postedNormalizedTransactions();
    const { startDate, endDate } = this.periodBoundaries();
    return txns.filter(t => t.date >= startDate && t.date <= endDate);
  });

  // Filtered transactions for the previous period
  previousPeriodTransactions = computed(() => {
    const txns = this.txnService.postedNormalizedTransactions();
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

  private toast = inject(ToastService);
  splitSuggestions = signal<CategorySplitSuggestion[]>([]);
  splittingId = signal<string | null>(null);

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
    this.accountService.loadAccounts().subscribe();
    this.loadSplitSuggestions();
  }

  loadSplitSuggestions() {
    this.api.getCategorySplitSuggestions().subscribe({
      next: res => {
        if (res.success && Array.isArray(res.data)) {
          this.splitSuggestions.set(res.data);
        }
      }
    });
  }

  executeSplit(sug: CategorySplitSuggestion) {
    this.splittingId.set(sug.id);
    this.catService.executeCategorySplit(sug.parentCategoryId, [
      {
        name: sug.suggestedName,
        icon: sug.suggestedIcon,
        color: sug.suggestedColor,
        transactionIds: sug.transactionIds
      }
    ]).subscribe({
      next: (res: any) => {
        this.splittingId.set(null);
        if (res && res.success) {
          this.toast.success(`Created subcategory '${sug.suggestedName}' and reassigned ${sug.affectedCount} transaction(s)!`);
          this.txnService.loadTransactions().subscribe();
          this.loadSplitSuggestions();
        } else {
          this.toast.error(res?.error || 'Failed to split category');
        }
      },
      error: () => {
        this.splittingId.set(null);
        this.toast.error('Error executing category split');
      }
    });
  }

  // ── Sankey Cashflow Flowchart computed data ──
  // ── Sunburst Cashflow Chart computed data ──
  getSunburstData = computed(() => {
    const txns = this.currentPeriodTransactions().filter(t => t.type !== 'transfer');
    if (txns.length === 0) {
      return { segments: [], netBalance: 0, savingsRate: 0, totalIncome: 0, totalExpenses: 0, topIncomeKeys: new Set<string>(), topExpenseKeys: new Set<string>() };
    }

    const totalIncome = txns.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const totalExpenses = txns.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const netBalance = totalIncome - totalExpenses;
    const savingsRate = totalIncome > 0 ? Math.max(0, Math.round((netBalance / totalIncome) * 100)) : 0;

    // Group income by category
    const rawIncomeByCat: Record<string, number> = {};
    txns.filter(t => t.type === 'income').forEach(t => {
      rawIncomeByCat[t.category] = (rawIncomeByCat[t.category] || 0) + t.amount;
    });

    const sortedIncomeKeys = Object.keys(rawIncomeByCat).sort((a, b) => rawIncomeByCat[b] - rawIncomeByCat[a]);
    const topIncomeKeys = new Set(sortedIncomeKeys.slice(0, 3));

    const incomeByCat: Array<{ id: string; name: string; value: number; color: string; icon: string }> = [];
    let otherIncomeVal = 0;

    Object.entries(rawIncomeByCat).forEach(([catId, val]) => {
      if (val <= 0) return;
      if (topIncomeKeys.has(catId)) {
        const cat = this.catService.getCategoryById(catId);
        incomeByCat.push({
          id: catId,
          name: cat?.name ?? catId,
          value: val,
          color: cat?.color ?? 'var(--accent-green)',
          icon: cat?.icon ?? '📈'
        });
      } else {
        otherIncomeVal += val;
      }
    });

    if (otherIncomeVal > 0) {
      incomeByCat.push({
        id: 'other_income',
        name: 'Other Income',
        value: otherIncomeVal,
        color: '#81c784',
        icon: '📦'
      });
    }
    incomeByCat.sort((a, b) => b.value - a.value);

    // Group expenses by category
    const rawExpenseByCat: Record<string, number> = {};
    txns.filter(t => t.type === 'expense').forEach(t => {
      rawExpenseByCat[t.category] = (rawExpenseByCat[t.category] || 0) + t.amount;
    });

    const sortedExpenseKeys = Object.keys(rawExpenseByCat).sort((a, b) => rawExpenseByCat[b] - rawExpenseByCat[a]);
    const topExpenseKeys = new Set(sortedExpenseKeys.slice(0, 5));

    const expenseByCat: Array<{ id: string; name: string; value: number; color: string; icon: string }> = [];
    let otherExpenseVal = 0;

    Object.entries(rawExpenseByCat).forEach(([catId, val]) => {
      if (val <= 0) return;
      if (topExpenseKeys.has(catId)) {
        const cat = this.catService.getCategoryById(catId);
        expenseByCat.push({
          id: catId,
          name: cat?.name ?? catId,
          value: val,
          color: cat?.color ?? 'var(--accent-red)',
          icon: cat?.icon ?? '💸'
        });
      } else {
        otherExpenseVal += val;
      }
    });

    if (otherExpenseVal > 0) {
      expenseByCat.push({
        id: 'other_expense',
        name: 'Other Expenses',
        value: otherExpenseVal,
        color: '#90a4ae',
        icon: '📦'
      });
    }
    expenseByCat.sort((a, b) => b.value - a.value);

    // Coordinate & Trigonometry Helpers
    const cx = 250;
    const cy = 250;
    const r1 = 75;
    const r2 = 125;
    const r3 = 130;
    const r4 = 210;

    const describeArcSegment = (x: number, y: number, rIn: number, rOut: number, startAngle: number, endAngle: number): string => {
      const sin0 = Math.sin(startAngle);
      const cos0 = Math.cos(startAngle);
      const sin1 = Math.sin(endAngle);
      const cos1 = Math.cos(endAngle);

      const xIn0 = x + rIn * cos0;
      const yIn0 = y + rIn * sin0;
      const xOut0 = x + rOut * cos0;
      const yOut0 = y + rOut * sin0;

      const xIn1 = x + rIn * cos1;
      const yIn1 = y + rIn * sin1;
      const xOut1 = x + rOut * cos1;
      const yOut1 = y + rOut * sin1;

      const largeArcFlag = (endAngle - startAngle) > Math.PI ? 1 : 0;

      return `M ${xIn0} ${yIn0} L ${xOut0} ${yOut0} A ${rOut} ${rOut} 0 ${largeArcFlag} 1 ${xOut1} ${yOut1} L ${xIn1} ${yIn1} A ${rIn} ${rIn} 0 ${largeArcFlag} 0 ${xIn0} ${yIn0} Z`;
    };

    const describeArc = (x: number, y: number, rIn: number, rOut: number, startAngle: number, endAngle: number): string => {
      const PI2 = Math.PI * 2;
      const diff = endAngle - startAngle;
      if (diff >= PI2 - 0.0001) {
        const halfAngle = startAngle + Math.PI;
        const path1 = describeArcSegment(x, y, rIn, rOut, startAngle, halfAngle);
        const path2 = describeArcSegment(x, y, rIn, rOut, halfAngle, endAngle);
        return `${path1} ${path2}`;
      }
      return describeArcSegment(x, y, rIn, rOut, startAngle, endAngle);
    };

    const V = Math.max(totalIncome, totalExpenses);
    if (V <= 0) {
      return { segments: [], netBalance, savingsRate, totalIncome, totalExpenses, topIncomeKeys: new Set<string>(), topExpenseKeys: new Set<string>() };
    }

    const segments: SunburstSegment[] = [];

    // ── RIGHT HALF: Inflow (Income / Deficit) ──
    const inflowAngleStart = -Math.PI / 2;
    const inflowAngleEnd = Math.PI / 2;
    const inflowPath = describeArc(cx, cy, r1, r2, inflowAngleStart, inflowAngleEnd);
    
    // Inflow Inner Segment
    segments.push({
      id: 'inflow_root',
      name: 'Total Income',
      value: totalIncome,
      type: 'income',
      depth: 1,
      startAngle: inflowAngleStart,
      endAngle: inflowAngleEnd,
      path: inflowPath,
      color: 'var(--accent-blue)',
      icon: '📈',
      percentage: 100
    });

    // Inflow Outer Categories
    let currentInflowAngle = inflowAngleStart;
    incomeByCat.forEach(item => {
      const span = (item.value / V) * Math.PI;
      const endAngle = currentInflowAngle + span;
      const path = describeArc(cx, cy, r3, r4, currentInflowAngle, endAngle);
      const angleMid = (currentInflowAngle + endAngle) / 2;
      
      segments.push({
        id: `in_cat_${item.id}`,
        name: item.name,
        value: item.value,
        type: 'income',
        depth: 2,
        startAngle: currentInflowAngle,
        endAngle: endAngle,
        path: path,
        color: item.color,
        icon: item.icon,
        percentage: totalIncome > 0 ? Math.round((item.value / totalIncome) * 100) : 0,
        textX: cx + ((r3 + r4) / 2) * Math.cos(angleMid),
        textY: cy + ((r3 + r4) / 2) * Math.sin(angleMid),
        showText: (endAngle - currentInflowAngle) > 0.18
      });
      currentInflowAngle = endAngle;
    });

    // Deficit Outer Segment (fills remaining Right Half if expenses exceed income)
    const deficit = V - totalIncome;
    if (deficit > 0) {
      const path = describeArc(cx, cy, r3, r4, currentInflowAngle, inflowAngleEnd);
      const angleMid = (currentInflowAngle + inflowAngleEnd) / 2;
      segments.push({
        id: 'deficit',
        name: 'Deficit / Debt',
        value: deficit,
        type: 'income',
        depth: 2,
        startAngle: currentInflowAngle,
        endAngle: inflowAngleEnd,
        path: path,
        color: 'var(--accent-red)',
        icon: '⚠️',
        percentage: Math.round((deficit / V) * 100),
        textX: cx + ((r3 + r4) / 2) * Math.cos(angleMid),
        textY: cy + ((r3 + r4) / 2) * Math.sin(angleMid),
        showText: (inflowAngleEnd - currentInflowAngle) > 0.18
      });
    }

    // ── LEFT HALF: Outflow (Expenses / Savings) ──
    const outflowAngleStart = Math.PI / 2;
    const outflowAngleEnd = 1.5 * Math.PI;
    const outflowPath = describeArc(cx, cy, r1, r2, outflowAngleStart, outflowAngleEnd);

    // Outflow Inner Segment
    segments.push({
      id: 'outflow_root',
      name: 'Total Expenses',
      value: totalExpenses,
      type: 'expense',
      depth: 1,
      startAngle: outflowAngleStart,
      endAngle: outflowAngleEnd,
      path: outflowPath,
      color: 'var(--accent-purple)',
      icon: '📉',
      percentage: 100
    });

    // Outflow Outer Categories
    let currentOutflowAngle = outflowAngleStart;
    expenseByCat.forEach(item => {
      const span = (item.value / V) * Math.PI;
      const endAngle = currentOutflowAngle + span;
      const path = describeArc(cx, cy, r3, r4, currentOutflowAngle, endAngle);
      const angleMid = (currentOutflowAngle + endAngle) / 2;

      segments.push({
        id: `out_cat_${item.id}`,
        name: item.name,
        value: item.value,
        type: 'expense',
        depth: 2,
        startAngle: currentOutflowAngle,
        endAngle: endAngle,
        path: path,
        color: item.color,
        icon: item.icon,
        percentage: totalExpenses > 0 ? Math.round((item.value / totalExpenses) * 100) : 0,
        textX: cx + ((r3 + r4) / 2) * Math.cos(angleMid),
        textY: cy + ((r3 + r4) / 2) * Math.sin(angleMid),
        showText: (endAngle - currentOutflowAngle) > 0.18
      });
      currentOutflowAngle = endAngle;
    });

    // Net Savings Outer Segment (fills remaining Left Half if income exceeds expenses)
    const savings = V - totalExpenses;
    if (savings > 0) {
      const path = describeArc(cx, cy, r3, r4, currentOutflowAngle, outflowAngleEnd);
      const angleMid = (currentOutflowAngle + outflowAngleEnd) / 2;
      segments.push({
        id: 'savings',
        name: 'Net Savings',
        value: savings,
        type: 'expense',
        depth: 2,
        startAngle: currentOutflowAngle,
        endAngle: outflowAngleEnd,
        path: path,
        color: 'var(--accent-green)',
        icon: '💰',
        percentage: Math.round((savings / totalIncome) * 100),
        textX: cx + ((r3 + r4) / 2) * Math.cos(angleMid),
        textY: cy + ((r3 + r4) / 2) * Math.sin(angleMid),
        showText: (outflowAngleEnd - currentOutflowAngle) > 0.18
      });
    }

    return { segments, netBalance, savingsRate, totalIncome, totalExpenses, topIncomeKeys, topExpenseKeys };
  });

  sunburstSegments = computed(() => this.getSunburstData().segments);
  incomeSegments = computed(() => this.sunburstSegments().filter(s => s.depth === 2 && s.type === 'income'));
  expenseSegments = computed(() => this.sunburstSegments().filter(s => s.depth === 2 && s.type === 'expense'));
  netBalance = computed(() => this.getSunburstData().netBalance);
  savingsRate = computed(() => this.getSunburstData().savingsRate);
  totalIncome = computed(() => this.getSunburstData().totalIncome);
  totalExpenses = computed(() => this.getSunburstData().totalExpenses);
  inflowRoot = computed(() => this.sunburstSegments().find(s => s.id === 'inflow_root') || null);
  outflowRoot = computed(() => this.sunburstSegments().find(s => s.id === 'outflow_root') || null);

  // Hover states for Sunburst Chart
  hoveredSegment = signal<SunburstSegment | null>(null);

  isSegmentHighlighted(segId: string): boolean {
    const hovered = this.hoveredSegment();
    if (!hovered) return true;
    if (hovered.id === segId) return true;
    
    // Highlight matching category or root segment relations
    if (hovered.depth === 1) {
      // Hovering Inner Root (Inflow/Outflow) -> highlight all child categories
      const seg = this.sunburstSegments().find(s => s.id === segId);
      return seg ? seg.type === hovered.type : false;
    } else {
      // Hovering Category -> highlight it and its parent root
      if (segId === 'inflow_root' && hovered.type === 'income') return true;
      if (segId === 'outflow_root' && hovered.type === 'expense') return true;
    }
    return false;
  }

  // Heatmap customization signals
  heatmapCategory = signal<string>('all');
  heatmapTheme = signal<string>('indigo');

  isMonthlyHeatmap = computed(() => this.periodType() === 'monthly');

  getDayNumber(dateStr: string): number {
    if (!dateStr || dateStr.startsWith('buffer')) return 0;
    const parts = dateStr.split('-');
    return parseInt(parts[2], 10);
  }

  // ── Heatmap computed data ──
  heatmapDays = computed(() => {
    const txns = this.txnService.postedTransactions();
    const selectedCat = this.heatmapCategory();
    const type = this.periodType();
    
    // Group expenses by date
    const spentByDate: Record<string, number> = {};
    txns.filter(t => 
      t.type === 'expense' && 
      (selectedCat === 'all' || t.category === selectedCat)
    ).forEach(t => {
      spentByDate[t.date] = (spentByDate[t.date] || 0) + t.amount;
    });

    const grid: HeatmapDay[] = [];

    if (type === 'monthly') {
      const year = this.selectedYear();
      const month = this.selectedMonth();
      
      const numDays = new Date(year, month + 1, 0).getDate();
      const firstDayIndex = new Date(year, month, 1).getDay(); // Sunday is 0

      // Prepend buffer days
      for (let i = 0; i < firstDayIndex; i++) {
        grid.push({
          date: `buffer-prev-${i}`,
          dayOfWeek: i,
          amount: 0,
          level: 0,
          tooltip: '',
          isBuffer: true
        });
      }

      // Add actual days of the month
      for (let dayNum = 1; dayNum <= numDays; dayNum++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
        const amount = spentByDate[dateStr] || 0;

        let level = 0;
        if (amount > 0) {
          if (amount <= 15) level = 1;
          else if (amount <= 50) level = 2;
          else if (amount <= 150) level = 3;
          else level = 4;
        }

        const d = new Date(year, month, dayNum);
        const dateFormatted = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const tooltip = `${dateFormatted}: $${amount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} spent`;

        grid.push({
          date: dateStr,
          dayOfWeek: d.getDay(),
          amount,
          level,
          tooltip
        });
      }

      // Append buffer days to complete the week
      let padIndex = 0;
      while (grid.length % 7 !== 0) {
        grid.push({
          date: `buffer-next-${padIndex}`,
          dayOfWeek: grid.length % 7,
          amount: 0,
          level: 0,
          tooltip: '',
          isBuffer: true
        });
        padIndex++;
      }
    } else {
      // Rolling year view (for Yearly, Quarterly, Semi-Annually)
      const today = new Date();
      const oneYearAgo = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
      const oneYearAgoStr = oneYearAgo.toLocaleDateString('en-CA');
      
      const startDayOffset = 364 + today.getDay();
      
      for (let i = 0; i < 371; i++) {
        const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (startDayOffset - i));
        
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;
        
        const isFuture = dateStr > today.toLocaleDateString('en-CA');
        const amount = isFuture ? 0 : (spentByDate[dateStr] || 0);

        let level = 0;
        if (amount > 0) {
          if (amount <= 15) level = 1;
          else if (amount <= 50) level = 2;
          else if (amount <= 150) level = 3;
          else level = 4;
        }

        const dateFormatted = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const tooltip = isFuture 
          ? 'Future'
          : `${dateFormatted}: $${amount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} spent`;

        grid.push({
          date: dateStr,
          dayOfWeek: d.getDay(),
          amount,
          level,
          tooltip
        });
      }
    }

    return grid;
  });

  // Month labels positioning based on column index Sunday dates
  heatmapMonths = computed(() => {
    if (this.isMonthlyHeatmap()) return []; // monthly calendar doesn't need column labels
    const days = this.heatmapDays();
    const labels: Array<{ name: string; col: number }> = [];
    let lastMonth = -1;

    for (let col = 0; col < 53; col++) {
      const idx = col * 7;
      if (idx < days.length) {
        const d = new Date(days[idx].date + 'T00:00:00');
        const m = d.getMonth();
        if (m !== lastMonth) {
          labels.push({ name: d.toLocaleDateString('en-US', { month: 'short' }), col });
          lastMonth = m;
        }
      }
    }
    return labels;
  });

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

  // Category Exploration signals
  selectedCategoryId = signal<string | null>(null);
  categoryTxns = signal<any[] | null>(null);
  categoryTxnsLoading = signal(false);
  categoryStats = signal<any | null>(null);

  selectCategory(categoryId: string) {
    let rawCategoryId = categoryId;
    if (categoryId.startsWith('in_cat_')) {
      rawCategoryId = categoryId.substring(7);
    } else if (categoryId.startsWith('out_cat_')) {
      rawCategoryId = categoryId.substring(8);
    }

    this.selectedCategoryId.set(rawCategoryId);
    this.categoryTxnsLoading.set(true);
    this.categoryTxns.set(null);
    this.categoryStats.set(null);

    const { startDate, endDate } = this.periodBoundaries();
    
    const isOtherIncome = rawCategoryId === 'other_income';
    const isOtherExpense = rawCategoryId === 'other_expense';
    
    const queryParams: any = {
      dateFrom: startDate,
      dateTo: endDate,
      limit: 'all'
    };
    if (!isOtherIncome && !isOtherExpense) {
      queryParams.category = rawCategoryId;
    }

    this.api.getTransactions(queryParams).subscribe({
      next: res => {
        this.categoryTxnsLoading.set(false);
        if (res.success && res.data) {
          let txns: any[] = Array.isArray(res.data) ? res.data : (res.data?.transactions ?? []);
          
          const sunburst = this.getSunburstData();
          if (isOtherIncome) {
            txns = txns.filter((t: any) => t.type === 'income' && !sunburst.topIncomeKeys.has(t.category));
          } else if (isOtherExpense) {
            txns = txns.filter((t: any) => t.type === 'expense' && !sunburst.topExpenseKeys.has(t.category));
          } else {
            const isIncomeCat = categoryId.startsWith('in_cat_') || this.incomeSegments().some(s => s.id === categoryId);
            txns = txns.filter((t: any) => t.category === rawCategoryId && t.type === (isIncomeCat ? 'income' : 'expense'));
          }

          // Normalize currency to primary currency
          const primaryCurrency = this.settingsService.currency();
          const rates = this.accountService.exchangeRates();
          const accounts = this.accountService.accounts();

          const normalizedTxns = txns.map((t: any) => {
            const acc = accounts.find(a => a.id === t.accountId);
            const accCurrency = acc?.currency || 'USD';
            if (accCurrency.toUpperCase() !== primaryCurrency.toUpperCase() && Object.keys(rates).length > 0) {
              const fromRate = rates[accCurrency.toUpperCase()] || 1.0;
              const toRate = rates[primaryCurrency.toUpperCase()] || 1.0;
              const convertedAmount = (t.amount / fromRate) * toRate;
              return { ...t, amount: parseFloat(convertedAmount.toFixed(2)) };
            }
            return t;
          });

          this.categoryTxns.set(normalizedTxns);

          if (normalizedTxns.length > 0) {
            const total = normalizedTxns.reduce((sum: number, t: any) => sum + t.amount, 0);
            const count = normalizedTxns.length;
            const avg = total / count;
            const peak = Math.max(...normalizedTxns.map((t: any) => t.amount));
            const peakTxn = normalizedTxns.find((t: any) => t.amount === peak);

            this.categoryStats.set({
              total,
              count,
              avg,
              peak,
              peakDate: peakTxn ? peakTxn.date : ''
            });
          }
        }
      },
      error: () => {
        this.categoryTxnsLoading.set(false);
      }
    });
  }

  closeCategoryExploration() {
    this.selectedCategoryId.set(null);
    this.categoryTxns.set(null);
    this.categoryStats.set(null);
  }

  getCategoryIcon(id: string) {
    if (id === 'other_income') return '📦';
    if (id === 'other_expense') return '📦';
    return this.catService.getCategoryIcon(id);
  }

  getCategoryColor(id: string) {
    if (id === 'other_income') return '#81c784';
    if (id === 'other_expense') return '#90a4ae';
    return this.catService.getCategoryColor(id);
  }

  getCategoryName(id: string) {
    if (id === 'other_income') return 'Other Income';
    if (id === 'other_expense') return 'Other Expenses';
    return this.catService.getCategoryById(id)?.name ?? id;
  }

  getAccountName(id: string) {
    const acc = this.accountService.accounts().find(a => a.id === id);
    return acc ? acc.name : id;
  }
}

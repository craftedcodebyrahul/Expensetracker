import { Component, OnInit, OnDestroy, AfterViewInit, inject, signal, computed, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Chart, registerables } from 'chart.js';
import { AccountService } from '../../core/services/account.service';
import { ApiService } from '../../core/services/api.service';
import { TransactionService } from '../../core/services/transaction.service';
import { BudgetService } from '../../core/services/budget.service';
import { CategoryService } from '../../core/services/category.service';
import { SettingsService } from '../../core/services/settings.service';

Chart.register(...registerables);

interface OppCard {
  id: string;
  title: string;
  description: string;
  savings: number;
  difficulty: 'Easy' | 'Medium' | 'Hard';
}

interface WrongAdvice {
  type: string;
  text: string;
  severity: 'high' | 'medium';
}

@Component({
  selector: 'app-savings-simulator',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './savings-simulator.component.html',
  styleUrl: './savings-simulator.component.css'
})
export class SavingsSimulatorComponent implements OnInit, OnDestroy, AfterViewInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  protected accountService = inject(AccountService);
  private api = inject(ApiService);
  private txnService = inject(TransactionService);
  private budgetService = inject(BudgetService);
  protected catService = inject(CategoryService);
  private settingsService = inject(SettingsService);

  @ViewChild('projectionChart') projectionCanvas!: ElementRef<HTMLCanvasElement>;
  private chartInstance: Chart | null = null;

  // Simulator State Signals
  timelineMonths = signal<12 | 36 | 60 | 120>(60);
  simAssetReallocateStocks = signal<number>(0); // cash to stocks lump sum
  simAssetReallocateDebt = signal<number>(0);   // cash to debt lump sum
  simExpectedYield = signal<number>(8);         // annual return yield
  simBudgetCutPct = signal<number>(0);         // cut discretionary spend %
  checkedOppIds = signal<Set<string>>(new Set());

  // AI Audit State
  loadingAi = signal<boolean>(false);
  aiLoaded = signal<boolean>(false);
  aiDiagnosticsObj = signal<{ wrong: WrongAdvice[]; opportunities: OppCard[]; todo: string[] } | null>(null);

  // Dynamic calculated stats
  avgIncome = signal<number>(0);
  avgExpense = signal<number>(0);
  avgDiscretionary = signal<number>(0);

  currencySymbol = computed(() => this.settingsService.currencySymbol());

  // Baseline Assets
  cashAssets = computed(() => {
    const accs = this.accountService.accounts();
    const balances = this.accountService.accountBalances();
    const rates = this.accountService.exchangeRates();
    const primaryCurrency = this.settingsService.currency() || 'USD';
    let cash = 0;
    accs.forEach(a => {
      if (a.type === 'asset' && !a.isInvestment) {
        const bal = balances[a.id] || 0;
        const accCurrency = a.currency || 'USD';
        let converted = bal;
        if (accCurrency.toUpperCase() !== primaryCurrency.toUpperCase() && Object.keys(rates).length > 0) {
          const fromRate = rates[accCurrency.toUpperCase()] || 1.0;
          const toRate = rates[primaryCurrency.toUpperCase()] || 1.0;
          converted = (bal / fromRate) * toRate;
        }
        cash += converted;
      }
    });
    return Math.max(0, cash);
  });

  stockAssets = computed(() => {
    const accs = this.accountService.accounts();
    const balances = this.accountService.accountBalances();
    const rates = this.accountService.exchangeRates();
    const primaryCurrency = this.settingsService.currency() || 'USD';
    let stocks = 0;
    accs.forEach(a => {
      if (a.type === 'asset' && a.isInvestment) {
        const bal = balances[a.id] || 0;
        const accCurrency = a.currency || 'USD';
        let converted = bal;
        if (accCurrency.toUpperCase() !== primaryCurrency.toUpperCase() && Object.keys(rates).length > 0) {
          const fromRate = rates[accCurrency.toUpperCase()] || 1.0;
          const toRate = rates[primaryCurrency.toUpperCase()] || 1.0;
          converted = (bal / fromRate) * toRate;
        }
        stocks += converted;
      }
    });
    return Math.max(0, stocks);
  });

  liabilities = computed(() => {
    const accs = this.accountService.accounts();
    const balances = this.accountService.accountBalances();
    const rates = this.accountService.exchangeRates();
    const primaryCurrency = this.settingsService.currency() || 'USD';
    let debt = 0;
    accs.forEach(a => {
      if (a.type === 'liability') {
        const bal = balances[a.id] || 0;
        const accCurrency = a.currency || 'USD';
        let converted = bal;
        if (accCurrency.toUpperCase() !== primaryCurrency.toUpperCase() && Object.keys(rates).length > 0) {
          const fromRate = rates[accCurrency.toUpperCase()] || 1.0;
          const toRate = rates[primaryCurrency.toUpperCase()] || 1.0;
          converted = (bal / fromRate) * toRate;
        }
        debt += converted;
      }
    });
    return Math.max(0, debt);
  });

  netWorth = computed(() => {
    return this.cashAssets() + this.stockAssets() - this.liabilities();
  });

  // Maximum slider allocations based on cash
  maxReallocate = computed(() => {
    return Math.max(0, this.cashAssets());
  });

  ngOnInit() {
    this.accountService.loadAccounts().subscribe();
    this.computeLocalAverages();
    this.budgetService.loadBudgets().subscribe();
    this.catService.loadCategories().subscribe();

    this.route.queryParams.subscribe(params => {
      const goalId = params['goalId'];
      if (goalId) {
        this.runAiDiagnostics();
      }
    });
  }

  ngAfterViewInit() {
    setTimeout(() => {
      this.recalcAll();
    }, 100);
  }

  ngOnDestroy() {
    if (this.chartInstance) {
      this.chartInstance.destroy();
    }
  }

  computeLocalAverages() {
    this.api.getDashboardStats().subscribe(res => {
      if (res.success && res.data) {
        const inc = res.data.currentMonthSummary?.totalIncome || 0;
        const exp = res.data.currentMonthSummary?.totalExpenses || 0;
        this.avgIncome.set(inc);
        this.avgExpense.set(exp);
        this.avgDiscretionary.set(Math.round(exp * 0.4));
        this.recalcAll();
      }
    });
  }

  // Checked opportunities total savings
  opportunitiesSavings = computed(() => {
    const obj = this.aiDiagnosticsObj();
    if (!obj || !obj.opportunities) return 0;
    let sum = 0;
    obj.opportunities.forEach(o => {
      if (this.checkedOppIds().has(o.id)) {
        sum += o.savings;
      }
    });
    return sum;
  });

  // Simulated savings rate
  simulatedSavings = computed(() => {
    const baseSavings = this.avgIncome() - this.avgExpense();
    const cuts = this.avgDiscretionary() * (this.simBudgetCutPct() / 100);
    const opps = this.opportunitiesSavings();
    return Math.max(0, baseSavings + cuts + opps);
  });

  // Compounding math variables
  simulatedCash = signal<number>(0);
  simulatedStocks = signal<number>(0);
  simulatedDebt = signal<number>(0);
  simulatedNetWorth = signal<number>(0);
  fScore = signal<number>(0);
  strokeDashoffset = signal<number>(314.16);
  dialColor = signal<string>('#6366f1');

  onTimelineChange(months: 12 | 36 | 60 | 120) {
    this.timelineMonths.set(months);
    this.recalcAll();
  }

  onSliderChange() {
    // Ensure lump sum sliders don't exceed total cash
    const totalCash = this.cashAssets();
    let reStocks = this.simAssetReallocateStocks();
    let reDebt = this.simAssetReallocateDebt();

    if (reStocks + reDebt > totalCash) {
      // Scale down or cap
      if (reStocks > totalCash) {
        reStocks = totalCash;
        reDebt = 0;
      } else {
        reDebt = totalCash - reStocks;
      }
      this.simAssetReallocateStocks.set(reStocks);
      this.simAssetReallocateDebt.set(reDebt);
    }

    this.recalcAll();
  }

  onOppCheck(oppId: string, event: Event) {
    const isChecked = (event.target as HTMLInputElement).checked;
    this.checkedOppIds.update(set => {
      const newSet = new Set(set);
      if (isChecked) newSet.add(oppId);
      else newSet.delete(oppId);
      return newSet;
    });
    this.recalcAll();
  }

  recalcAll() {
    const months = this.timelineMonths();
    const yieldRate = this.simExpectedYield() / 100;
    const reStocks = this.simAssetReallocateStocks();
    const reDebt = this.simAssetReallocateDebt();

    // Adjusted baselines
    let currentCash = Math.max(0, this.cashAssets() - reStocks - reDebt);
    let currentStocks = this.stockAssets() + reStocks;
    let currentDebt = Math.max(0, this.liabilities() - reDebt);
    const monthlySavings = this.simulatedSavings();

    const labels: string[] = ['Today'];
    const projectionData: number[] = [currentCash + currentStocks - currentDebt];
    const cashData: number[] = [currentCash];
    const stocksData: number[] = [currentStocks];
    const debtData: number[] = [currentDebt];

    // Projection Loop
    for (let m = 1; m <= months; m++) {
      let activeSavings = monthlySavings;

      // Pay off debt first
      if (currentDebt > 0) {
        const debtPayment = Math.min(currentDebt, activeSavings);
        currentDebt -= debtPayment;
        activeSavings -= debtPayment;
      }

      // Compound stocks with remaining savings
      currentStocks = currentStocks * (1 + yieldRate / 12) + activeSavings;
      // Cash remains stable as runway
      // Net worth
      const netWorth = currentCash + currentStocks - currentDebt;

      // Add to array for chart
      if (months <= 36 || m % 3 === 0 || m === months) {
        labels.push(`Month ${m}`);
        projectionData.push(Math.round(netWorth));
        cashData.push(Math.round(currentCash));
        stocksData.push(Math.round(currentStocks));
        debtData.push(Math.round(currentDebt));
      }
    }

    // Set end values
    this.simulatedCash.set(Math.round(currentCash));
    this.simulatedStocks.set(Math.round(currentStocks));
    this.simulatedDebt.set(Math.round(currentDebt));
    this.simulatedNetWorth.set(Math.round(currentCash + currentStocks - currentDebt));

    // Calculate F-Score
    this.calculateFScore(monthlySavings, currentCash, currentStocks, currentDebt);

    // Update Chart.js
    this.updateChart(labels, projectionData, cashData, stocksData, debtData);
  }

  calculateFScore(monthlySavings: number, cash: number, stocks: number, debt: number) {
    // 1. Savings Rate Score (30 pts max)
    // Savings Rate (SR) = Net Savings / Income
    const income = this.avgIncome() || 1;
    const sr = monthlySavings / income;
    let srScore = 0;
    if (sr >= 0.20) srScore = 30;
    else if (sr > 0) srScore = sr * 150;

    // 2. Emergency Fund Score (30 pts max)
    // Runway = Cash / Monthly Expense
    const expenses = this.avgExpense() || 1;
    const runway = cash / expenses;
    let runwayScore = 0;
    if (runway >= 6) runwayScore = 30;
    else if (runway > 0) runwayScore = runway * 5;

    // 3. Asset Allocation Score (20 pts max)
    // Stock Ratio = Stocks / Net Worth
    const nw = cash + stocks - debt;
    const str = nw > 0 ? stocks / nw : 0;
    let assetScore = 0;
    if (str >= 0.40 && str <= 0.80) assetScore = 20;
    else if (str < 0.40 && str > 0) assetScore = (str / 0.40) * 20;
    else if (str > 0.80) assetScore = 10; // high volatility scale down

    // 4. Debt Ratio Score (20 pts max)
    // Debt Ratio = Debt / (Cash + Stocks)
    const assets = cash + stocks;
    const dr = assets > 0 ? debt / assets : 0;
    let debtScore = 0;
    if (dr <= 0.10) debtScore = 20;
    else if (dr >= 1.00) debtScore = 0;
    else debtScore = 20 - 20 * ((dr - 0.10) / 0.90);

    const totalScore = Math.max(0, Math.min(100, Math.round(srScore + runwayScore + assetScore + debtScore)));
    this.fScore.set(totalScore);

    // Radial SVG Math
    // Stroke circumference is 314.16
    const offset = 314.16 - (totalScore / 100) * 314.16;
    this.strokeDashoffset.set(offset);

    // Dial Colors
    if (totalScore >= 80) this.dialColor.set('#10b981'); // Emerald
    else if (totalScore >= 60) this.dialColor.set('#6366f1'); // Indigo
    else if (totalScore >= 40) this.dialColor.set('#f59e0b'); // Amber
    else this.dialColor.set('#ef4444'); // Red
  }

  updateChart(labels: string[], netWorth: number[], cash: number[], stocks: number[], debt: number[]) {
    if (!this.projectionCanvas?.nativeElement) return;

    if (this.chartInstance) {
      this.chartInstance.destroy();
    }

    this.chartInstance = new Chart(this.projectionCanvas.nativeElement, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Net Worth',
            data: netWorth,
            borderColor: '#6366f1',
            backgroundColor: 'rgba(99, 102, 241, 0.05)',
            tension: 0.35,
            fill: true,
            borderWidth: 3,
            pointRadius: 2
          },
          {
            label: 'Cash runway',
            data: cash,
            borderColor: '#34d399',
            borderWidth: 1.5,
            borderDash: [5, 5],
            pointRadius: 0,
            fill: false
          },
          {
            label: 'Investments',
            data: stocks,
            borderColor: '#60a5fa',
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false
          },
          {
            label: 'Liabilities',
            data: debt,
            borderColor: '#f87171',
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { color: '#94a3b8', font: { size: 11, family: 'Inter' } }
          },
          tooltip: {
            backgroundColor: '#1e293b',
            titleColor: '#f8fafc',
            bodyColor: '#cbd5e1',
            borderColor: '#475569',
            borderWidth: 1,
            callbacks: {
              label: (ctx: any) => ` ${ctx.dataset.label}: $${ctx.parsed.y?.toLocaleString()}`
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(51, 65, 85, 0.2)' },
            ticks: { color: '#94a3b8', font: { size: 10 } }
          },
          y: {
            grid: { color: 'rgba(51, 65, 85, 0.2)' },
            ticks: {
              color: '#94a3b8',
              font: { size: 10 },
              callback: (v: any) => '$' + Number(v).toLocaleString()
            }
          }
        }
      }
    });
  }

  runAiDiagnostics() {
    this.loadingAi.set(true);
    this.api.auditComprehensive().subscribe({
      next: (res) => {
        this.loadingAi.set(false);
        if (res.success && res.data) {
          this.aiDiagnosticsObj.set(res.data);
          this.aiLoaded.set(true);
          // Auto-select timeline to 60 months
          this.timelineMonths.set(60);
          this.recalcAll();
        }
      },
      error: () => {
        this.loadingAi.set(false);
      }
    });
  }

  printReport() {
    window.print();
  }

  backToGoals() {
    this.router.navigate(['/goals']);
  }
}

import { Component, inject, signal, computed, OnInit, ElementRef, ViewChild, AfterViewInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart } from 'chart.js';
import { AccountService } from '../../core/services/account.service';
import { TransactionService } from '../../core/services/transaction.service';
import { SettingsService } from '../../core/services/settings.service';
import { ApiService } from '../../core/services/api.service';
import { CurrencyFormatPipe } from '../../shared/pipes/currency-format.pipe';

function getOccurrencesIn90Days(schedule: any, today: Date): string[] {
  const occurrences: string[] = [];
  let current = new Date(schedule.nextDueDate + 'T00:00:00');
  const ninetyDaysFromNow = new Date();
  ninetyDaysFromNow.setDate(today.getDate() + 90);
  
  // Safety counter to prevent infinite loops
  let safety = 0;
  while (current <= ninetyDaysFromNow && safety < 100) {
    safety++;
    occurrences.push(current.toISOString().split('T')[0]);
    if (schedule.frequency === 'daily') {
      current.setDate(current.getDate() + 1);
    } else if (schedule.frequency === 'weekly') {
      current.setDate(current.getDate() + 7);
    } else if (schedule.frequency === 'monthly') {
      current.setMonth(current.getMonth() + 1);
    } else if (schedule.frequency === 'yearly') {
      current.setFullYear(current.getFullYear() + 1);
    } else {
      break;
    }
  }
  return occurrences;
}

@Component({
  selector: 'app-predictive-runway',
  standalone: true,
  imports: [CommonModule, CurrencyFormatPipe],
  template: `
    <div class="card runway-card">
      <div class="card-header">
        <div>
          <span class="card-title">🔮 Predictive Cashflow & Runway</span>
          <span class="card-hint">90-day future net worth forecast based on past daily cashflow and active schedules</span>
        </div>
      </div>
      <div class="runway-stats" *ngIf="projectedMetrics()">
        <div class="r-stat">
          <span class="r-label">Starting Net Worth</span>
          <span class="r-val">{{ projectedMetrics()!.startBalance | currencyFormat }}</span>
        </div>
        <div class="r-stat">
          <span class="r-label">Average Daily Net</span>
          <span class="r-val" [class.text-income]="projectedMetrics()!.dailyAverageNet >= 0" [class.text-expense]="projectedMetrics()!.dailyAverageNet < 0">
            {{ projectedMetrics()!.dailyAverageNet >= 0 ? '+' : '' }}{{ projectedMetrics()!.dailyAverageNet | currencyFormat }}
          </span>
        </div>
        <div class="r-stat">
          <span class="r-label">Projected 90-Day End</span>
          <span class="r-val" [class.text-income]="projectedMetrics()!.endBalance >= 0" [class.text-expense]="projectedMetrics()!.endBalance < 0">
            {{ projectedMetrics()!.endBalance | currencyFormat }}
          </span>
        </div>
      </div>
      <div class="chart-container">
        <canvas #chartRef></canvas>
      </div>
    </div>
  `,
  styles: [`
    .runway-card {
      margin-top: 1.5rem;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 1.25rem;
    }
    .runway-stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1rem;
      margin: 1rem 0 1.25rem 0;
      padding-bottom: 1rem;
      border-bottom: 1px solid var(--border);
    }
    .r-stat {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .r-label {
      font-size: 0.7rem;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .r-val {
      font-size: 1.15rem;
      font-weight: 700;
      color: var(--text-primary);
    }
    .chart-container {
      position: relative;
      height: 260px;
      width: 100%;
    }
    @media (max-width: 600px) {
      .runway-stats {
        grid-template-columns: 1fr;
        gap: 0.75rem;
      }
    }
  `]
})
export class PredictiveRunwayComponent implements OnInit, AfterViewInit {
  private accountService = inject(AccountService);
  private txnService = inject(TransactionService);
  private settingsService = inject(SettingsService);
  private api = inject(ApiService);

  @ViewChild('chartRef') private canvasRef!: ElementRef<HTMLCanvasElement>;
  private chartInstance: Chart | null = null;

  projectedMetrics = signal<{ startBalance: number; dailyAverageNet: number; endBalance: number } | null>(null);

  // Re-run projection computed when base signals change
  private triggerEffect = computed(() => {
    return {
      txns: this.txnService.postedNormalizedTransactions(),
      balances: this.accountService.accountBalances(),
      accounts: this.accountService.accounts()
    };
  });

  ngOnInit() {
    this.accountService.loadAccounts().subscribe();
  }

  ngAfterViewInit() {
    // Recalculate and render whenever accounts or transactions change
    effect(() => {
      this.triggerEffect();
      this.calculateAndRenderRunway();
    });
  }

  private calculateAndRenderRunway() {
    const accounts = this.accountService.accounts();
    const balances = this.accountService.accountBalances();
    const rates = this.accountService.exchangeRates();
    const primaryCurrency = this.settingsService.currency();

    if (accounts.length === 0) return;

    // 1. Calculate Net Worth
    let startBalance = 0;
    accounts.forEach(a => {
      const bal = balances[a.id] || 0;
      const accCurrency = a.currency || 'USD';
      let converted = bal;
      if (accCurrency.toUpperCase() !== primaryCurrency.toUpperCase() && Object.keys(rates).length > 0) {
        const fromRate = rates[accCurrency.toUpperCase()] || 1.0;
        const toRate = rates[primaryCurrency.toUpperCase()] || 1.0;
        converted = (bal / fromRate) * toRate;
      }
      if (a.type === 'asset') {
        startBalance += converted;
      } else if (a.type === 'liability') {
        startBalance -= converted;
      }
    });

    // 2. Calculate average daily cashflow over last 90 days
    const txns = this.txnService.postedNormalizedTransactions();
    const today = new Date();
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(today.getDate() - 90);
    const limitStr = ninetyDaysAgo.toISOString().split('T')[0];

    const recent = txns.filter(t => t.date >= limitStr);
    const income = recent.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = recent.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const netCashflow = income - expense;
    const dailyAverageNet = netCashflow / 90;

    // 3. Load schedules and map projection
    this.api.getRecurringSchedules().subscribe(res => {
      const schedules = res.success ? (res.data || []) : [];
      const labels: string[] = [];
      const dataPoints: number[] = [];
      
      let currentBalance = startBalance;
      
      for (let i = 0; i <= 90; i++) {
        const projectionDate = new Date();
        projectionDate.setDate(today.getDate() + i);
        const dateStr = projectionDate.toISOString().split('T')[0];
        
        if (i > 0) {
          currentBalance += dailyAverageNet;
        }
        
        schedules.forEach(s => {
          const occurrences = getOccurrencesIn90Days(s, today);
          if (occurrences.includes(dateStr)) {
              let amt = s.amount;
              const acc = accounts.find(a => a.id === s.accountId);
              const accCurrency = acc?.currency || 'USD';
              if (accCurrency.toUpperCase() !== primaryCurrency.toUpperCase() && Object.keys(rates).length > 0) {
                const fromRate = rates[accCurrency.toUpperCase()] || 1.0;
                const toRate = rates[primaryCurrency.toUpperCase()] || 1.0;
                amt = (amt / fromRate) * toRate;
              }
              
              if (s.type === 'income') {
                currentBalance += amt;
              } else if (s.type === 'expense') {
                currentBalance -= amt;
              }
            }
        });
        
        // Save daily points, but only label every 10 days
        labels.push(projectionDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        dataPoints.push(parseFloat(currentBalance.toFixed(2)));
      }

      this.projectedMetrics.set({
        startBalance,
        dailyAverageNet,
        endBalance: currentBalance
      });

      this.renderChart(labels, dataPoints);
    });
  }

  private renderChart(labels: string[], dataPoints: number[]) {
    if (!this.canvasRef?.nativeElement) return;

    if (this.chartInstance) {
      this.chartInstance.destroy();
    }

    const ctx = this.canvasRef.nativeElement.getContext('2d');
    if (!ctx) return;

    // Filter labels to show every 15 days for clean design
    const everyNLabels = labels.map((l, idx) => (idx % 15 === 0 || idx === labels.length - 1 ? l : ''));

    this.chartInstance = new Chart(this.canvasRef.nativeElement, {
      type: 'line',
      data: {
        labels: everyNLabels,
        datasets: [{
          label: 'Projected Net Worth',
          data: dataPoints,
          borderColor: '#5c6bc0',
          backgroundColor: 'rgba(92, 107, 192, 0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (tooltipItems) => {
                const idx = tooltipItems[0].dataIndex;
                return labels[idx];
              },
              label: (ctx) => ` Projected Balance: $${ctx.parsed.y?.toLocaleString() ?? 0}`
            }
          }
        },
        scales: {
          x: {
            ticks: { color: '#9fa8da', font: { size: 10 } },
            grid: { display: false }
          },
          y: {
            ticks: { 
              color: '#9fa8da', 
              font: { size: 10 },
              callback: (v) => '$' + Number(v).toLocaleString()
            },
            grid: { color: 'rgba(46,50,80,0.4)' }
          }
        }
      }
    });
  }
}

import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AccountService } from '../../core/services/account.service';
import { HeaderComponent } from '../../layout/header.component';
import { CurrencyFormatPipe } from '../../shared/pipes/currency-format.pipe';
import { TransactionFormComponent } from '../transactions/transaction-form.component';

@Component({
  selector: 'app-debt-planner',
  standalone: true,
  imports: [CommonModule, FormsModule, HeaderComponent, CurrencyFormatPipe, TransactionFormComponent],
  template: `
    <app-header title="Debt Payoff Planner" subtitle="Optimize interest savings and accelerate your path to debt freedom">
      <button class="btn btn-primary btn-sm" (click)="openPaymentModal()">💳 Log Debt Payment</button>
    </app-header>

    <div class="debt-planner-container">

      <!-- Loading State -->
      @if (loading()) {
        <div class="loading-state">
          <div class="spinner"></div>
          <p>Calculating debt freedom trajectories...</p>
        </div>
      } @else if (debts().length === 0) {
        <!-- Zero Debts State -->
        <div class="empty-card card">
          <div class="empty-icon">🎉</div>
          <h2>Debt Free Horizon!</h2>
          <p>You have no active liability accounts or balances with interest. Keep up the phenomenal work!</p>
        </div>
      } @else {

        <!-- Top Overview Stats -->
        <div class="overview-grid">
          <div class="card stat-card">
            <div class="stat-icon text-danger">💳</div>
            <div class="stat-details">
              <span class="stat-label">Total Debt Balance</span>
              <span class="stat-value text-expense">{{ totalDebtBalance() | currencyFormat }}</span>
            </div>
          </div>

          <div class="card stat-card">
            <div class="stat-icon text-warning">📅</div>
            <div class="stat-details">
              <span class="stat-label">Estimated Debt-Free Date</span>
              <span class="stat-value text-primary">{{ activePayoffDate() }}</span>
            </div>
          </div>

          <div class="card stat-card">
            <div class="stat-icon text-info">💸</div>
            <div class="stat-details">
              <span class="stat-label">Total Interest ({{ activeStrategyName() }})</span>
              <span class="stat-value text-warning">{{ activeInterestPaid() | currencyFormat }}</span>
            </div>
          </div>

          <div class="card stat-card">
            <div class="stat-icon text-success">🎯</div>
            <div class="stat-details">
              <span class="stat-label">Interest Saved</span>
              <span class="stat-value text-income">{{ interestSaved() | currencyFormat }}</span>
            </div>
          </div>
        </div>

        <!-- Strategy Selection & Extra Payment Slider Bar -->
        <div class="card control-bar">
          <div class="strategy-selector">
            <span class="bar-title">Payoff Strategy:</span>
            <div class="pill-group">
              <button class="pill-btn" [class.active]="selectedStrategy() === 'avalanche'" (click)="selectedStrategy.set('avalanche')">
                ⚡ Avalanche (Highest APR First)
              </button>
              <button class="pill-btn" [class.active]="selectedStrategy() === 'snowball'" (click)="selectedStrategy.set('snowball')">
                ❄️ Snowball (Lowest Balance First)
              </button>
              <button class="pill-btn" [class.active]="selectedStrategy() === 'minimumOnly'" (click)="selectedStrategy.set('minimumOnly')">
                🐢 Minimum Payments Only
              </button>
            </div>
          </div>

          <!-- Simulator Sliders -->
          <div class="simulator-controls">
            <div class="slider-group">
              <div class="slider-header">
                <span>Extra Monthly Payment: <strong>{{ extraMonthlyPayment() | currencyFormat }}/mo</strong></span>
              </div>
              <input type="range" class="form-range" min="0" max="2000" step="25" 
                     [ngModel]="extraMonthlyPayment()" (ngModelChange)="onExtraPaymentChange($event)">
            </div>

            <div class="lump-sum-group">
              <label>One-Time Lump Sum Bonus Payment:</label>
              <div class="input-prefix">
                <span class="prefix">$</span>
                <input type="number" class="form-control" [ngModel]="lumpSumPayment()" 
                       (ngModelChange)="onLumpSumChange($event)" placeholder="0" min="0" step="100">
              </div>
            </div>
          </div>
        </div>

        <!-- Strategy Comparison Breakdown Grid -->
        <div class="comparison-grid">
          <div class="card strategy-card" [class.highlight]="selectedStrategy() === 'avalanche'">
            <div class="strategy-badge avalanche-badge">⚡ Recommended for Savings</div>
            <h3 class="strategy-title">Debt Avalanche Method</h3>
            <p class="strategy-desc">Targets highest interest rate (APR) debts first. Saves the maximum money on interest over time.</p>
            <div class="strategy-metrics">
              <div class="metric-row">
                <span>Time to Debt Free:</span>
                <strong>{{ planData()?.avalanche?.months }} months</strong>
              </div>
              <div class="metric-row">
                <span>Total Interest Paid:</span>
                <strong class="text-warning">{{ planData()?.avalanche?.totalInterest | currencyFormat }}</strong>
              </div>
              <div class="metric-row">
                <span>Total Savings:</span>
                <strong class="text-income">{{ (planData()?.minimumOnly?.totalInterest - planData()?.avalanche?.totalInterest) | currencyFormat }}</strong>
              </div>
            </div>
          </div>

          <div class="card strategy-card" [class.highlight]="selectedStrategy() === 'snowball'">
            <div class="strategy-badge snowball-badge">❄️ Recommended for Motivation</div>
            <h3 class="strategy-title">Debt Snowball Method</h3>
            <p class="strategy-desc">Targets smallest debt balances first for quick mental victories and momentum.</p>
            <div class="strategy-metrics">
              <div class="metric-row">
                <span>Time to Debt Free:</span>
                <strong>{{ planData()?.snowball?.months }} months</strong>
              </div>
              <div class="metric-row">
                <span>Total Interest Paid:</span>
                <strong class="text-warning">{{ planData()?.snowball?.totalInterest | currencyFormat }}</strong>
              </div>
              <div class="metric-row">
                <span>Total Savings:</span>
                <strong class="text-income">{{ (planData()?.minimumOnly?.totalInterest - planData()?.snowball?.totalInterest) | currencyFormat }}</strong>
              </div>
            </div>
          </div>
        </div>

        <!-- Liability Debt Cards List -->
        <div class="section-header">
          <h2>Active Debts & Interest Rates</h2>
          <span class="sub-text">Customize your APR and Minimum Monthly Payment per account</span>
        </div>

        <div class="debts-grid">
          @for (debt of debts(); track debt.id) {
            <div class="card debt-card">
              <div class="debt-header">
                <h3 class="debt-name">💳 {{ debt.name }}</h3>
                <span class="debt-balance text-expense">{{ debt.balance | currencyFormat }}</span>
              </div>

              <div class="debt-fields">
                <div class="field-item">
                  <label>APR (%):</label>
                  <input type="number" class="form-control form-control-sm" [(ngModel)]="debt.apr" 
                         (blur)="saveDebtTerms(debt)" step="0.1" min="0">
                </div>
                <div class="field-item">
                  <label>Min Payment ($):</label>
                  <input type="number" class="form-control form-control-sm" [(ngModel)]="debt.minimumPayment" 
                         (blur)="saveDebtTerms(debt)" step="5" min="0">
                </div>
              </div>

              <div class="debt-actions">
                <button class="btn btn-secondary btn-sm" (click)="saveDebtTerms(debt)" [disabled]="savingDebtId() === debt.id">
                  {{ savedDebtId() === debt.id ? '✅ Saved!' : '💾 Save Terms' }}
                </button>
                <button class="btn btn-primary btn-sm" (click)="openPaymentModal(debt.id)">⚡ Pay Debt</button>
              </div>
            </div>
          }
        </div>

        <!-- Amortization Schedule Table -->
        <div class="card table-card">
          <div class="table-header">
            <h3>Payoff Timeline Projection ({{ activeStrategyName() }})</h3>
          </div>
          <div class="table-responsive">
            <table class="table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Projected Payoff Date</th>
                  <th>Interest Incurred</th>
                  <th>Remaining Total Debt</th>
                </tr>
              </thead>
              <tbody>
                @for (step of activeSchedule().slice(0, 36); track step.month) {
                  <tr>
                    <td>Month {{ step.month }}</td>
                    <td>{{ formatMonthDate(step.month) }}</td>
                    <td class="text-warning">{{ step.monthInterest | currencyFormat }}</td>
                    <td class="font-bold">{{ step.totalRemaining | currencyFormat }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>

      }
    </div>

    <!-- Payment Modal -->
    @if (showPaymentModal()) {
      <app-transaction-form (close)="closePaymentModal()"></app-transaction-form>
    }
  `,
  styles: [`
    .debt-planner-container {
      padding: 1.5rem 2rem;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }
    .loading-state, .empty-card {
      text-align: center;
      padding: 4rem 2rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
    }
    .empty-icon { font-size: 3.5rem; }

    /* Overview Grid */
    .overview-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1.25rem;
    }
    .stat-card {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1.25rem;
    }
    .stat-icon {
      font-size: 2rem;
      background: rgba(255, 255, 255, 0.04);
      padding: 0.75rem;
      border-radius: var(--radius-md);
    }
    .stat-details {
      display: flex;
      flex-direction: column;
    }
    .stat-label {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
    }
    .stat-value {
      font-size: 1.35rem;
      font-weight: 800;
    }

    /* Controls Bar */
    .control-bar {
      padding: 1.25rem 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }
    .strategy-selector {
      display: flex;
      align-items: center;
      gap: 1rem;
      flex-wrap: wrap;
    }
    .bar-title {
      font-size: 0.875rem;
      font-weight: 700;
      color: var(--text-primary);
    }
    .pill-group {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .pill-btn {
      background: var(--bg-input);
      border: 1px solid var(--border);
      color: var(--text-secondary);
      padding: 0.45rem 0.95rem;
      border-radius: 100px;
      font-size: 0.8125rem;
      font-weight: 600;
      cursor: pointer;
      transition: var(--transition);
    }
    .pill-btn.active {
      background: linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%);
      color: #fff;
      border-color: transparent;
      box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
    }

    .simulator-controls {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1.5rem;
      background: rgba(0, 0, 0, 0.15);
      padding: 1rem;
      border-radius: var(--radius-md);
      border: 1px solid var(--border);
    }
    .slider-group {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .form-range { width: 100%; cursor: pointer; }
    .lump-sum-group {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--text-secondary);
    }

    /* Comparison Grid */
    .comparison-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 1.25rem;
    }
    .strategy-card {
      padding: 1.5rem;
      position: relative;
      border: 1px solid var(--border);
      transition: var(--transition);
    }
    .strategy-card.highlight {
      border-color: #6366f1;
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(30, 41, 59, 0.6) 100%);
    }
    .strategy-badge {
      font-size: 0.7rem;
      font-weight: 700;
      padding: 0.2rem 0.6rem;
      border-radius: 100px;
      display: inline-block;
      margin-bottom: 0.75rem;
    }
    .avalanche-badge { background: rgba(79, 70, 229, 0.2); color: #818cf8; }
    .snowball-badge { background: rgba(56, 189, 248, 0.2); color: #38bdf8; }
    .strategy-title { font-size: 1.1rem; font-weight: 700; margin-bottom: 0.35rem; }
    .strategy-desc { font-size: 0.8125rem; color: var(--text-muted); margin-bottom: 1rem; line-height: 1.4; }
    .strategy-metrics { display: flex; flex-direction: column; gap: 0.5rem; border-top: 1px solid var(--border); padding-top: 0.75rem; }
    .metric-row { display: flex; justify-content: space-between; font-size: 0.875rem; }

    /* Debt Cards */
    .section-header { margin-top: 0.5rem; }
    .section-header h2 { font-size: 1.15rem; font-weight: 700; }
    .sub-text { font-size: 0.8125rem; color: var(--text-muted); }

    .debts-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1.25rem;
    }
    .debt-card {
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .debt-header { display: flex; justify-content: space-between; align-items: center; }
    .debt-name { font-size: 1rem; font-weight: 700; }
    .debt-balance { font-size: 1.2rem; font-weight: 800; }
    .debt-fields { display: flex; gap: 1rem; }
    .field-item { display: flex; flex-direction: column; gap: 0.25rem; flex: 1; font-size: 0.75rem; color: var(--text-muted); }
    .debt-actions { display: flex; justify-content: space-between; gap: 0.5rem; }

    /* Amortization Table */
    .table-card { padding: 1.25rem; }
    .table-header { margin-bottom: 1rem; }
    .table { width: 100%; border-collapse: collapse; text-align: left; font-size: 0.875rem; }
    .table th, .table td { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border); }
    .table th { color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase; }
  `]
})
export class DebtPlannerComponent implements OnInit {
  private api = inject(ApiService);
  private accountService = inject(AccountService);

  loading = signal(true);
  planData = signal<any>(null);
  debts = signal<any[]>([]);

  selectedStrategy = signal<'avalanche' | 'snowball' | 'minimumOnly'>('avalanche');
  extraMonthlyPayment = signal(100);
  lumpSumPayment = signal(0);
  showPaymentModal = signal(false);
  savingDebtId = signal<string | null>(null);
  savedDebtId = signal<string | null>(null);

  ngOnInit() {
    this.fetchPlan(false);
  }

  fetchPlan(silent = false) {
    if (!silent) {
      this.loading.set(true);
    }
    this.api.getDebtPayoffPlan(this.extraMonthlyPayment(), this.lumpSumPayment()).subscribe({
      next: (res) => {
        if (res.success && res.data) {
          this.planData.set(res.data);
          this.debts.set(res.data.debts || []);
        }
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  onExtraPaymentChange(val: number) {
    this.extraMonthlyPayment.set(val || 0);
    this.fetchPlan(true);
  }

  onLumpSumChange(val: number) {
    this.lumpSumPayment.set(val || 0);
    this.fetchPlan(true);
  }

  saveDebtTerms(debt: any) {
    this.savingDebtId.set(debt.id);
    this.api.updateAccount(debt.id, {
      apr: parseFloat(debt.apr) || 0,
      minimumPayment: parseFloat(debt.minimumPayment) || 0
    }).subscribe({
      next: () => {
        this.savingDebtId.set(null);
        this.savedDebtId.set(debt.id);
        this.accountService.loadAccounts();
        this.fetchPlan(true);
        setTimeout(() => {
          if (this.savedDebtId() === debt.id) {
            this.savedDebtId.set(null);
          }
        }, 2000);
      },
      error: () => {
        this.savingDebtId.set(null);
      }
    });
  }

  openPaymentModal(accountId?: string) {
    this.showPaymentModal.set(true);
  }

  closePaymentModal() {
    this.showPaymentModal.set(false);
    this.fetchPlan(true);
  }

  totalDebtBalance = computed(() => {
    return this.debts().reduce((sum, d) => sum + (d.balance || 0), 0);
  });

  activeSchedule = computed(() => {
    const data = this.planData();
    if (!data) return [];
    return data[this.selectedStrategy()]?.schedule || [];
  });

  activeInterestPaid = computed(() => {
    const data = this.planData();
    if (!data) return 0;
    return data[this.selectedStrategy()]?.totalInterest || 0;
  });

  interestSaved = computed(() => {
    const data = this.planData();
    if (!data) return 0;
    const minInterest = data.minimumOnly?.totalInterest || 0;
    const activeInterest = this.activeInterestPaid();
    return Math.max(0, minInterest - activeInterest);
  });

  activeStrategyName = computed(() => {
    switch (this.selectedStrategy()) {
      case 'avalanche': return 'Avalanche Method';
      case 'snowball': return 'Snowball Method';
      default: return 'Minimum Payments Only';
    }
  });

  activePayoffDate = computed(() => {
    const data = this.planData();
    if (!data) return 'N/A';
    const months = data[this.selectedStrategy()]?.months || 0;
    return this.formatMonthDate(months);
  });

  formatMonthDate(monthsFromNow: number): string {
    if (monthsFromNow <= 0) return 'Immediate';
    const date = new Date();
    date.setMonth(date.getMonth() + monthsFromNow);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }
}

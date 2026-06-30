import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { GoalService } from '../../core/services/goal.service';
import { AccountService } from '../../core/services/account.service';
import { TransactionService } from '../../core/services/transaction.service';
import { ToastService } from '../../core/services/toast.service';
import { ApiService } from '../../core/services/api.service';
import { HeaderComponent } from '../../layout/header.component';
import { CurrencyFormatPipe } from '../../shared/pipes/currency-format.pipe';
import { Goal } from '../../core/models';
import { SettingsService } from '../../core/services/settings.service';

@Component({
  selector: 'app-goals',
  standalone: true,
  imports: [CommonModule, FormsModule, HeaderComponent, CurrencyFormatPipe],
  template: `
    <app-header title="Financial Goals" subtitle="Track your savings targets and milestones">
      <div style="display: flex; gap: 0.5rem;">
        <button class="btn btn-secondary btn-sm" (click)="goToSimulator()">🔮 Savings Simulator</button>
        <button class="btn btn-primary btn-sm" (click)="openForm()">🏆 Add Goal</button>
      </div>
    </app-header>

    <div class="goals-page">

      <!-- Goals Overview summary statistics -->
      <div class="overview-bar card">
        <div class="overview-stat">
          <span class="os-label">Total Targeted</span>
          <span class="os-value">{{ totalTargetAmount() | currencyFormat }}</span>
        </div>
        <div class="overview-divider"></div>
        <div class="overview-stat">
          <span class="os-label">Total Saved</span>
          <span class="os-value text-income">{{ totalSavedAmount() | currencyFormat }}</span>
        </div>
        <div class="overview-divider"></div>
        <div class="overview-stat">
          <span class="os-label">Remaining Gap</span>
          <span class="os-value text-expense">{{ (totalTargetAmount() - totalSavedAmount()) | currencyFormat }}</span>
        </div>
        <div class="overview-divider"></div>
        <div class="overview-stat">
          <span class="os-label">Average Completion</span>
          <span class="os-value text-accent">{{ avgCompletionPercentage() }}%</span>
        </div>
      </div>

      <!-- Goals Cards Grid -->
      @if (goalService.loading()) {
        <div class="goals-grid">
          @for (i of [1,2,3]; track i) {
            <div class="skeleton" style="height: 220px; border-radius: 16px;"></div>
          }
        </div>
      } @else if (goalService.goals().length === 0) {
        <div class="card empty-state">
          <span class="empty-icon">🏆</span>
          <h3>No goals defined</h3>
          <p>Create targeted savings goals like an Emergency Fund or a Vacation goal to keep yourself focused.</p>
          <button class="btn btn-primary" (click)="openForm()">Create Your First Goal</button>
        </div>
      } @else {
        <div class="goals-grid">
          @for (goal of goalService.goals(); track goal.id) {
            @let pct = getPercentage(goal);
            @let remaining = goal.targetAmount - goal.currentAmount;
            @let daysLeft = getDaysRemaining(goal.targetDate);
            
            <div class="goal-card" [class.completed]="pct >= 100">
              <div class="gc-main">
                <!-- Circular/Radial Progress Ring -->
                <div class="gc-radial">
                  <svg class="radial-ring" viewBox="0 0 80 80">
                    <circle class="ring-bg" cx="40" cy="40" r="34"></circle>
                    <circle class="ring-fill" cx="40" cy="40" r="34"
                            [style.strokeDashoffset]="getStrokeDashoffset(pct)"
                            [style.stroke]="pct >= 100 ? 'var(--accent-green)' : 'var(--accent-blue)'"></circle>
                  </svg>
                  <div class="radial-text">
                    <span class="pct-num">{{ pct }}%</span>
                    <span class="pct-lbl">done</span>
                  </div>
                </div>

                <div class="gc-details">
                  <div class="gc-title-row">
                    <span class="gc-name">{{ goal.name }}</span>
                    <div class="gc-actions">
                      <button class="btn btn-ghost btn-icon btn-sm" (click)="getBuddyAdvice(goal)" title="Goal Buddy Advisor" style="padding: 0.25rem;">💬</button>
                      <button class="btn btn-ghost btn-icon btn-sm" (click)="goToSimulator(goal.id)" title="Savings Simulator" style="padding: 0.25rem;">🔮</button>
                      <button class="btn btn-ghost btn-icon btn-sm" (click)="openContribute(goal)" title="Add Savings" style="padding: 0.25rem;">💰</button>
                      <button class="btn btn-ghost btn-icon btn-sm" (click)="editGoal(goal)" title="Edit Goal" style="padding: 0.25rem;">✏️</button>
                      <button class="btn btn-ghost btn-icon btn-sm" (click)="confirmDelete(goal)" title="Delete Goal" style="padding: 0.25rem;">🗑️</button>
                    </div>
                  </div>
                  
                  <div class="gc-linked" *ngIf="goal.accountId">
                    <span class="lbl-small">Linked Account:</span>
                    <span class="val-small font-semibold">{{ getAccountName(goal.accountId) }}</span>
                  </div>

                  <div class="gc-amounts">
                    <span class="saved-val">{{ goal.currentAmount | currencyFormat }}</span>
                    <span class="separator">/</span>
                    <span class="target-val">{{ goal.targetAmount | currencyFormat }}</span>
                  </div>

                  <div class="gc-target-date">
                    <span>📅 Target: <strong>{{ formatDate(goal.targetDate) }}</strong></span>
                    <span class="days-badge" [class.text-expense]="daysLeft < 30 && daysLeft >= 0" [class.text-income]="daysLeft >= 30">
                      {{ daysLeft >= 0 ? daysLeft + ' days left' : 'Overdue' }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- AI Forecast Message -->
              <div class="gc-forecast" *ngIf="pct < 100">
                <span class="fc-icon">💡</span>
                <span class="fc-text">
                  @if (monthlySavingsRate() > 0) {
                    At your current savings rate (~{{ monthlySavingsRate() | currencyFormat }}/mo), you'll reach this in <strong>{{ Math.ceil(remaining / Math.max(1, monthlySavingsRate())) }} months</strong>.
                  } @else {
                    Increase your net monthly savings rate to start forecasting.
                  }
                </span>
              </div>
              <div class="gc-completed-badge" *ngIf="pct >= 100">
                🎉 Target achieved! Excellent savings discipline.
              </div>
            </div>
          }
        </div>
      }

    </div>

    <!-- Goal Form Modal -->
    @if (showForm()) {
      <div class="modal-overlay" (click)="onOverlayClick($event)">
        <div class="modal" role="dialog" aria-modal="true">
          <div class="modal-header">
            <h3>{{ editingGoal() ? 'Edit Financial Goal' : 'Create Financial Goal' }}</h3>
            <button class="btn btn-ghost btn-icon" (click)="closeForm()">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Goal Name *</label>
              <input type="text" class="form-control" [(ngModel)]="form.name" placeholder="e.g. Emergency Fund, New Car">
            </div>
            
            <div class="form-group">
              <label class="form-label">Target Amount *</label>
              <div class="input-prefix">
                <span class="prefix">{{ currencySymbol() }}</span>
                <input type="number" class="form-control" [(ngModel)]="form.targetAmount" placeholder="0.00" min="0" step="0.01">
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Starting Amount (Saved Already)</label>
              <div class="input-prefix">
                <span class="prefix">{{ currencySymbol() }}</span>
                <input type="number" class="form-control" [(ngModel)]="form.currentAmount" placeholder="0.00" min="0" step="0.01">
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Target Date *</label>
              <input type="date" class="form-control" [(ngModel)]="form.targetDate">
            </div>

            <div class="form-group">
              <label class="form-label">Link Savings Account (Optional)</label>
              <select class="form-control" [(ngModel)]="form.accountId">
                <option value="">Unlinked</option>
                @for (acc of accountService.accounts(); track acc.id) {
                  <option [value]="acc.id">{{ acc.name }} ({{ acc.currency || 'USD' }})</option>
                }
              </select>
              <span class="form-hint">Linking lets you match this goal to an active savings balance.</span>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" (click)="closeForm()">Cancel</button>
            <button class="btn btn-primary" (click)="saveGoal()" [disabled]="submitting() || !form.name || !form.targetAmount || !form.targetDate">
              {{ submitting() ? 'Saving...' : (editingGoal() ? 'Update' : 'Create') + ' Goal' }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Contribution Modal -->
    @if (showContribute()) {
      <div class="modal-overlay" (click)="closeContribute()">
        <div class="modal" style="max-width: 400px;" role="dialog" aria-modal="true">
          <div class="modal-header">
            <h3>Add Savings Target</h3>
            <button class="btn btn-ghost btn-icon" (click)="closeContribute()">✕</button>
          </div>
          <div class="modal-body">
            <p style="margin-bottom: 1rem; font-size: 0.875rem; color: var(--text-secondary);">
              Add contributions to your goal <strong>{{ activeGoal()?.name }}</strong>.
            </p>
            <div class="form-group">
              <label class="form-label">Contribution Amount *</label>
              <div class="input-prefix">
                <span class="prefix">{{ currencySymbol() }}</span>
                <input type="number" class="form-control" [(ngModel)]="contributionAmount" placeholder="0.00" min="0.01" step="0.01">
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" (click)="closeContribute()">Cancel</button>
            <button class="btn btn-success" (click)="submitContribution()" [disabled]="!contributionAmount || contributionAmount <= 0">
              Add Savings
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Goal Buddy Advice Modal -->
    @if (showBuddyModal()) {
      <div class="modal-overlay" (click)="showBuddyModal.set(false)">
        <div class="modal" style="max-width: 500px;" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h3>💬 Goal Buddy Advisor: {{ buddyGoalName() }}</h3>
            <button class="btn btn-ghost btn-icon" (click)="showBuddyModal.set(false)">✕</button>
          </div>
          <div class="modal-body" style="padding-top: 0.5rem;">
            @if (loadingBuddy()) {
              <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 3rem 1rem; gap: 1rem;">
                <div class="spinner"></div>
                <p style="color: var(--text-muted); font-size: 0.9rem;">Consulting your financial buddy...</p>
              </div>
            } @else if (buddyAdviceObj()) {
              <div style="display: flex; flex-direction: column; gap: 1.25rem;">
                
                <!-- Status Badge -->
                <div style="display: flex; align-items: center; justify-content: space-between;">
                  <span style="font-size: 0.875rem; color: var(--text-muted);">Current Status:</span>
                  <span class="badge" [class.badge-income]="buddyAdviceObj().status === 'on_track'" [class.badge-expense]="buddyAdviceObj().status !== 'on_track'"
                        style="font-size: 0.8rem; font-weight: 700; padding: 0.35rem 0.75rem; border-radius: 50px;">
                    {{ buddyAdviceObj().status === 'on_track' ? '🟢 ON TRACK' : '🔴 OFF TRACK' }}
                  </span>
                </div>

                <!-- Buddy Bubble Message -->
                <div class="buddy-bubble" style="background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 16px; padding: 1.25rem; position: relative;">
                  <div style="display: flex; gap: 0.75rem; align-items: flex-start;">
                    <span style="font-size: 1.75rem; line-height: 1;">🤖</span>
                    <div style="flex: 1;">
                      <span class="buddy-speech" style="font-size: 0.9rem; line-height: 1.5; color: var(--text-primary); font-style: italic;">
                        "{{ buddyAdviceObj().buddyMessage }}"
                      </span>
                    </div>
                  </div>
                </div>

                <!-- Suggested Actions Checklist -->
                <div>
                  <h4 style="font-size: 0.85rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.05em; margin-bottom: 0.75rem;">
                    💡 Suggested Actions:
                  </h4>
                  <ul style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.75rem;">
                    @for (action of buddyAdviceObj().suggestedActions; track action) {
                      <li style="display: flex; gap: 0.75rem; align-items: flex-start; font-size: 0.875rem; line-height: 1.4; color: var(--text-secondary);">
                        <input type="checkbox" style="margin-top: 0.2rem; cursor: pointer; flex-shrink: 0; width: 16px; height: 16px; accent-color: var(--accent-blue);">
                        <span>{{ action }}</span>
                      </li>
                    }
                  </ul>
                </div>
              </div>
            } @else {
              <p style="color: var(--text-muted); text-align: center; padding: 2rem 0;">No advice available.</p>
            }
          </div>
          <div class="modal-footer">
            <button class="btn btn-primary" (click)="showBuddyModal.set(false)">Got it, thanks!</button>
          </div>
        </div>
      </div>
    }

    <!-- Delete Confirmation Modal -->
    @if (deletingGoal()) {
      <div class="modal-overlay" (click)="cancelDelete()">
        <div class="modal" style="max-width: 400px;" role="alertdialog">
          <div class="modal-header"><h3>Remove Goal</h3></div>
          <div class="modal-body">
            <p>Delete goal <strong>{{ deletingGoal()!.name }}</strong>? This action cannot be undone.</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" (click)="cancelDelete()">Cancel</button>
            <button class="btn btn-danger" (click)="deleteGoal()">Delete</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .goals-page { padding: 1.5rem 2rem; display: flex; flex-direction: column; gap: 1.5rem; }

    /* Overview Bar */
    .overview-bar {
      display: flex; align-items: center; justify-content: space-between;
      background: var(--bg-card); border: 1px solid var(--border);
      border-radius: var(--radius-lg); padding: 1rem 2rem; flex-wrap: wrap; gap: 1rem;
    }
    .overview-stat { display: flex; flex-direction: column; gap: 0.25rem; }
    .os-label { font-size: 0.7rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .os-value { font-size: 1.25rem; font-weight: 800; }
    .overview-divider { width: 1px; height: 35px; background: var(--border); flex-shrink: 0; }

    /* Goals Grid */
    .goals-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1.25rem; }

    .goal-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      transition: var(--transition);
    }
    .goal-card:hover { border-color: var(--border-light); transform: translateY(-2px); box-shadow: var(--shadow-md); }
    .goal-card.completed { border-color: rgba(76, 175, 80, 0.4); background: rgba(76, 175, 80, 0.02); }

    .gc-main { display: flex; gap: 1.25rem; align-items: center; }

    /* Radial Progress */
    .gc-radial {
      position: relative;
      width: 80px;
      height: 80px;
      flex-shrink: 0;
    }
    .radial-ring {
      width: 100%;
      height: 100%;
      transform: rotate(-90deg);
    }
    .ring-bg {
      fill: none;
      stroke: var(--border);
      stroke-width: 6;
    }
    .ring-fill {
      fill: none;
      stroke-width: 6;
      stroke-linecap: round;
      stroke-dasharray: 213.628; /* 2 * PI * r (34) = ~213.6 */
      transition: stroke-dashoffset 0.35s ease;
    }
    .radial-text {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      line-height: 1.1;
    }
    .pct-num { font-size: 0.95rem; font-weight: 750; color: var(--text-primary); }
    .pct-lbl { font-size: 0.6rem; color: var(--text-muted); text-transform: uppercase; }

    /* Details */
    .gc-details { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.375rem; }
    .gc-title-row { display: flex; justify-content: space-between; align-items: center; }
    .gc-name { font-size: 1rem; font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .gc-actions { display: flex; gap: 0.25rem; }
    
    .gc-linked { display: flex; align-items: center; gap: 0.25rem; }
    .lbl-small { font-size: 0.65rem; color: var(--text-muted); }
    .val-small { font-size: 0.65rem; color: var(--accent-blue-light); }

    .gc-amounts { display: flex; align-items: baseline; gap: 0.25rem; margin-top: 0.25rem; }
    .saved-val { font-size: 1.25rem; font-weight: 800; color: var(--text-primary); }
    .separator { font-size: 0.875rem; color: var(--text-muted); }
    .target-val { font-size: 0.875rem; color: var(--text-muted); }

    .gc-target-date { display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; color: var(--text-muted); }
    .days-badge { font-weight: 600; }

    /* Forecast */
    .gc-forecast {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 0.5rem 0.75rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.75rem;
    }
    .fc-icon { font-size: 1rem; }
    .fc-text { color: var(--text-secondary); line-height: 1.35; }
    .fc-text strong { color: var(--text-primary); }

    .gc-completed-badge {
      background: rgba(76, 175, 80, 0.1);
      border: 1px solid rgba(76, 175, 80, 0.25);
      color: var(--accent-green);
      border-radius: var(--radius-sm);
      padding: 0.5rem;
      text-align: center;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .empty-state { display: flex; flex-direction: column; align-items: center; gap: 0.75rem; padding: 4rem 1rem; text-align: center; }
    .empty-icon { font-size: 3rem; }
    .empty-state h3 { color: var(--text-primary); }
    .empty-state p { color: var(--text-muted); max-width: 380px; }

    .input-prefix { position: relative; }
    .prefix { position: absolute; left: 0.875rem; top: 50%; transform: translateY(-50%); color: var(--text-muted); font-weight: 600; }
    .input-prefix .form-control { padding-left: 1.75rem; }

    @media (max-width: 900px) { .goals-grid { grid-template-columns: 1fr; } }
    @media (max-width: 640px) { .goals-page { padding: 1rem; } }
    @media (max-width: 600px) {
      .overview-bar {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 1rem;
        padding: 1rem;
        text-align: center;
        justify-content: center;
      }
      .overview-stat { align-items: center; }
      .overview-divider { display: none; }
    }
    @media (max-width: 500px) {
      .gc-main {
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 1rem;
      }
      .gc-details { width: 100%; align-items: center; }
      .gc-title-row { width: 100%; flex-direction: column; gap: 0.5rem; align-items: center; }
      .gc-actions { justify-content: center; }
      .gc-amounts { justify-content: center; }
      .gc-target-date { width: 100%; justify-content: space-around; }
    }

    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid var(--border);
      border-top-color: var(--accent-blue);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .buddy-bubble {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 1rem;
      position: relative;
    }
    .buddy-speech {
      font-size: 0.9rem;
      line-height: 1.5;
      color: var(--text-primary);
      font-style: italic;
    }
  `]
})
export class GoalsComponent implements OnInit {
  goalService = inject(GoalService);
  accountService = inject(AccountService);
  txnService = inject(TransactionService);
  settingsService = inject(SettingsService);
  private toast = inject(ToastService);
  private api = inject(ApiService);
  private router = inject(Router);

  showBuddyModal = signal(false);
  loadingBuddy = signal(false);
  buddyAdviceObj = signal<any | null>(null);
  buddyGoalName = signal<string>('');

  goToSimulator(goalId?: string) {
    if (goalId) {
      this.router.navigate(['/savings-simulator'], { queryParams: { goalId } });
    } else {
      this.router.navigate(['/savings-simulator']);
    }
  }

  protected Math = Math;
  showForm = signal(false);
  showContribute = signal(false);
  editingGoal = signal<Goal | undefined>(undefined);
  deletingGoal = signal<Goal | undefined>(undefined);
  activeGoal = signal<Goal | undefined>(undefined);
  submitting = signal(false);
  contributionAmount = 0;

  currencySymbol = computed(() => this.settingsService.currencySymbol());

  form = { name: '', targetAmount: null as number | null, currentAmount: 0, targetDate: '', accountId: '' };

  // Calculate net monthly savings based on past transactions to give custom forecasts
  monthlySavingsRate = computed(() => {
    const txns = this.txnService.postedNormalizedTransactions();
    const now = new Date();
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(now.getMonth() - 3);
    const dateLimit = threeMonthsAgo.toISOString().split('T')[0];

    const rangeTxns = txns.filter(t => t.date >= dateLimit);
    const income = rangeTxns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = rangeTxns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    // return average net monthly savings over 3 months
    return Math.max(0, (income - expense) / 3);
  });

  totalTargetAmount = computed(() => this.goalService.goals().reduce((sum, g) => sum + g.targetAmount, 0));
  totalSavedAmount = computed(() => this.goalService.goals().reduce((sum, g) => sum + g.currentAmount, 0));
  
  avgCompletionPercentage = computed(() => {
    const total = this.totalTargetAmount();
    if (total === 0) return 0;
    return Math.round((this.totalSavedAmount() / total) * 100);
  });

  getBuddyAdvice(goal: Goal) {
    this.buddyGoalName.set(goal.name);
    this.showBuddyModal.set(true);
    this.loadingBuddy.set(true);
    this.buddyAdviceObj.set(null);
    this.api.goalBuddyAdvisor(goal.id).subscribe({
      next: (res) => {
        this.loadingBuddy.set(false);
        if (res.success) {
          this.buddyAdviceObj.set(res.data);
        } else {
          this.toast.error(res.error || 'Failed to get advice');
          this.showBuddyModal.set(false);
        }
      },
      error: (err) => {
        this.loadingBuddy.set(false);
        this.toast.error('Failed to contact financial advisor buddy.');
        this.showBuddyModal.set(false);
      }
    });
  }

  ngOnInit() {
    this.goalService.loadGoals().subscribe();
    this.accountService.loadAccounts().subscribe();
    this.txnService.loadTransactions().subscribe();
  }

  getPercentage(goal: Goal): number {
    if (goal.targetAmount <= 0) return 0;
    return Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100));
  }

  getStrokeDashoffset(percentage: number): number {
    const circum = 2 * Math.PI * 34; // ~213.628
    return circum - (percentage / 100) * circum;
  }

  getDaysRemaining(targetDate: string): number {
    const target = new Date(targetDate + 'T00:00:00');
    const today = new Date();
    today.setHours(0,0,0,0);
    const diff = target.getTime() - today.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  formatDate(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  getAccountName(accountId: string): string {
    return this.accountService.getAccountById(accountId)?.name ?? accountId;
  }

  openForm() {
    this.form = { name: '', targetAmount: null, currentAmount: 0, targetDate: '', accountId: '' };
    this.editingGoal.set(undefined);
    this.showForm.set(true);
  }

  editGoal(goal: Goal) {
    this.form = { name: goal.name, targetAmount: goal.targetAmount, currentAmount: goal.currentAmount, targetDate: goal.targetDate, accountId: goal.accountId ?? '' };
    this.editingGoal.set(goal);
    this.showForm.set(true);
  }

  closeForm() {
    this.showForm.set(false);
    this.editingGoal.set(undefined);
  }

  openContribute(goal: Goal) {
    this.activeGoal.set(goal);
    this.contributionAmount = 0;
    this.showContribute.set(true);
  }

  closeContribute() {
    this.showContribute.set(false);
    this.activeGoal.set(undefined);
  }

  submitContribution() {
    const g = this.activeGoal();
    if (!g || !this.contributionAmount || this.contributionAmount <= 0) return;
    const newSaved = g.currentAmount + Number(this.contributionAmount);
    this.goalService.updateGoal(g.id, { currentAmount: newSaved }).subscribe(() => {
      this.closeContribute();
      this.toast.success(`Successfully saved ${this.contributionAmount} to ${g.name}!`);
    });
  }

  saveGoal() {
    if (!this.form.name || !this.form.targetAmount || !this.form.targetDate) return;
    this.submitting.set(true);
    const data = {
      name: this.form.name,
      targetAmount: Number(this.form.targetAmount),
      currentAmount: Number(this.form.currentAmount || 0),
      targetDate: this.form.targetDate,
      accountId: this.form.accountId || undefined,
    };
    const obs = this.editingGoal()
      ? this.goalService.updateGoal(this.editingGoal()!.id, data)
      : this.goalService.createGoal(data);

    obs.subscribe(() => {
      this.submitting.set(false);
      this.closeForm();
      this.toast.success(this.editingGoal() ? 'Goal updated!' : 'Goal created!');
    });
  }

  confirmDelete(goal: Goal) { this.deletingGoal.set(goal); }
  cancelDelete() { this.deletingGoal.set(undefined); }

  deleteGoal() {
    const g = this.deletingGoal();
    if (!g) return;
    this.goalService.deleteGoal(g.id).subscribe(() => {
      this.deletingGoal.set(undefined);
      this.toast.success('Goal deleted');
    });
  }

  onOverlayClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('modal-overlay')) this.closeForm();
  }
}

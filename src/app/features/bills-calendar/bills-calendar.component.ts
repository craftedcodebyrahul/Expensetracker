import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RecurringService } from '../../core/services/recurring.service';
import { CategoryService } from '../../core/services/category.service';
import { AccountService } from '../../core/services/account.service';
import { ToastService } from '../../core/services/toast.service';
import { HeaderComponent } from '../../layout/header.component';
import { CurrencyFormatPipe } from '../../shared/pipes/currency-format.pipe';
import { RecurringSchedule, DetectedBill } from '../../core/models';

interface CalendarCell {
  day: number;
  month: number;
  year: number;
  isCurrentMonth: boolean;
  dateStr: string;
}

@Component({
  selector: 'app-bills-calendar',
  standalone: true,
  imports: [CommonModule, FormsModule, HeaderComponent, CurrencyFormatPipe],
  template: `
    <app-header title="Upcoming Bills & Transfers" subtitle="Visual monthly projection of your scheduled cashflows">
      <button class="btn btn-primary btn-sm" (click)="openForm()">📅 Create Schedule</button>
    </app-header>

    <div class="calendar-page">
 
      <!-- Smart Bill Detector panel -->
      @if (recurringService.detectedBills().length > 0) {
        <div class="smart-detector-card card">
          <div class="detector-header" (click)="toggleDetectorExpanded()" role="button" tabindex="0" (keydown.enter)="toggleDetectorExpanded()">
            <div class="detector-title font-bold">
              <span class="detector-sparkle">✨</span>
              <span>Smart Bill Detector: We found {{ recurringService.detectedBills().length }} unscheduled recurring bill(s)</span>
            </div>
            <button class="btn btn-ghost btn-sm">{{ showDetectorDetails() ? 'Hide Suggestions ▲' : 'Review Suggestions ▼' }}</button>
          </div>
 
          @if (showDetectorDetails()) {
            <div class="detector-list">
              @for (bill of recurringService.detectedBills(); track bill.description) {
                <div class="detector-item">
                  <div class="detector-item-info">
                    <span class="item-name font-bold">{{ bill.description }}</span>
                    <span class="item-meta text-muted">
                      {{ bill.frequency | titlecase }} · Category: {{ getCategoryName(bill.category) }} · (Charged {{ bill.matchCount }} times)
                    </span>
                  </div>
                  <div class="detector-item-action">
                    <span class="item-amount font-bold text-expense">-{{ bill.amount | currencyFormat }}</span>
                    <button class="btn btn-primary btn-sm btn-sync" (click)="syncDetectedBill(bill)">
                      🔄 Sync to Calendar
                    </button>
                  </div>
                </div>
              }
            </div>
          }
        </div>
      }

      <!-- Calendar Header Controls -->
      <div class="calendar-controls card">
        <div class="month-nav">
          <button class="btn btn-ghost btn-sm" (click)="prevMonth()">‹</button>
          <span class="month-label font-bold">{{ monthName() }} {{ currentYear() }}</span>
          <button class="btn btn-ghost btn-sm" (click)="nextMonth()">›</button>
        </div>
        <div class="legend" style="display: flex; gap: 0.5rem; align-items: center;">
          <button class="legend-item-btn" [class.active]="filterIncome()" (click)="filterIncome.set(!filterIncome())">
            <span class="dot income" [style.opacity]="filterIncome() ? 1 : 0.3"></span>
            <span [style.opacity]="filterIncome() ? 1 : 0.6">Income</span>
          </button>
          <button class="legend-item-btn" [class.active]="filterExpense()" (click)="filterExpense.set(!filterExpense())">
            <span class="dot expense" [style.opacity]="filterExpense() ? 1 : 0.3"></span>
            <span [style.opacity]="filterExpense() ? 1 : 0.6">Expense</span>
          </button>
          <button class="legend-item-btn" [class.active]="filterTransfer()" (click)="filterTransfer.set(!filterTransfer())">
            <span class="dot transfer" [style.opacity]="filterTransfer() ? 1 : 0.3"></span>
            <span [style.opacity]="filterTransfer() ? 1 : 0.6">Transfer</span>
          </button>
        </div>
      </div>

      <!-- Calendar Grid -->
      <div class="calendar-card card">
        <div class="weekday-header">
          <span class="weekday">Sun</span>
          <span class="weekday">Mon</span>
          <span class="weekday">Tue</span>
          <span class="weekday">Wed</span>
          <span class="weekday">Thu</span>
          <span class="weekday">Fri</span>
          <span class="weekday">Sat</span>
        </div>

        <div class="calendar-grid">
          @for (cell of calendarCells(); track cell.dateStr) {
            @let items = getSchedulesForDate(cell.dateStr);
            <div class="calendar-cell" [class.outside-month]="!cell.isCurrentMonth" [class.today]="isToday(cell.dateStr)">
              <span class="day-number">{{ cell.day }}</span>
              <div class="cell-events">
                @for (item of items; track item.id) {
                  <div class="cell-event" [class]="item.type" [title]="item.description + ' - ' + (item.amount | currencyFormat)"
                       (click)="openEventDetails(item, $event)" style="cursor: pointer;">
                    <span class="event-icon">{{ item.type === 'transfer' ? '🔄' : getCategoryIcon(item.category) }}</span>
                    <span class="event-desc">{{ item.description }}</span>
                    <span class="event-amount">{{ item.amount | currencyFormat }}</span>
                  </div>
                }
              </div>
            </div>
          }
        </div>
      </div>

    </div>

    <!-- Create/Edit Recurring Schedule Form Modal -->
    @if (showForm()) {
      <div class="modal-overlay" (click)="onOverlayClick($event)">
        <div class="modal" role="dialog" aria-modal="true">
          <div class="modal-header">
            <h3>Create Recurring Schedule</h3>
            <button class="btn btn-ghost btn-icon" (click)="closeForm()">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Type *</label>
              <div class="segmented-control" style="width: 100%;">
                <button class="segment-btn" style="flex: 1;" [class.active]="form.type === 'expense'" (click)="form.type = 'expense'">Expense</button>
                <button class="segment-btn" style="flex: 1;" [class.active]="form.type === 'income'" (click)="form.type = 'income'">Income</button>
                <button class="segment-btn" style="flex: 1;" [class.active]="form.type === 'transfer'" (click)="form.type = 'transfer'">Transfer</button>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Description/Payee *</label>
              <input type="text" class="form-control" [(ngModel)]="form.description" placeholder="e.g. Rent, Salary, Netflix">
            </div>

            <div class="form-group">
              <label class="form-label">Amount *</label>
              <input type="number" class="form-control" [(ngModel)]="form.amount" placeholder="0.00" min="0.01" step="0.01">
            </div>

            <div class="form-group" *ngIf="form.type !== 'transfer'">
              <label class="form-label">Category *</label>
              <select class="form-control" [(ngModel)]="form.category">
                <option value="">Select category...</option>
                @for (cat of form.type === 'income' ? categoryService.incomeCategories() : categoryService.expenseCategories(); track cat.id) {
                  <option [value]="cat.id">{{ cat.icon }} {{ cat.name }}</option>
                }
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">{{ form.type === 'transfer' ? 'From Account *' : 'Account *' }}</label>
              <select class="form-control" [(ngModel)]="form.accountId">
                <option value="">Select account...</option>
                @for (acc of accountService.accounts(); track acc.id) {
                  <option [value]="acc.id">{{ acc.name }} ({{ acc.currency || 'USD' }})</option>
                }
              </select>
            </div>

            <div class="form-group" *ngIf="form.type === 'transfer'">
              <label class="form-label">To Account *</label>
              <select class="form-control" [(ngModel)]="form.toAccountId">
                <option value="">Select account...</option>
                @for (acc of accountService.accounts(); track acc.id) {
                  <option [value]="acc.id">{{ acc.name }} ({{ acc.currency || 'USD' }})</option>
                }
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Frequency *</label>
              <select class="form-control" [(ngModel)]="form.frequency">
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>

            <div class="grid grid-2 gap-3">
              <div class="form-group">
                <label class="form-label">Start Date *</label>
                <input type="date" class="form-control" [(ngModel)]="form.startDate">
              </div>
              <div class="form-group">
                <label class="form-label">First Due Date *</label>
                <input type="date" class="form-control" [(ngModel)]="form.nextDueDate">
              </div>
            </div>

            <!-- Email Reminder Config -->
            <div class="form-group" style="background: rgba(255,255,255,0.02); padding: 12px; border-radius: 8px; border: 1px solid var(--border); margin-top: 1rem;">
              <div style="display: flex; align-items: center; justify-content: space-between;">
                <label class="form-label" style="margin-bottom: 0; cursor: pointer; display: flex; align-items: center; gap: 8px; user-select: none;">
                  <input type="checkbox" [(ngModel)]="form.emailReminder" style="width: 18px; height: 18px; cursor: pointer; accent-color: var(--accent-blue);">
                  ✉️ Enable Email Reminders
                </label>
              </div>
              @if (form.emailReminder) {
                <div style="margin-top: 10px; display: flex; align-items: center; gap: 8px;">
                  <span style="font-size: 0.85rem; color: var(--text-secondary);">Remind me:</span>
                  <select class="form-control" [(ngModel)]="form.reminderDaysBefore" style="width: auto; padding: 4px 8px; font-size: 0.85rem; height: auto;">
                    <option [value]="1">1 day before due date</option>
                    <option [value]="2">2 days before due date</option>
                  </select>
                </div>
              }
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" (click)="closeForm()">Cancel</button>
            <button class="btn btn-primary" (click)="saveSchedule()"
                    [disabled]="submitting() || !form.description || !form.amount || !form.accountId || (form.type !== 'transfer' && !form.category) || (form.type === 'transfer' && !form.toAccountId) || !form.startDate || !form.nextDueDate">
              {{ submitting() ? 'Saving...' : 'Create Schedule' }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Detail Modal -->
    @if (selectedEvent()) {
      <div class="modal-overlay" (click)="onEventOverlayClick($event)">
        <div class="modal" role="dialog" aria-modal="true">
          <div class="modal-header">
            <h3>Scheduled {{ selectedEvent()!.type | titlecase }}</h3>
            <button class="btn btn-ghost btn-icon" (click)="closeEventDetails()">✕</button>
          </div>
          <div class="modal-body">
            <div class="event-details-grid">
              <div class="detail-row">
                <span class="detail-label">Description:</span>
                <span class="detail-value font-bold">{{ selectedEvent()!.description }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Amount:</span>
                <span class="detail-value font-bold text-lg"
                      [class.text-income]="selectedEvent()!.type === 'income'"
                      [class.text-expense]="selectedEvent()!.type === 'expense'">
                  {{ selectedEvent()!.amount | currencyFormat }}
                </span>
              </div>
              <div class="detail-row" *ngIf="selectedEvent()!.type !== 'transfer'">
                <span class="detail-label">Category:</span>
                <span class="detail-value">{{ getCategoryName(selectedEvent()!.category) }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Account:</span>
                <span class="detail-value">{{ getAccountName(selectedEvent()!.accountId) }}</span>
              </div>
              <div class="detail-row" *ngIf="selectedEvent()!.type === 'transfer'">
                <span class="detail-label">To Account:</span>
                <span class="detail-value">{{ getAccountName(selectedEvent()!.toAccountId || '') }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Frequency:</span>
                <span class="detail-value" style="text-transform: capitalize;">{{ selectedEvent()!.frequency }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Start Date:</span>
                <span class="detail-value">{{ selectedEvent()!.startDate }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Next Due Date:</span>
                <span class="detail-value">{{ selectedEvent()!.nextDueDate }}</span>
              </div>
              <div class="detail-row" style="align-items: center;">
                <span class="detail-label">Email Reminders:</span>
                <span class="detail-value" style="display: flex; align-items: center; gap: 8px;">
                  <input type="checkbox" 
                         [ngModel]="selectedEvent()!.emailReminder" 
                         (ngModelChange)="toggleReminderForSelected($event)" 
                         style="width: 16px; height: 16px; cursor: pointer; accent-color: var(--accent-blue);">
                  @if (selectedEvent()!.emailReminder) {
                    <select [ngModel]="selectedEvent()!.reminderDaysBefore" 
                            (ngModelChange)="updateReminderDaysForSelected($event)"
                            style="padding: 2px 4px; font-size: 0.8rem; border-radius: 4px; background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border);">
                      <option [value]="1">1 day before</option>
                      <option [value]="2">2 days before</option>
                    </select>
                  } @else {
                    <span style="font-size: 0.85rem; color: var(--text-muted);">Disabled</span>
                  }
                </span>
              </div>
            </div>
          </div>
          <div class="modal-footer" style="justify-content: space-between;">
            <button class="btn btn-danger btn-sm" (click)="deleteSelectedSchedule()" [disabled]="deletingSchedule()">
              {{ deletingSchedule() ? 'Deleting...' : '🗑️ Delete Schedule' }}
            </button>
            <button class="btn btn-ghost btn-sm" (click)="closeEventDetails()">Close</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .calendar-page { padding: 1.5rem 2rem; display: flex; flex-direction: column; gap: 1.25rem; }

    /* Controls Bar */
    .calendar-controls {
      display: flex; justify-content: space-between; align-items: center;
      padding: 1rem 1.5rem; flex-wrap: wrap; gap: 1rem;
    }
    .month-nav { display: flex; align-items: center; gap: 1.25rem; }
    .month-label { font-size: 1.125rem; color: var(--text-primary); min-width: 160px; text-align: center; }
    .legend { display: flex; gap: 1rem; }
    .legend-item { display: flex; align-items: center; gap: 0.375rem; font-size: 0.8125rem; color: var(--text-secondary); }
    .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
    .dot.income { background: var(--accent-green); }
    .dot.expense { background: var(--accent-red); }
    .dot.transfer { background: var(--accent-blue-light); }

    .legend-item-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      font-size: 0.8125rem;
      background: var(--bg-card);
      border: 1px solid var(--border);
      padding: 0.375rem 0.75rem;
      border-radius: var(--radius-sm);
      color: var(--text-secondary);
      cursor: pointer;
      transition: var(--transition);
      font-family: inherit;
    }
    .legend-item-btn:hover {
      background: var(--bg-card-hover);
      border-color: var(--border-light);
      color: var(--text-primary);
    }
    .legend-item-btn.active {
      background: rgba(92, 107, 192, 0.12);
      border-color: var(--accent-blue-light);
      color: var(--text-primary);
    }
    .legend-item-btn.active:hover {
      background: rgba(92, 107, 192, 0.2);
    }

    /* Calendar Card Grid */
    .calendar-card { padding: 0.5rem; display: flex; flex-direction: column; }
    .weekday-header { display: grid; grid-template-columns: repeat(7, 1fr); text-align: center; border-bottom: 1px solid var(--border); padding: 0.5rem 0; }
    .weekday { font-size: 0.8125rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; }

    .calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); grid-auto-rows: minmax(110px, auto); border-radius: 0 0 var(--radius-lg) var(--radius-lg); overflow: hidden; }
    .calendar-cell { border-right: 1px solid var(--border); border-bottom: 1px solid var(--border); padding: 0.375rem; background: var(--bg-card); display: flex; flex-direction: column; gap: 0.25rem; }
    .calendar-cell:nth-child(7n) { border-right: none; }
    .calendar-cell.outside-month { background: var(--bg-primary); opacity: 0.45; }
    .calendar-cell.today { background: rgba(92, 107, 192, 0.06); border: 1.5px solid var(--accent-blue-light); }
    .day-number { font-size: 0.8125rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 0.25rem; }
    .calendar-cell.today .day-number { color: var(--accent-blue-light); }

    .cell-events { display: flex; flex-direction: column; gap: 0.25rem; flex: 1; overflow-y: auto; max-height: 95px; }
    .cell-event { display: flex; flex-direction: column; padding: 0.2rem 0.375rem; border-radius: var(--radius-sm); font-size: 0.65rem; font-weight: 600; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cell-event.income { background: rgba(76, 175, 80, 0.12); color: var(--accent-green); border-left: 2px solid var(--accent-green); }
    .cell-event.expense { background: rgba(239, 83, 80, 0.12); color: var(--accent-red); border-left: 2px solid var(--accent-red); }
    .cell-event.transfer { background: rgba(92, 107, 192, 0.12); color: var(--accent-blue-light); border-left: 2px solid var(--accent-blue-light); }
    .event-desc { font-weight: 700; overflow: hidden; text-overflow: ellipsis; }
    .event-amount { font-size: 0.6rem; opacity: 0.8; }
 
    /* Smart Detector styling */
    .smart-detector-card {
      background: linear-gradient(135deg, rgba(92,107,192,0.12) 0%, rgba(33,150,243,0.04) 100%);
      border: 1px solid rgba(92, 107, 192, 0.25);
      padding: 1rem 1.25rem;
      border-radius: var(--radius-lg);
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
      animation: slideDown 0.3s ease;
      display: flex;
      flex-direction: column;
    }
    .detector-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
      outline: none;
    }
    .detector-title {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      font-size: 0.9375rem;
      color: var(--text-primary);
    }
    .detector-sparkle {
      font-size: 1.15rem;
      animation: pulse 1.5s infinite;
    }
    .detector-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      margin-top: 1rem;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
      padding-top: 0.875rem;
    }
    .detector-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 0.75rem 1rem;
      transition: var(--transition);
    }
    .detector-item:hover {
      background: rgba(255, 255, 255, 0.04);
      border-color: var(--border-light);
    }
    .detector-item-info {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .item-name {
      font-size: 0.875rem;
      color: var(--text-primary);
    }
    .item-meta {
      font-size: 0.75rem;
    }
    .detector-item-action {
      display: flex;
      align-items: center;
      gap: 1.25rem;
    }
    .item-amount {
      font-size: 1rem;
    }
    .btn-sync {
      padding: 0.375rem 0.75rem;
      font-size: 0.75rem;
      display: flex;
      align-items: center;
      gap: 0.375rem;
    }
    .event-details-grid { display: flex; flex-direction: column; gap: 0.75rem; }
    .detail-row { display: flex; justify-content: space-between; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; }
    .detail-label { color: var(--text-muted); font-size: 0.875rem; }
    .detail-value { color: var(--text-primary); font-size: 0.875rem; }
 
    @media (max-width: 768px) {
      .calendar-page { padding: 1rem; }
      .calendar-controls { flex-direction: column; align-items: stretch; gap: 0.75rem; }
      .legend { justify-content: center; }
      .calendar-grid { grid-auto-rows: minmax(75px, auto); }
      .event-desc { display: none; }
      .event-icon { font-size: 0.8rem; }
      .detector-header { flex-direction: column; gap: 0.5rem; align-items: flex-start; }
      .detector-item { flex-direction: column; align-items: flex-start; gap: 0.75rem; }
      .detector-item-action { width: 100%; justify-content: space-between; }
    }
  `]
})
export class BillsCalendarComponent implements OnInit {
  recurringService = inject(RecurringService);
  categoryService = inject(CategoryService);
  accountService = inject(AccountService);
  private toast = inject(ToastService);

  protected Math = Math;
  showForm = signal(false);
  submitting = signal(false);
  showDetectorDetails = signal(false);
 
  filterIncome = signal(true);
  filterExpense = signal(true);
  filterTransfer = signal(true);

  currentYear = signal<number>(new Date().getFullYear());
  currentMonth = signal<number>(new Date().getMonth()); // 0-indexed
  calendarCells = signal<CalendarCell[]>([]);
 
  monthsList = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
 
  form = {
    type: 'expense' as RecurringSchedule['type'],
    description: '',
    amount: null as number | null,
    category: '',
    accountId: '',
    toAccountId: '',
    frequency: 'monthly' as RecurringSchedule['frequency'],
    startDate: new Date().toISOString().split('T')[0],
    nextDueDate: new Date().toISOString().split('T')[0],
    emailReminder: false,
    reminderDaysBefore: 1
  };

  selectedEvent = signal<RecurringSchedule | undefined>(undefined);
  deletingSchedule = signal(false);

  openEventDetails(item: RecurringSchedule, event: MouseEvent) {
    event.stopPropagation();
    this.selectedEvent.set(item);
  }

  closeEventDetails() {
    this.selectedEvent.set(undefined);
  }

  onEventOverlayClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('modal-overlay')) {
      this.closeEventDetails();
    }
  }

  getAccountName(id: string) {
    return this.accountService.getAccountById(id)?.name ?? id;
  }

  deleteSelectedSchedule() {
    const item = this.selectedEvent();
    if (!item) return;
    this.deletingSchedule.set(true);
    this.recurringService.deleteSchedule(item.id).subscribe({
      next: () => {
        this.deletingSchedule.set(false);
        this.closeEventDetails();
        this.toast.success('Recurring schedule deleted');
      },
      error: () => {
        this.deletingSchedule.set(false);
        this.toast.error('Failed to delete schedule');
      }
    });
  }
 
  monthName() {
    return this.monthsList[this.currentMonth()];
  }
 
  ngOnInit() {
    this.recurringService.loadSchedules().subscribe();
    this.recurringService.loadDetectedBills().subscribe();
    this.categoryService.loadCategories().subscribe();
    this.accountService.loadAccounts().subscribe();
    this.generateCalendarCells();
  }
 
  toggleDetectorExpanded() {
    this.showDetectorDetails.update(v => !v);
  }
 
  syncDetectedBill(bill: DetectedBill) {
    this.form = {
      type: bill.type,
      description: bill.description,
      amount: bill.amount,
      category: bill.category,
      accountId: bill.accountId,
      toAccountId: '',
      frequency: bill.frequency,
      startDate: bill.startDate,
      nextDueDate: bill.nextDueDate,
      emailReminder: false,
      reminderDaysBefore: 1
    };
    this.showForm.set(true);
  }

  prevMonth() {
    if (this.currentMonth() === 0) {
      this.currentMonth.set(11);
      this.currentYear.update(y => y - 1);
    } else {
      this.currentMonth.update(m => m - 1);
    }
    this.generateCalendarCells();
  }

  nextMonth() {
    if (this.currentMonth() === 11) {
      this.currentMonth.set(0);
      this.currentYear.update(y => y + 1);
    } else {
      this.currentMonth.update(m => m + 1);
    }
    this.generateCalendarCells();
  }

  generateCalendarCells() {
    const year = this.currentYear();
    const month = this.currentMonth();
    
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevMonthTotalDays = new Date(year, month, 0).getDate();
    
    const cells: CalendarCell[] = [];
    
    // Trailing days from previous month
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const day = prevMonthTotalDays - i;
      const m = month === 0 ? 11 : month - 1;
      const y = month === 0 ? year - 1 : year;
      cells.push({ day, month: m, year: y, isCurrentMonth: false, dateStr: this.toDateString(y, m, day) });
    }
    
    // Current month days
    for (let day = 1; day <= totalDays; day++) {
      cells.push({ day, month, year, isCurrentMonth: true, dateStr: this.toDateString(year, month, day) });
    }
    
    // Leading days from next month
    const remainingCells = 42 - cells.length;
    for (let day = 1; day <= remainingCells; day++) {
      const m = month === 11 ? 0 : month + 1;
      const y = month === 11 ? year + 1 : year;
      cells.push({ day, month: m, year: y, isCurrentMonth: false, dateStr: this.toDateString(y, m, day) });
    }
    
    this.calendarCells.set(cells);
  }

  toDateString(year: number, month: number, day: number): string {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  isToday(dateStr: string): boolean {
    const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local format
    return dateStr === today;
  }

  getSchedulesForDate(dateStr: string): RecurringSchedule[] {
    const d = new Date(dateStr + 'T00:00:00');
    const cellTime = d.getTime();
    
    return this.recurringService.schedules().filter(s => {
      if (s.type === 'income' && !this.filterIncome()) return false;
      if (s.type === 'expense' && !this.filterExpense()) return false;
      if (s.type === 'transfer' && !this.filterTransfer()) return false;

      const start = new Date(s.startDate + 'T00:00:00');
      const startTime = start.getTime();
      
      if (cellTime < startTime) return false;
      
      if (s.frequency === 'daily') return true;
      if (s.frequency === 'weekly') return d.getDay() === start.getDay();
      if (s.frequency === 'biweekly') {
        const diffTime = d.getTime() - start.getTime();
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
        return diffDays >= 0 && diffDays % 14 === 0;
      }
      
      if (s.frequency === 'monthly') {
        const targetDay = start.getDate();
        const currentMonthLastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        if (targetDay > currentMonthLastDay) {
          return d.getDate() === currentMonthLastDay;
        }
        return d.getDate() === targetDay;
      }
      
      if (s.frequency === 'yearly') {
        return d.getDate() === start.getDate() && d.getMonth() === start.getMonth();
      }
      return false;
    });
  }

  getCategoryIcon(id: string) { return this.categoryService.getCategoryIcon(id); }
  getCategoryName(id: string) { return this.categoryService.getCategoryById(id)?.name ?? id; }

  openForm() {
    this.form = {
      type: 'expense',
      description: '',
      amount: null,
      category: '',
      accountId: '',
      toAccountId: '',
      frequency: 'monthly',
      startDate: new Date().toISOString().split('T')[0],
      nextDueDate: new Date().toISOString().split('T')[0],
      emailReminder: false,
      reminderDaysBefore: 1
    };
    this.showForm.set(true);
  }

  closeForm() { this.showForm.set(false); }

  saveSchedule() {
    this.submitting.set(true);
    const data = {
      type: this.form.type,
      description: this.form.description,
      amount: Number(this.form.amount),
      category: this.form.type === 'transfer' ? '' : this.form.category,
      frequency: this.form.frequency,
      startDate: this.form.startDate,
      nextDueDate: this.form.nextDueDate,
      accountId: this.form.accountId,
      toAccountId: this.form.type === 'transfer' ? this.form.toAccountId : undefined,
      emailReminder: this.form.emailReminder,
      reminderDaysBefore: Number(this.form.reminderDaysBefore)
    };

    this.recurringService.createSchedule(data).subscribe(() => {
      this.submitting.set(false);
      this.closeForm();
      this.toast.success('Recurring schedule created successfully!');
      this.recurringService.loadDetectedBills().subscribe();
    });
  }

  toggleReminderForSelected(enabled: boolean) {
    const event = this.selectedEvent();
    if (!event) return;
    this.recurringService.updateSchedule(event.id, { emailReminder: enabled }).subscribe(res => {
      if (res) {
        this.toast.success(`Email reminders ${enabled ? 'enabled' : 'disabled'} for this schedule.`);
        this.selectedEvent.update(e => e ? { ...e, emailReminder: enabled } : undefined);
      } else {
        this.toast.error('Failed to update email reminder.');
      }
    });
  }

  updateReminderDaysForSelected(days: any) {
    const event = this.selectedEvent();
    if (!event) return;
    const numDays = Number(days);
    this.recurringService.updateSchedule(event.id, { reminderDaysBefore: numDays }).subscribe(res => {
      if (res) {
        this.toast.success(`Reminder set to ${numDays} day(s) before.`);
        this.selectedEvent.update(e => e ? { ...e, reminderDaysBefore: numDays } : undefined);
      } else {
        this.toast.error('Failed to update reminder days.');
      }
    });
  }

  onOverlayClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('modal-overlay')) this.closeForm();
  }
}

import { Component, OnInit, inject, signal, AfterViewInit, ViewChild, ElementRef, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { CategoryService } from '../../core/services/category.service';
import { AccountService } from '../../core/services/account.service';
import { HeaderComponent } from '../../layout/header.component';
import { CurrencyFormatPipe } from '../../shared/pipes/currency-format.pipe';
import { toLocalDateString } from '../../shared/utils/date.utils';
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
          
          <!-- Report Type Segmented Control -->
          <div class="control-group flex-fill">
            <label class="form-label">Report Type</label>
            <div class="segmented-control">
              <button class="segment-btn" [class.active]="reportType() === 'monthly'" (click)="setReportType('monthly')">Monthly</button>
              <button class="segment-btn" [class.active]="reportType() === 'yearly'" (click)="setReportType('yearly')">Yearly</button>
              <button class="segment-btn" [class.active]="reportType() === 'custom'" (click)="setReportType('custom')">Custom Audit</button>
            </div>
          </div>

          <!-- Account Filter -->
          <div class="control-group">
            <label class="form-label">Account</label>
            <select class="selector-control" [ngModel]="accountId()" (ngModelChange)="accountId.set($event); loadReport()">
              <option value="all">All Accounts</option>
              @for (acc of accountService.accounts(); track acc.id) {
                <option [value]="acc.id">{{ acc.name }} ({{ acc.type | titlecase }})</option>
              }
            </select>
          </div>

          <!-- Year Selector (Monthly/Yearly) -->
          @if (reportType() !== 'custom') {
            <div class="control-group">
              <label class="form-label">Year</label>
              <select class="selector-control" [ngModel]="selectedYear()" (ngModelChange)="selectedYear.set(+$event); loadReport()">
                @for (y of years; track y) {
                  <option [value]="y">{{ y }}</option>
                }
              </select>
            </div>
          }

          <!-- Month Selector (Monthly) -->
          @if (reportType() === 'monthly') {
            <div class="control-group">
              <label class="form-label">Month</label>
              <select class="selector-control" [ngModel]="selectedMonth()" (ngModelChange)="selectedMonth.set(+$event); loadReport()">
                @for (m of months; track m.value) {
                  <option [value]="m.value">{{ m.label }}</option>
                }
              </select>
            </div>
          }

          <!-- Custom Start Date (Custom) -->
          @if (reportType() === 'custom') {
            <div class="control-group">
              <label class="form-label">Start Date</label>
              <input type="date" class="form-control" [ngModel]="customStartDate()" (ngModelChange)="customStartDate.set($event); loadReport()">
            </div>
            <div class="control-group">
              <label class="form-label">End Date</label>
              <input type="date" class="form-control" [ngModel]="customEndDate()" (ngModelChange)="customEndDate.set($event); loadReport()">
            </div>
            <div class="control-group">
              <div style="display: flex; gap: 0.5rem; align-items: flex-end;">
            <button class="btn btn-primary" (click)="loadReport()" [disabled]="loading()">
              {{ loading() ? 'Loading...' : '🔄 Refresh' }}
            </button>
          </div>
      </div>
          }

          @if (reportType() !== 'custom') {
            <button class="btn btn-primary" (click)="loadReport()" [disabled]="loading()">
              {{ loading() ? 'Loading...' : '🔄 Refresh' }}
            </button>
          }
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

        <!-- AI Advice Hub -->
        <div class="card ai-hub-card">
          <div class="ai-hub-header">
            <div class="ai-hub-title">
              <span>🤖</span>
              <span>Smart AI Financial Advisor</span>
            </div>
            @if (aiLoading()) {
              <span class="ai-badge heuristic animate-pulse">Analyzing...</span>
            } @else if (aiSummary()) {
              <span class="ai-badge" [class.heuristic]="!isAiGenerated()">
                {{ isAiGenerated() ? 'Gemini AI active' : 'Heuristic active' }}
              </span>
            }
          </div>

          @if (aiLoading()) {
            <div class="ai-loading-hub">
              <div class="ai-pulse-bars">
                <span class="ai-pulse-bar"></span>
                <span class="ai-pulse-bar"></span>
                <span class="ai-pulse-bar"></span>
              </div>
              <p class="ai-loading-heading">Consulting AI Advisor...</p>
              <p class="ai-loading-sub text-muted">Running financial cashflow audit, evaluating category health & runway...</p>
            </div>
          } @else if (aiError()) {
            <div class="ai-loading-hub" style="padding: 1rem;">
              <span style="font-size: 1.5rem;">⚠️</span>
              <p class="ai-loading-heading" style="color: var(--accent-red-light);">AI Advice Unavailable</p>
              <p class="ai-loading-sub">{{ aiError() }}</p>
              <div class="api-key-alert">
                <h5>Enable Gemini AI Recommendations:</h5>
                <p>Please check that your <code>GEMINI_API_KEY</code> is correctly specified in the project's <code>.env</code> file, then restart the server process.</p>
              </div>
            </div>
          } @else if (aiSummary()) {
            <!-- Executive Summary Text -->
            <div class="ai-summary-box">
              <p>"{{ aiSummary() }}"</p>
            </div>

            <!-- Custom Audit details (Category balance & Runway) -->
            @if (aiCategoryAudit() || aiRunwayOutlook()) {
              <div class="ai-details-grid">
                @if (aiCategoryAudit()) {
                  <div class="ai-detail-card">
                    <h4>Commitment Allocation</h4>
                    <p>{{ aiCategoryAudit() }}</p>
                  </div>
                }
                @if (aiRunwayOutlook()) {
                  <div class="ai-detail-card">
                    <h4>Runway & Buffer</h4>
                    <p>{{ aiRunwayOutlook() }}</p>
                  </div>
                }
              </div>
            }

            <!-- Advice cards list -->
            @if (aiAdvice().length > 0) {
              <div class="ai-rec-grid">
                @for (adv of aiAdvice(); track adv.text) {
                  <div class="ai-rec-card">
                    <span class="ai-rec-icon">{{ adv.icon || '💡' }}</span>
                    <div class="ai-rec-content">
                      <span class="ai-rec-title">{{ adv.title }}</span>
                      <p class="ai-rec-text">{{ adv.text }}</p>
                    </div>
                  </div>
                }
              </div>
            }
          }
        </div>

        <!-- Category Audit Popup Modal -->
    @if (selectedCategoryId()) {
      @let catName = getCategoryName(selectedCategoryId()!);
      @let catColor = getCategoryColor(selectedCategoryId()!);

      <div class="modal-overlay" (click)="closeCategoryExploration()">
        <div class="modal audit-popup-modal" role="dialog" aria-modal="true" (click)="$event.stopPropagation()" [style.border-left]="'4px solid ' + catColor">
          <div class="modal-header">
            <div class="drilldown-title">
              <span style="font-size: 1.5rem; margin-right: 0.5rem;">{{ getCategoryIcon(selectedCategoryId()!) }}</span>
              <h3 style="margin: 0; font-size: 1.25rem;">Category Audit: <span [style.color]="catColor">{{ catName }}</span></h3>
            </div>
            <button class="btn btn-ghost btn-icon" (click)="closeCategoryExploration()" aria-label="Close Audit">✕</button>
          </div>

          <div class="modal-body audit-popup-body">
            @if (categoryTxnsLoading()) {
              <div class="drilldown-loading">
                <div class="spinner-sm"></div>
                <span>Auditing transactions in {{ catName }}...</span>
              </div>
            } @else if (categoryStats()) {
              <!-- Stats Grid -->
              <div class="drilldown-stats-grid" style="margin-bottom: 1.5rem;">
                <div class="dd-stat-card">
                  <span class="dd-stat-label">Total Outflow</span>
                  <span class="dd-stat-val text-expense">{{ categoryStats().total | currencyFormat }}</span>
                </div>
                <div class="dd-stat-card">
                  <span class="dd-stat-label">Total Logs</span>
                  <span class="dd-stat-val">{{ categoryStats().count }} transactions</span>
                </div>
                <div class="dd-stat-card">
                  <span class="dd-stat-label">Average Spend</span>
                  <span class="dd-stat-val">{{ categoryStats().avg | currencyFormat }}</span>
                </div>
                <div class="dd-stat-card">
                  <span class="dd-stat-label">Peak Transaction</span>
                  <span class="dd-stat-val text-expense">
                    {{ categoryStats().peak | currencyFormat }}
                    <span class="dd-stat-sub">on {{ categoryStats().peakDate }}</span>
                  </span>
                </div>
              </div>

              <!-- Transactions list -->
              @if (categoryTxns() && categoryTxns()!.length > 0) {
                <div class="table-wrapper">
                  <table class="drilldown-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Description</th>
                        <th>Account</th>
                        <th class="text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (t of categoryTxns(); track t.id) {
                        <tr>
                          <td style="white-space: nowrap;">{{ t.date }}</td>
                          <td class="font-semibold">{{ t.description }}</td>
                          <td class="text-muted">
                            @if (t.type === 'transfer') {
                              {{ getAccountName(t.accountId) }} ➔ {{ getAccountName(t.toAccountId || '') }}
                            } @else {
                              {{ getAccountName(t.accountId) }}
                            }
                          </td>
                          <td class="text-right font-semibold text-expense">{{ t.amount | currencyFormat }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              } @else {
                <p class="text-muted text-center p-4">No transaction details found for this category in the selected range.</p>
              }
            }
          </div>

          <div class="modal-footer">
            <button class="btn btn-ghost" (click)="closeCategoryExploration()">Close</button>
          </div>
        </div>
      </div>
    }

        <!-- Charts -->
        <div class="charts-grid" [class.single-chart]="reportType() !== 'yearly'">
          <!-- Category Breakdown -->
          <div class="card">
            <div class="card-header">
              <span class="card-title">Spending by Category</span>
              <span class="card-hint">Click any row in the Category Breakdown table below to audit transactions</span>
            </div>
            <div class="chart-container">
              <canvas #categoryChart></canvas>
            </div>
          </div>

          <!-- Yearly trend (only for yearly report) -->
          @if (reportType() === 'yearly' && reportData().monthlyBreakdown) {
            <div class="card">
              <div class="card-header">
                <span class="card-title">Monthly Breakdown {{ selectedYear() }}</span>
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
            <span class="card-hint">Select a row to launch interactive Category Audit</span>
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
                  <tr class="clickable-row" (click)="selectCategory(entry.category)" [class.active-row]="selectedCategoryId() === entry.category">
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
        @if (reportType() === 'yearly' && reportData().monthlyBreakdown) {
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
    .reports-page { padding: 1.5rem 2rem; display: flex; flex-direction: column; gap: 1.5rem; }

    .controls-card { padding: 1rem 1.25rem; }
    .controls-row { display: flex; gap: 1rem; align-items: flex-end; flex-wrap: wrap; }
    .control-group { display: flex; flex-direction: column; gap: 0.375rem; min-width: 140px; }
    .control-group.flex-fill { min-width: unset; }

    .kpi-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 1rem; }
    .kpi-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 1.25rem;
      display: flex;
      align-items: center;
      gap: 0.875rem;
      transition: var(--transition);
    }
    .kpi-card:hover { border-color: var(--border-light); transform: translateY(-2px); box-shadow: var(--shadow-md); }
    .kpi-icon { font-size: 1.75rem; flex-shrink: 0; }
    .kpi-info { display: flex; flex-direction: column; gap: 0.25rem; }
    .kpi-label { font-size: 0.75rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin: 0; }
    .kpi-value { font-size: 1.25rem; font-weight: 700; }

    /* AI Advisor Hub */
    .ai-hub-card {
      background: linear-gradient(135deg, rgba(30, 33, 48, 0.95) 0%, rgba(26, 29, 39, 0.98) 100%);
      border: 1px solid var(--border-light);
      border-radius: var(--radius-xl);
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      position: relative;
      overflow: hidden;
      box-shadow: var(--shadow-glow-blue);
    }
    .ai-hub-card::before {
      content: '';
      position: absolute;
      top: -50%;
      left: -50%;
      width: 200%;
      height: 200%;
      background: radial-gradient(circle, rgba(92, 107, 192, 0.04) 0%, transparent 70%);
      pointer-events: none;
    }
    .ai-hub-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--border);
      padding-bottom: 0.75rem;
      z-index: 1;
    }
    .ai-hub-title {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--text-primary);
    }
    .ai-badge {
      background: linear-gradient(135deg, var(--accent-blue) 0%, var(--accent-purple) 100%);
      color: #fff;
      font-size: 0.65rem;
      font-weight: 700;
      padding: 0.2rem 0.5rem;
      border-radius: 100px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
    }
    .ai-badge.heuristic {
      background: var(--bg-input);
      color: var(--text-secondary);
      border: 1px solid var(--border);
    }
    .ai-summary-box {
      background: rgba(255, 255, 255, 0.02);
      border-left: 4px solid var(--accent-blue-light);
      border-radius: 4px;
      padding: 1rem 1.25rem;
      position: relative;
      z-index: 1;
    }
    .ai-summary-box p {
      font-size: 0.875rem;
      color: var(--text-primary);
      line-height: 1.5;
      font-style: italic;
    }
    
    .ai-details-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
      z-index: 1;
    }
    .ai-detail-card {
      background: rgba(255, 255, 255, 0.01);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
    }
    .ai-detail-card h4 {
      font-size: 0.8125rem;
      color: var(--text-secondary);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin: 0;
    }
    .ai-detail-card p {
      font-size: 0.8125rem;
      color: var(--text-secondary);
      line-height: 1.45;
    }

    .ai-rec-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 1rem;
      z-index: 1;
    }
    .ai-rec-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 1rem;
      display: flex;
      gap: 0.75rem;
      transition: var(--transition);
    }
    .ai-rec-card:hover {
      border-color: var(--border-light);
      transform: translateY(-1px);
    }
    .ai-rec-icon {
      font-size: 1.25rem;
      flex-shrink: 0;
    }
    .ai-rec-content {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .ai-rec-title {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--text-primary);
    }
    .ai-rec-text {
      font-size: 0.775rem;
      color: var(--text-secondary);
      line-height: 1.4;
    }

    /* Modal Styling */
    .modal-overlay {
      position: fixed;
      top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.6);
      display: flex; align-items: center; justify-content: center;
      z-index: 1000;
    }
    .modal {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      width: 90%; max-width: 600px;
      max-height: 90vh;
      display: flex; flex-direction: column;
      animation: slideUp 0.3s ease;
    }
    .modal-header {
      padding: 1rem 1.25rem;
      border-bottom: 1px solid var(--border);
      display: flex; justify-content: space-between; align-items: center;
    }
    .modal-body { padding: 1.25rem; overflow-y: auto; }
    .modal-footer { padding: 1rem 1.25rem; border-top: 1px solid var(--border); text-align: right; }

    /* Category Drilldown Card */
    .drilldown-title {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .drilldown-loading {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      padding: 2rem;
      color: var(--text-muted);
      font-size: 0.875rem;
    }
    .spinner-sm {
      width: 18px;
      height: 18px;
      border: 2px solid var(--border);
      border-top-color: var(--accent-blue);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    .drilldown-stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1rem;
    }
    .dd-stat-card {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 0.875rem 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .dd-stat-label {
      font-size: 0.7rem;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .dd-stat-val {
      font-size: 1rem;
      font-weight: 700;
      color: var(--text-primary);
    }
    .dd-stat-sub {
      font-size: 0.7rem;
      font-weight: 400;
      color: var(--text-muted);
      display: block;
      margin-top: 0.125rem;
    }
    .drilldown-table td {
      padding: 0.75rem 0.875rem;
      font-size: 0.8125rem;
    }

    /* Clickable row */
    .clickable-row {
      cursor: pointer;
      transition: var(--transition);
    }
    .clickable-row:hover td {
      background: var(--bg-card-hover) !important;
    }
    .clickable-row.active-row td {
      background: rgba(92, 107, 192, 0.1) !important;
      border-left: 2px solid var(--accent-blue-light);
    }

    /* AI Loading states */
    .ai-loading-hub {
      padding: 2rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.75rem;
      text-align: center;
    }
    .ai-pulse-bars {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      height: 24px;
    }
    .ai-pulse-bar {
      width: 4px;
      height: 100%;
      background: var(--accent-blue-light);
      border-radius: 100px;
      animation: aiPulse 1.2s infinite ease-in-out;
    }
    .ai-pulse-bar:nth-child(2) { animation-delay: 0.2s; }
    .ai-pulse-bar:nth-child(3) { animation-delay: 0.4s; }
    
    @keyframes aiPulse {
      0%, 100% { transform: scaleY(0.3); }
      50% { transform: scaleY(1); }
    }
    .ai-loading-heading { font-size: 0.9rem; font-weight: 600; color: var(--text-primary); }
    .ai-loading-sub { font-size: 0.75rem; color: var(--text-muted); }

    .api-key-alert {
      background: rgba(239, 83, 80, 0.05);
      border: 1px dashed rgba(239, 83, 80, 0.3);
      border-radius: var(--radius-md);
      padding: 1rem;
      margin-top: 0.5rem;
      text-align: left;
    }
    .api-key-alert h5 {
      color: var(--accent-red-light);
      font-size: 0.8125rem;
      margin-bottom: 0.25rem;
    }
    .api-key-alert p {
      font-size: 0.75rem;
      color: var(--text-secondary);
      line-height: 1.4;
    }

    /* Charts Layout */
    .charts-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; }
    .charts-grid.single-chart { grid-template-columns: 1fr; }
    .chart-container { height: 280px; position: relative; }

    .cat-cell { display: flex; align-items: center; gap: 0.5rem; }

    .loading-state { display: flex; flex-direction: column; align-items: center; gap: 1rem; padding: 4rem; }
    .spinner { width: 32px; height: 32px; border: 3px solid var(--border); border-top-color: var(--accent-blue); border-radius: 50%; animation: spin 0.8s linear infinite; }
    .empty-state { display: flex; flex-direction: column; align-items: center; gap: 0.75rem; padding: 4rem; text-align: center; }
    .empty-icon { font-size: 3rem; }
    .empty-state h3 { color: var(--text-primary); }
    .empty-state p { color: var(--text-muted); }

    @media (max-width: 1200px) { 
      .kpi-grid { grid-template-columns: repeat(3, 1fr); } 
      .ai-details-grid { grid-template-columns: 1fr; }
    }
    @media (max-width: 900px) {
      .drilldown-stats-grid {
        grid-template-columns: 1fr 1fr;
      }
    }
    @media (max-width: 768px) {
      .reports-page { padding: 1rem; }
      .kpi-grid { grid-template-columns: repeat(2, 1fr); }
      .charts-grid { grid-template-columns: 1fr; }
      .controls-row { flex-direction: column; align-items: stretch; gap: 0.75rem; }
      .control-group { width: 100%; }
      .segmented-control { width: 100%; justify-content: center; }
      .segment-btn { flex: 1; text-align: center; }
      .selector-control { width: 100%; }
    }
    @media (max-width: 600px) {
      .drilldown-stats-grid {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class ReportsComponent implements OnInit, AfterViewInit {
  private api = inject(ApiService);
  categoryService = inject(CategoryService);
  accountService = inject(AccountService);

  @ViewChild('categoryChart') categoryChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('trendChart') trendChartRef!: ElementRef<HTMLCanvasElement>;

  loading = signal(false);
  reportData = signal<any>(null);
  reportType = signal<'monthly' | 'yearly' | 'custom'>('monthly');
  
  selectedYear = signal<number>(new Date().getFullYear());
  selectedMonth = signal<number>(new Date().getMonth() + 1);
  accountId = signal<string>('all');

  // Custom date ranges (defaulting to current month boundaries)
  customStartDate = signal<string>(toLocalDateString(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  customEndDate = signal<string>(toLocalDateString(new Date()));

  // AI Advice Signals
  aiLoading = signal(false);
  aiSummary = signal('');
  aiAdvice = signal<any[]>([]);
  aiRunwayOutlook = signal('');
  aiCategoryAudit = signal('');
  aiError = signal('');
  isAiGenerated = signal(false);

  // Category Exploration signals
  selectedCategoryId = signal<string | null>(null);
  categoryTxns = signal<any[] | null>(null);
  categoryTxnsLoading = signal(false);
  categoryStats = signal<any | null>(null);

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
    this.accountService.loadAccounts().subscribe();
    this.loadReport();
  }

  ngAfterViewInit() {}

  setReportType(type: 'monthly' | 'yearly' | 'custom') {
    this.reportType.set(type);
    this.closeCategoryExploration();
    this.loadReport();
  }

  loadReport() {
    this.loading.set(true);
    this.aiLoading.set(true);
    this.aiError.set('');
    this.aiSummary.set('');
    this.aiAdvice.set([]);
    this.aiRunwayOutlook.set('');
    this.aiCategoryAudit.set('');
    this.isAiGenerated.set(false);
    this.closeCategoryExploration();

    const type = this.reportType();
    const accountFilter = this.accountId();
    const accParam = accountFilter !== 'all' ? accountFilter : undefined;

    if (type === 'custom') {
      const start = this.customStartDate();
      const end = this.customEndDate();

      // 1. Fetch transactions client-side rollup for Custom Range
      this.api.getTransactions({ dateFrom: start, dateTo: end }).subscribe({
        next: res => {
          this.loading.set(false);
          if (res.success && res.data) {
            const clientRollup = this.buildClientReport(res.data, accParam);
            this.reportData.set(clientRollup);
            setTimeout(() => this.renderCharts(), 100);
          } else {
            this.loading.set(false);
            this.reportData.set(null);
          }
        },
        error: () => {
          this.loading.set(false);
          this.reportData.set(null);
        }
      });

      // 2. Fetch Executive AI Report
      this.api.getExecutiveReport(start, end, accountFilter).subscribe({
        next: res => {
          this.aiLoading.set(false);
          if (res.success && res.data) {
            this.aiSummary.set(res.data.healthOverview);
            this.aiCategoryAudit.set(res.data.categoryAudit);
            this.aiRunwayOutlook.set(res.data.runwayOutlook);
            this.isAiGenerated.set(res.data.isAiGenerated);
            
            const adviceCards = (res.data.recommendations || []).map((text: string, idx: number) => ({
              icon: idx === 0 ? '🔍' : idx === 1 ? '💡' : '⚡',
              title: `Action Item ${idx + 1}`,
              text,
              type: 'info'
            }));
            this.aiAdvice.set(adviceCards);
          } else {
            this.aiError.set(res.error ?? 'Failed to generate AI executive report.');
          }
        },
        error: () => {
          this.aiLoading.set(false);
          this.aiError.set('Error connecting to the AI Executive service.');
        }
      });

    } else {
      const year = this.selectedYear();
      const month = this.selectedMonth();

      const obs = type === 'monthly'
        ? this.api.getMonthlyReport(year, month, accParam)
        : this.api.getYearlyReport(year, accParam);

      obs.subscribe({
        next: res => {
          this.loading.set(false);
          if (res.success) {
            this.reportData.set(res.data);
            setTimeout(() => this.renderCharts(), 100);

            // Calculate Date range boundaries for AI Advice
            let startDate = '';
            let endDate = '';
            let prevStartDate = '';
            let prevEndDate = '';

            if (type === 'monthly') {
              startDate = `${year}-${String(month).padStart(2, '0')}-01`;
              const lastDay = new Date(year, month, 0).getDate();
              endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

              const py = month === 1 ? year - 1 : year;
              const pm = month === 1 ? 12 : month - 1;
              prevStartDate = `${py}-${String(pm).padStart(2, '0')}-01`;
              const prevLastDay = new Date(py, pm, 0).getDate();
              prevEndDate = `${py}-${String(pm).padStart(2, '0')}-${String(prevLastDay).padStart(2, '0')}`;
            } else {
              startDate = `${year}-01-01`;
              endDate = `${year}-12-31`;
              prevStartDate = `${year - 1}-01-01`;
              prevEndDate = `${year - 1}-12-31`;
            }

            this.api.getAiAdvice(startDate, endDate, prevStartDate, prevEndDate).subscribe({
              next: aiRes => {
                this.aiLoading.set(false);
                if (aiRes.success && aiRes.data) {
                  this.aiSummary.set(aiRes.data.summary);
                  this.aiAdvice.set(aiRes.data.advice);
                  this.isAiGenerated.set(true);
                } else {
                  this.aiError.set(aiRes.error ?? 'Failed to retrieve AI advice.');
                }
              },
              error: () => {
                this.aiLoading.set(false);
                this.aiError.set('Error connecting to AI advice service.');
              }
            });

          } else {
            this.aiLoading.set(false);
            this.reportData.set(null);
          }
        },
        error: () => {
          this.loading.set(false);
          this.aiLoading.set(false);
          this.reportData.set(null);
        }
      });
    }
  }

  private buildClientReport(txns: any[], accountId?: string) {
    let filtered = txns;
    if (accountId && accountId !== 'all') {
      filtered = txns.filter(t => t.accountId === accountId || t.toAccountId === accountId);
    }

    const income = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expenses = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    
    const categoryBreakdown: Record<string, number> = {};
    filtered.forEach(t => {
      if (t.type === 'expense') {
        categoryBreakdown[t.category] = (categoryBreakdown[t.category] || 0) + t.amount;
      }
    });

    let savingsRate = 0;
    if (income > 0) {
      savingsRate = ((income - expenses) / income) * 100;
      savingsRate = Math.max(savingsRate, -100);
    } else if (expenses > 0) {
      savingsRate = -100;
    }

    return {
      totalIncome: income,
      totalExpenses: expenses,
      netBalance: income - expenses,
      transactionCount: txns.length,
      categoryBreakdown,
      savingsRate: Math.round(savingsRate * 10) / 10
    };
  }

  selectCategory(categoryId: string) {
    this.selectedCategoryId.set(categoryId);
    this.categoryTxnsLoading.set(true);
    this.categoryTxns.set(null);
    this.categoryStats.set(null);

    let startDate = '';
    let endDate = '';
    const type = this.reportType();
    const accountFilter = this.accountId();
    const accParam = accountFilter !== 'all' ? accountFilter : undefined;

    if (type === 'custom') {
      startDate = this.customStartDate();
      endDate = this.customEndDate();
    } else {
      const year = this.selectedYear();
      if (type === 'monthly') {
        const month = this.selectedMonth();
        startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      } else {
        startDate = `${year}-01-01`;
        endDate = `${year}-12-31`;
      }
    }

    this.api.getTransactions({
      dateFrom: startDate,
      dateTo: endDate,
      category: categoryId
    }).subscribe({
      next: res => {
        this.categoryTxnsLoading.set(false);
        if (res.success && res.data) {
          let txns = res.data;
          if (accParam) {
            txns = txns.filter(t => t.accountId === accParam || t.toAccountId === accParam);
          }
          this.categoryTxns.set(txns);

          if (txns.length > 0) {
            const total = txns.reduce((sum, t) => sum + t.amount, 0);
            const count = txns.length;
            const avg = total / count;
            const peak = Math.max(...txns.map(t => t.amount));
            const peakTxn = txns.find(t => t.amount === peak);

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

  private renderCharts() {
    this.renderCategoryChart();
    if (this.reportType() === 'yearly') this.renderTrendChart();
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
  getAccountName(id: string) {
    const acc = this.accountService.accounts().find(a => a.id === id);
    return acc ? acc.name : id;
  }

  monthlySavingsRate(m: { income: number; net: number }): number {
    if (m.income <= 0) return 0;
    const rate = (m.net / m.income) * 100;
    return Math.round(Math.max(rate, -100));
  }
}

import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { AuthService } from '../../core/services/auth.service';
import { SettingsService, DashboardWidgets } from '../../core/services/settings.service';
import { HeaderComponent } from '../../layout/header.component';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, HeaderComponent],
  template: `
    <app-header title="Settings" subtitle="Manage your account and preferences"></app-header>

    <div class="settings-page">

      <!-- Account Card -->
      <div class="card settings-section">
        <h3 class="section-title">👤 Your Account</h3>

        @if (auth.user()) {
          <div class="account-card">
            <img [src]="auth.user()!.picture || avatarFallback()"
                 [alt]="auth.user()!.name"
                 class="account-avatar"
                 (error)="onAvatarError($event)">
            <div class="account-info">
              <span class="account-name">{{ auth.user()!.name }}</span>
              <span class="account-email">{{ auth.user()!.email }}</span>
              <span class="account-badge">
                <span class="google-dot"></span> Signed in with Google
              </span>
            </div>
            <button class="btn btn-ghost btn-sm" (click)="auth.logout()">Sign Out</button>
          </div>
        }
      </div>

      <!-- Database Card -->
      <div class="card settings-section">
        <h3 class="section-title">🗄️ Database</h3>
        <p class="section-desc">
          Your financial data is stored securely in a private Turso database — fast edge SQLite,
          fully isolated to your account.
        </p>

        <div class="connection-status" [class.connected]="syncStatus()?.connected">
          <div class="status-dot"></div>
          <div class="status-info">
            <span class="status-label">
              {{ syncStatus()?.connected ? 'Turso DB Connected' : 'Checking connection...' }}
            </span>
            @if (syncStatus()?.provider) {
              <span class="status-sub">Provider: <code class="inline-code">{{ syncStatus()!.provider }}</code></span>
            }
            @if (syncStatus()?.lastSync) {
              <span class="status-sub">Last checked: {{ syncStatus()!.lastSync | date:'medium' }}</span>
            }
          </div>
          <button class="btn btn-ghost btn-sm" (click)="checkSync()">Refresh</button>
        </div>

        <div class="sheets-info">
          <div class="info-item">
            <span class="info-icon">⚡</span>
            <span>Edge SQLite — reads and writes complete in under 20ms, no quota limits.</span>
          </div>
          <div class="info-item">
            <span class="info-icon">🔒</span>
            <span>Your data is fully isolated — no other user can access it.</span>
          </div>
          <div class="info-item">
            <span class="info-icon">🛡️</span>
            <span>ACID transactions ensure your records are always consistent, even with recurring entries.</span>
          </div>
        </div>
      </div>

      <!-- App Preferences & Email Notifications -->
      <div class="card settings-section">
        <h3 class="section-title">⚙️ App Preferences & Email Notifications</h3>

        <div class="settings-grid">
          <div class="form-group">
            <label class="form-label" for="currency">Primary Currency</label>
            <select id="currency" class="form-control" [ngModel]="settings.currency" (ngModelChange)="onCurrencyChange($event)">
              @for (c of currencies; track c.code) {
                <option [value]="c.code">{{ c.code }} — {{ c.name }} ({{ c.symbol }})</option>
              }
            </select>
          </div>

          <div class="form-group">
            <label class="form-label" for="dateFormat">Date Format</label>
            <select id="dateFormat" class="form-control" [(ngModel)]="settings.dateFormat">
              <option value="MM/dd/yyyy">MM/DD/YYYY (US)</option>
              <option value="dd/MM/yyyy">DD/MM/YYYY (EU)</option>
              <option value="yyyy-MM-dd">YYYY-MM-DD (ISO)</option>
            </select>
          </div>
        </div>

        <div style="border-top: 1px solid var(--border); padding-top: 1.25rem; margin-top: 0.5rem; display: flex; flex-direction: column; gap: 1rem;">
          <h4 style="font-size: 0.9375rem; font-weight: 600; color: var(--text-primary); margin: 0;">📬 Automated Email Notifications</h4>

          <div style="display: flex; flex-direction: column; gap: 0.75rem;">
            <label class="checkbox-label" style="display: flex; align-items: center; gap: 0.625rem; font-size: 0.875rem; color: var(--text-primary); cursor: pointer; user-select: none;">
              <input type="checkbox" [(ngModel)]="settings.monthlyReportEnabled" style="width: 18px; height: 18px; cursor: pointer; accent-color: var(--accent-blue);">
              <span><strong>Monthly Financial Audit:</strong> Send automated summary email on the 1st of every month.</span>
            </label>

            <label class="checkbox-label" style="display: flex; align-items: center; gap: 0.625rem; font-size: 0.875rem; color: var(--text-primary); cursor: pointer; user-select: none;">
              <input type="checkbox" [(ngModel)]="settings.billRemindersEnabled" style="width: 18px; height: 18px; cursor: pointer; accent-color: var(--accent-blue);">
              <span><strong>Upcoming Bill Email Reminders:</strong> Send email reminders for all upcoming bills & recurring schedules.</span>
            </label>

            @if (settings.billRemindersEnabled) {
              <div class="form-group" style="margin-left: 2rem; max-width: 320px;">
                <label class="form-label" style="font-size: 0.8125rem;">Remind Me (Days Prior)</label>
                <select class="form-control" [(ngModel)]="settings.billReminderDaysBefore">
                  <option [ngValue]="1">1 day before due date</option>
                  <option [ngValue]="2">2 days before due date</option>
                  <option [ngValue]="3">3 days before due date</option>
                  <option [ngValue]="5">5 days before due date</option>
                  <option [ngValue]="7">7 days before due date</option>
                </select>
              </div>
            }
          </div>
        </div>

        <div class="form-actions" style="display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center; border-top: 1px solid var(--border); padding-top: 1rem;">
          <button class="btn btn-primary" (click)="saveSettings()" [disabled]="saving()">
            {{ saving() ? 'Saving...' : '💾 Save Preferences' }}
          </button>
          <!-- <button class="btn btn-ghost btn-sm" (click)="sendTestReport()" [disabled]="sendingTestReport()">
            {{ sendingTestReport() ? 'Sending Audit Email...' : '✉️ Test Monthly Audit Email' }}
          </button> -->
          <!-- <button class="btn btn-ghost btn-sm" (click)="sendTestBillReminder()" [disabled]="sendingTestBillReminder()">
            {{ sendingTestBillReminder() ? 'Sending Bill Reminder...' : '📅 Test Bill Reminder Email' }}
          </button> -->
          <button class="btn btn-ghost btn-sm" (click)="processBillRemindersNow()" [disabled]="processingBillReminders()">
            {{ processingBillReminders() ? 'Processing...' : '🔄 Check Due Reminders Now' }}
          </button>
        </div>
      </div>

      <!-- iOS Shortcuts & Automations -->
      <div class="card settings-section">
        <h3 class="section-title">📱 iOS Shortcuts & Automations</h3>
        <p class="section-desc">
          Log transactions automatically from your iPhone, Siri Shortcuts, or Apple Pay notifications without opening the app!
        </p>

        <div class="automation-card">
          <div class="auto-badge">
            <span class="badge-icon">✨</span>
            <span><strong>Smart Auto-Categorization:</strong> Category is automatically detected from the merchant/description name using AI and past purchase history!</span>
          </div>

          <div class="form-group" style="margin-top: 1rem;">
            <label class="form-label">Your Personal API Key</label>
            <div class="input-with-button">
              <input type="text" class="form-control code-input" [value]="showApiKey() ? settingsService.apiKey() : '••••••••••••••••••••••••••••••••'" readonly>
              <button class="btn btn-ghost btn-sm" (click)="toggleShowApiKey()">
                {{ showApiKey() ? 'Hide' : 'Show' }}
              </button>
              <button class="btn btn-ghost btn-sm" (click)="copyApiKey()">
                📋 Copy Key
              </button>
              <button class="btn btn-outline btn-sm" (click)="regenerateKey()" [disabled]="regeneratingKey()">
                🔄 Regenerate
              </button>
            </div>
          </div>

          <div class="form-group" style="margin-top: 1rem;">
            <label class="form-label">Quick-Log Webhook URL (Pre-authenticated)</label>
            <div class="input-with-button">
              <input type="text" class="form-control code-input" [value]="shortcutUrl()" readonly>
              <button class="btn btn-primary btn-sm" (click)="copyShortcutUrl()">
                📋 Copy Webhook URL
              </button>
            </div>
            <span class="form-hint" style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem; display: block;">
              Pass <code class="inline-code">amount</code> and <code class="inline-code">description</code> via GET query params or POST JSON body. Bank account auto-defaults to your primary checking account.
            </span>
          </div>
        </div>
      </div>

      <!-- Appearance & Themes -->
      <div class="card settings-section">
        <h3 class="section-title">🎨 Appearance & Themes</h3>
        <p class="section-desc">
          Customize TCFlow's look and feel with fonts, accents, rounding, and layouts inspired by Cashew.
        </p>

        <!-- Themes Grid -->
        <div class="theme-setting-group">
          <label class="form-label">Theme Selection</label>
          <div class="theme-cards-grid">
            <div class="theme-card" [class.active]="settingsService.themeName() === 'dark'" (click)="setTheme('dark')" style="background: #1e2130; border-color: #2e3250;">
              <div class="theme-preview">
                <span class="preview-text" style="color: #e8eaf6;">Slate</span>
                <span class="preview-accent" style="background: #5c6bc0;"></span>
              </div>
              <span class="theme-card-label">Default Dark</span>
            </div>
            
            <div class="theme-card" [class.active]="settingsService.themeName() === 'oled'" (click)="setTheme('oled')" style="background: #151026; border-color: #231b40;">
              <div class="theme-preview">
                <span class="preview-text" style="color: #f1effa;">Obsidian</span>
                <span class="preview-accent" style="background: #9c27b0;"></span>
              </div>
              <span class="theme-card-label">Obsidian Violet</span>
            </div>

            <div class="theme-card" [class.active]="settingsService.themeName() === 'light'" (click)="setTheme('light')" style="background: #ffffff; border-color: #e2e8f0;">
              <div class="theme-preview">
                <span class="preview-text" style="color: #0f172a;">Light</span>
                <span class="preview-accent" style="background: #5c6bc0;"></span>
              </div>
              <span class="theme-card-label">Premium Light</span>
            </div>

            <div class="theme-card" [class.active]="settingsService.themeName() === 'sepia'" (click)="setTheme('sepia')" style="background: #1f1b18; border-color: #332d29;">
              <div class="theme-preview">
                <span class="preview-text" style="color: #f7f5f2;">Clay</span>
                <span class="preview-accent" style="background: #ff7043;"></span>
              </div>
              <span class="theme-card-label">Warm Terracotta</span>
            </div>

            <div class="theme-card" [class.active]="settingsService.themeName() === 'nord'" (click)="setTheme('nord')" style="background: #121f1c; border-color: #203530;">
              <div class="theme-preview">
                <span class="preview-text" style="color: #e6f2ee;">Aurora</span>
                <span class="preview-accent" style="background: #00e676;"></span>
              </div>
              <span class="theme-card-label">Emerald Aurora</span>
            </div>

            <div class="theme-card" [class.active]="settingsService.themeName() === 'cyberpunk'" (click)="setTheme('cyberpunk')" style="background: #0f182c; border-color: #1e2c4f;">
              <div class="theme-preview">
                <span class="preview-text" style="color: #e3effc;">Ocean</span>
                <span class="preview-accent" style="background: #00b0ff;"></span>
              </div>
              <span class="theme-card-label">Midnight Ocean</span>
            </div>
          </div>
        </div>

        <!-- Accent Swatches -->
        <div class="theme-setting-group">
          <label class="form-label">Accent Color Selection</label>
          <div class="accent-swatches">
            @for (acc of accents; track acc.id) {
              <button class="swatch-btn" 
                      [class.active]="settingsService.accentColor() === acc.id" 
                      [style.background]="acc.color"
                      [title]="acc.name"
                      (click)="setAccent(acc.id)">
                @if (settingsService.accentColor() === acc.id) { <span class="swatch-check">✓</span> }
              </button>
            }
          </div>
        </div>

        <!-- Typography & Sizing -->
        <div class="settings-grid">
          <div class="form-group">
            <label class="form-label">Typography Font</label>
            <select class="form-control" [ngModel]="settingsService.fontFamily()" (ngModelChange)="setFont($event)">
              <option value="Inter">Inter (Sans-Serif)</option>
              <option value="Outfit">Outfit (Modern Geometric)</option>
              <option value="Roboto">Roboto (Clean / Functional)</option>
              <option value="Playfair">Playfair Display (Elegant Serif)</option>
              <option value="Lexend">Lexend (Highly Readable)</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Corner Rounding</label>
            <div class="radius-options">
              <button class="btn btn-ghost btn-sm" [class.active-radius]="settingsService.borderRadius() === 'sharp'" (click)="setRadius('sharp')">Sharp</button>
              <button class="btn btn-ghost btn-sm" [class.active-radius]="settingsService.borderRadius() === 'classic'" (click)="setRadius('classic')">Classic</button>
              <button class="btn btn-ghost btn-sm" [class.active-radius]="settingsService.borderRadius() === 'smooth'" (click)="setRadius('smooth')">Smooth</button>
              <button class="btn btn-ghost btn-sm" [class.active-radius]="settingsService.borderRadius() === 'rounded'" (click)="setRadius('rounded')">Rounded</button>
            </div>
          </div>
        </div>

        <!-- Density Selection -->
        <div class="theme-setting-group">
          <label class="form-label">Layout Density</label>
          <div class="density-selector">
            <button class="btn" style="font-size: 0.8rem;" [class.btn-primary]="settingsService.density() === 'comfortable'" [class.btn-ghost]="settingsService.density() !== 'comfortable'" (click)="setDensity('comfortable')">
              Comfortable Layout
            </button>
            <button class="btn" style="font-size: 0.8rem;" [class.btn-primary]="settingsService.density() === 'compact'" [class.btn-ghost]="settingsService.density() !== 'compact'" (click)="setDensity('compact')">
              Compact Layout
            </button>
          </div>
        </div>

        <!-- Homepage Widget Customization -->
        <div class="theme-setting-group">
          <label class="form-label">Dashboard Widget Toggles</label>
          <div class="widgets-toggles-grid">
            <label class="widget-toggle-item">
              <input type="checkbox" [ngModel]="settingsService.dashboardWidgets().onboarding" (ngModelChange)="toggleWidget('onboarding', $event)">
              <span>Checklist Guide</span>
            </label>
            <label class="widget-toggle-item">
              <input type="checkbox" [ngModel]="settingsService.dashboardWidgets().monthComparison" (ngModelChange)="toggleWidget('monthComparison', $event)">
              <span>Month Comparison</span>
            </label>
            <label class="widget-toggle-item">
              <input type="checkbox" [ngModel]="settingsService.dashboardWidgets().anomalyDetector" (ngModelChange)="toggleWidget('anomalyDetector', $event)">
              <span>AI Anomaly Alerts</span>
            </label>
            <label class="widget-toggle-item">
              <input type="checkbox" [ngModel]="settingsService.dashboardWidgets().summaryGrid" (ngModelChange)="toggleWidget('summaryGrid', $event)">
              <span>Summary Totals Cards</span>
            </label>
            <label class="widget-toggle-item">
              <input type="checkbox" [ngModel]="settingsService.dashboardWidgets().chartsRow" (ngModelChange)="toggleWidget('chartsRow', $event)">
              <span>Trend Graphs</span>
            </label>
            <label class="widget-toggle-item">
              <input type="checkbox" [ngModel]="settingsService.dashboardWidgets().bottomRow" (ngModelChange)="toggleWidget('bottomRow', $event)">
              <span>Recent Transactions</span>
            </label>
            <label class="widget-toggle-item">
              <input type="checkbox" [ngModel]="settingsService.dashboardWidgets().upcomingBills" (ngModelChange)="toggleWidget('upcomingBills', $event)">
              <span>Upcoming Bills</span>
            </label>
            <label class="widget-toggle-item">
              <input type="checkbox" [ngModel]="settingsService.dashboardWidgets().categorySpend" (ngModelChange)="toggleWidget('categorySpend', $event)">
              <span>Top Category Distribution</span>
            </label>
            <label class="widget-toggle-item">
              <input type="checkbox" [ngModel]="settingsService.dashboardWidgets().aiAudit" (ngModelChange)="toggleWidget('aiAudit', $event)">
              <span>Gemini AI Smart Audit</span>
            </label>
          </div>
        </div>

        <div class="form-actions">
          <button class="btn btn-primary" (click)="saveSettings()" [disabled]="saving()">
            {{ saving() ? 'Saving...' : 'Save Appearance' }}
          </button>
        </div>
      </div>

      <!-- Email Reports -->
      <!-- <div class="card settings-section">
        <h3 class="section-title">✉️ Monthly Email Reports</h3>
        <p class="section-desc">
          Receive a beautiful, full-fledged monthly financial audit report sent directly to your registered email address on the 1st of every month.
        </p>

        <div style="display: flex; align-items: center; gap: 0.75rem; cursor: pointer; padding: 0.5rem 0; margin-bottom: 1.25rem;">
          <input type="checkbox" id="emailReports" [(ngModel)]="settings.monthlyReportEnabled" style="width: 18px; height: 18px; cursor: pointer; accent-color: var(--accent-blue);">
          <label for="emailReports" style="cursor: pointer; font-size: 0.9375rem; font-weight: 500; user-select: none;">
            Enable Monthly Email Reports
          </label>
        </div>

        <div class="form-actions" style="display: flex; gap: 0.75rem;">
          <button class="btn btn-primary" (click)="saveSettings()" [disabled]="saving()">
            {{ saving() ? 'Saving...' : 'Save Preferences' }}
          </button>
          <button class="btn btn-ghost" (click)="sendTestReport()" [disabled]="sendingTestReport() || !settings.monthlyReportEnabled">
            {{ sendingTestReport() ? 'Sending...' : '✉️ Send Test Report' }}
          </button>
        </div>
      </div> -->

      <!-- Data Management -->
      <div class="card settings-section">
        <h3 class="section-title">🗂️ Data Management</h3>

        <div class="data-actions">
          <div class="data-action-card">
            <span class="da-icon">⬇️</span>
            <div class="da-info">
              <span class="da-title">Export Transactions</span>
              <span class="da-desc">Download all your transactions as a CSV file</span>
            </div>
            <a routerLink="/transactions" class="btn btn-ghost btn-sm">Go to Transactions</a>
          </div>

          <div class="data-action-card">
            <span class="da-icon">🔍</span>
            <div class="da-info">
              <span class="da-title">Check Connection</span>
              <span class="da-desc">Verify the Turso database connection is healthy</span>
            </div>
            <button class="btn btn-ghost btn-sm" (click)="checkSync()">Check Now</button>
          </div>
        </div>
      </div>

      <!-- About -->
      <div class="card settings-section">
        <h3 class="section-title">ℹ️ About TCFlow</h3>
        <div class="about-grid">
          <div class="about-item"><span class="about-label">Version</span><span>2.0.0</span></div>
          <div class="about-item"><span class="about-label">Framework</span><span>Angular 21 + Express</span></div>
          <div class="about-item"><span class="about-label">Auth</span><span>Google OAuth 2.0</span></div>
          <div class="about-item"><span class="about-label">Database</span><span>Turso (libSQL / SQLite)</span></div>
          <div class="about-item"><span class="about-label">ORM</span><span>Prisma 7</span></div>
          <div class="about-item"><span class="about-label">Charts</span><span>Chart.js</span></div>
          <div class="about-item"><span class="about-label">AI Advisor</span><span>Google Gemini 1.5 Flash</span></div>
          <div class="about-item"><span class="about-label">Data ownership</span><span>100% yours — private DB</span></div>
        </div>
      </div>

    </div>
  `,
  styles: [`
    .settings-page {
      padding: 1.5rem 2rem;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      max-width: 800px;
    }

    .settings-section { display: flex; flex-direction: column; gap: 1.25rem; }
    .section-title { font-size: 1rem; font-weight: 600; color: var(--text-primary); }
    .section-desc { font-size: 0.875rem; color: var(--text-muted); margin-top: -0.5rem; }

    /* Account card */
    .account-card {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem;
      background: var(--bg-input);
      border-radius: var(--radius-md);
      border: 1px solid var(--border);
    }
    .account-avatar {
      width: 52px;
      height: 52px;
      border-radius: 50%;
      object-fit: cover;
      border: 2px solid var(--border-light);
      flex-shrink: 0;
    }
    .account-info { flex: 1; display: flex; flex-direction: column; gap: 0.25rem; min-width: 0; }
    .account-name { font-size: 1rem; font-weight: 600; color: var(--text-primary); }
    .account-email { font-size: 0.8125rem; color: var(--text-muted); }
    .account-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      font-size: 0.75rem;
      color: var(--accent-blue-light);
      margin-top: 0.125rem;
    }
    .google-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #4285F4;
      flex-shrink: 0;
    }

    /* Connection status */
    .connection-status {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem;
      background: rgba(239, 83, 80, 0.06);
      border: 1px solid rgba(239, 83, 80, 0.2);
      border-radius: var(--radius-md);
      flex-wrap: wrap;
    }
    .connection-status.connected {
      background: rgba(76, 175, 80, 0.06);
      border-color: rgba(76, 175, 80, 0.2);
    }
    .status-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: var(--accent-yellow);
      flex-shrink: 0;
      animation: pulse 2s infinite;
    }
    .connection-status.connected .status-dot {
      background: var(--accent-green);
      box-shadow: 0 0 8px var(--accent-green);
      animation: none;
    }
    .status-info { flex: 1; display: flex; flex-direction: column; gap: 0.25rem; min-width: 0; }
    .status-label { font-size: 0.875rem; font-weight: 600; color: var(--text-primary); }
    .status-sub { font-size: 0.75rem; color: var(--text-muted); }
    .inline-code {
      font-family: 'Courier New', monospace;
      font-size: 0.75rem;
      color: var(--accent-cyan);
      background: var(--bg-primary);
      padding: 0.1rem 0.375rem;
      border-radius: 4px;
    }

    /* DB connection status */
    .sheets-info { display: flex; flex-direction: column; gap: 0.625rem; }
    .info-item {
      display: flex;
      align-items: flex-start;
      gap: 0.625rem;
      font-size: 0.8125rem;
      color: var(--text-secondary);
    }
    .info-icon { flex-shrink: 0; }

    /* Preferences grid */
    .settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .form-actions { display: flex; justify-content: flex-end; }

    /* Data actions */
    .data-actions { display: flex; flex-direction: column; gap: 0.75rem; }
    .data-action-card {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem;
      background: var(--bg-input);
      border-radius: var(--radius-md);
      border: 1px solid var(--border);
    }
    .da-icon { font-size: 1.5rem; flex-shrink: 0; }
    .da-info { flex: 1; display: flex; flex-direction: column; gap: 0.125rem; }
    .da-title { font-size: 0.875rem; font-weight: 600; color: var(--text-primary); }
    .da-desc { font-size: 0.75rem; color: var(--text-muted); }

    /* About */
    .about-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.625rem 2rem;
    }
    .about-item { display: flex; gap: 0.75rem; font-size: 0.875rem; }
    .about-label { color: var(--text-muted); min-width: 110px; flex-shrink: 0; }

    @media (max-width: 768px) {
      .settings-page { padding: 1rem; }
      .settings-grid { grid-template-columns: 1fr; }
      .about-grid { grid-template-columns: 1fr; }
      .account-card { flex-wrap: wrap; }
    }

    /* Appearance Customization Layout Styles */
    .theme-setting-group {
      display: flex;
      flex-direction: column;
      gap: 0.625rem;
    }
    .theme-cards-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.75rem;
    }
    @media (max-width: 520px) {
      .theme-cards-grid { grid-template-columns: repeat(2, 1fr); }
    }
    .theme-card {
      border: 2px solid var(--border);
      border-radius: var(--radius-md);
      padding: 0.75rem;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      transition: var(--transition);
      user-select: none;
    }
    .theme-card:hover {
      border-color: var(--border-light);
      transform: translateY(-1px);
    }
    .theme-card.active {
      border-color: var(--accent-blue);
      box-shadow: 0 0 10px rgba(92, 107, 192, 0.15);
    }
    .theme-preview {
      height: 38px;
      border-radius: var(--radius-sm);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 0.75rem;
      font-size: 0.8125rem;
      font-weight: 600;
      border: 1px solid rgba(255, 255, 255, 0.05);
    }
    .preview-accent {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }
    .theme-card-label {
      font-size: 0.75rem;
      font-weight: 500;
      text-align: center;
      color: var(--text-secondary);
    }
    .accent-swatches {
      display: flex;
      flex-wrap: wrap;
      gap: 0.625rem;
    }
    .swatch-btn {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: 2px solid transparent;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: var(--transition);
    }
    .swatch-btn:hover {
      transform: scale(1.1);
    }
    .swatch-btn.active {
      border-color: var(--text-primary);
      transform: scale(1.05);
    }
    .swatch-check {
      color: #fff;
      font-size: 0.75rem;
      font-weight: 700;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
    }
    .radius-options {
      display: flex;
      gap: 0.375rem;
    }
    .radius-options .btn {
      flex: 1;
      justify-content: center;
      padding: 0.5rem 0.25rem;
    }
    .btn-ghost.active-radius {
      background: var(--accent-blue);
      color: #fff;
      border-color: var(--accent-blue);
    }
    .density-selector {
      display: flex;
      gap: 0.75rem;
    }
    .density-selector .btn {
      flex: 1;
      justify-content: center;
    }
    .widgets-toggles-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0.625rem 1rem;
      background: var(--bg-input);
      border-radius: var(--radius-md);
      padding: 1rem;
      border: 1px solid var(--border);
    }
    @media (max-width: 520px) {
      .widgets-toggles-grid { grid-template-columns: 1fr; }
    }
    .widget-toggle-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
      font-size: 0.8125rem;
      font-weight: 500;
      user-select: none;
    }
    .automation-card {
      background: var(--bg-input);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .auto-badge {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      padding: 0.75rem 1rem;
      background: rgba(92, 107, 192, 0.12);
      border: 1px solid rgba(92, 107, 192, 0.3);
      border-radius: var(--radius-sm);
      font-size: 0.8125rem;
      color: var(--text-primary);
    }
    .input-with-button {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      width: 100%;
    }
    .code-input {
      font-family: monospace;
      font-size: 0.8125rem;
      letter-spacing: 0.05em;
    }
    @media (max-width: 600px) {
      .input-with-button {
        flex-direction: column;
        align-items: stretch;
      }
    }
  `]
})
export class SettingsComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  public settingsService = inject(SettingsService);
  auth = inject(AuthService);

  syncStatus = signal<any>(null);
  saving = signal(false);
  sendingTestReport = signal(false);
  sendingTestBillReminder = signal(false);
  processingBillReminders = signal(false);
  showApiKey = signal(false);
  regeneratingKey = signal(false);
  settings = {
    currency: 'USD',
    currencySymbol: '$',
    dateFormat: 'MM/dd/yyyy',
    monthlyReportEnabled: true,
    billRemindersEnabled: true,
    billReminderDaysBefore: 2,
  };

  currencies = [
    { code: 'USD', symbol: '$', name: 'US Dollar' },
    { code: 'EUR', symbol: '€', name: 'Euro' },
    { code: 'GBP', symbol: '£', name: 'British Pound' },
    { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
    { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
    { code: 'KRW', symbol: '₩', name: 'Korean Won' },
    { code: 'CAD', symbol: 'CAD$', name: 'Canadian Dollar' },
    { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
    { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
  ];

  ngOnInit() {
    this.checkSync();
    // Load current settings from database and pre-fill the form
    this.settingsService.load().subscribe(() => {
      this.settings.currency = this.settingsService.currency();
      this.settings.currencySymbol = this.settingsService.currencySymbol();
      this.settings.dateFormat = this.settingsService.dateFormat();
      this.settings.monthlyReportEnabled = this.settingsService.monthlyReportEnabled();
      this.settings.billRemindersEnabled = this.settingsService.billRemindersEnabled();
      this.settings.billReminderDaysBefore = this.settingsService.billReminderDaysBefore();
    });
  }

  onCurrencyChange(code: string) {
    this.settings.currency = code;
    const found = this.currencies.find(c => c.code === code);
    this.settings.currencySymbol = found ? found.symbol : '$';
  }

  checkSync() {
    this.api.syncStatus().subscribe({
      next: res => this.syncStatus.set(res.success ? res.data : null),
      error: () => this.syncStatus.set({ connected: false })
    });
  }

  saveSettings() {
    this.saving.set(true);
    this.settingsService.save(this.settings).subscribe(() => {
      this.saving.set(false);
    });
  }

  sendTestReport() {
    this.sendingTestReport.set(true);
    this.api.sendTestReport().subscribe({
      next: (res) => {
        this.sendingTestReport.set(false);
        if (res.success) {
          this.toast.success('Test email report sent! Please check your inbox.');
        } else {
          this.toast.error(res.error || 'Failed to send test email.');
        }
      },
      error: (err) => {
        this.sendingTestReport.set(false);
        this.toast.error(err?.error?.error || err?.message || 'SMTP server connection error.');
      }
    });
  }

  sendTestBillReminder() {
    this.sendingTestBillReminder.set(true);
    this.api.sendTestBillReminder().subscribe({
      next: (res) => {
        this.sendingTestBillReminder.set(false);
        if (res.success) {
          this.toast.success(res.message || 'Test bill reminder email sent! Check your inbox.');
        } else {
          this.toast.error(res.error || 'Failed to send test bill reminder.');
        }
      },
      error: (err) => {
        this.sendingTestBillReminder.set(false);
        this.toast.error(err?.error?.error || err?.message || 'Failed to send test bill reminder.');
      }
    });
  }

  processBillRemindersNow() {
    this.processingBillReminders.set(true);
    this.api.processBillReminders().subscribe({
      next: (res) => {
        this.processingBillReminders.set(false);
        if (res.success) {
          const sent = res.data?.sentCount ?? 0;
          this.toast.success(`Processed reminders! Sent ${sent} email(s).`);
        } else {
          this.toast.error(res.error || 'Failed to process bill reminders.');
        }
      },
      error: (err) => {
        this.processingBillReminders.set(false);
        this.toast.error(err?.error?.error || err?.message || 'Failed to process bill reminders.');
      }
    });
  }

  avatarFallback(): string {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(this.auth.user()?.name ?? 'U')}&background=5c6bc0&color=fff&size=64`;
  }

  onAvatarError(event: Event) {
    (event.target as HTMLImageElement).src = this.avatarFallback();
  }

  accents = [
    { id: 'indigo', color: '#5c6bc0', name: 'Indigo' },
    { id: 'emerald', color: '#10b981', name: 'Emerald' },
    { id: 'rose', color: '#f43f5e', name: 'Rose' },
    { id: 'amber', color: '#f59e0b', name: 'Amber' },
    { id: 'violet', color: '#8b5cf6', name: 'Violet' },
    { id: 'cyan', color: '#06b6d4', name: 'Cyan' }
  ];

  setTheme(name: any) {
    this.settingsService.themeName.set(name);
    this.settingsService.applyVisualSettings();
  }

  setAccent(accent: any) {
    this.settingsService.accentColor.set(accent);
    this.settingsService.applyVisualSettings();
  }

  setFont(font: any) {
    this.settingsService.fontFamily.set(font);
    this.settingsService.applyVisualSettings();
  }

  setRadius(radius: any) {
    this.settingsService.borderRadius.set(radius);
    this.settingsService.applyVisualSettings();
  }

  setDensity(density: any) {
    this.settingsService.density.set(density);
    this.settingsService.applyVisualSettings();
  }

  toggleWidget(widgetKey: keyof DashboardWidgets, enabled: boolean) {
    const current = this.settingsService.dashboardWidgets();
    this.settingsService.dashboardWidgets.set({
      ...current,
      [widgetKey]: enabled
    });
  }

  toggleShowApiKey() {
    this.showApiKey.set(!this.showApiKey());
  }

  copyApiKey() {
    const key = this.settingsService.apiKey();
    if (!key) return;
    navigator.clipboard.writeText(key).then(() => {
      this.toast.success('API Key copied to clipboard!');
    });
  }

  shortcutUrl(): string {
    const key = this.settingsService.apiKey();
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/api/quick-log?apiKey=${key}&amount={ammount}&description={description}`;
  }

  copyShortcutUrl() {
    const url = this.shortcutUrl();
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      this.toast.success('Shortcut Webhook URL copied to clipboard!');
    });
  }

  regenerateKey() {
    if (confirm('Are you sure you want to regenerate your API Key? Existing automations using the current key will stop working.')) {
      this.regeneratingKey.set(true);
      this.settingsService.regenerateApiKey().subscribe({
        next: () => this.regeneratingKey.set(false),
        error: () => this.regeneratingKey.set(false)
      });
    }
  }
}

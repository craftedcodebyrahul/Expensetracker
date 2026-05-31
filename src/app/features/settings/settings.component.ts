import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { AuthService } from '../../core/services/auth.service';
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

      <!-- Google Sheets Card -->
      <div class="card settings-section">
        <h3 class="section-title">📊 Google Sheets Storage</h3>
        <p class="section-desc">
          Your financial data is stored in a private Google Spreadsheet in your own Drive.
          Only you have access to it.
        </p>

        <div class="connection-status" [class.connected]="syncStatus()?.connected">
          <div class="status-dot"></div>
          <div class="status-info">
            <span class="status-label">
              {{ syncStatus()?.connected ? 'Connected to Google Sheets' : 'Checking connection...' }}
            </span>
            @if (syncStatus()?.spreadsheetId) {
              <span class="status-sub">
                Spreadsheet ID: <code class="inline-code">{{ syncStatus()!.spreadsheetId }}</code>
              </span>
            }
            @if (syncStatus()?.lastSync) {
              <span class="status-sub">Last checked: {{ syncStatus()!.lastSync | date:'medium' }}</span>
            }
          </div>
          <button class="btn btn-ghost btn-sm" (click)="checkSync()">Refresh</button>
        </div>

        @if (syncStatus()?.spreadsheetId) {
          <a class="open-sheet-btn"
             [href]="'https://docs.google.com/spreadsheets/d/' + syncStatus()!.spreadsheetId"
             target="_blank" rel="noopener noreferrer">
            <span>📋</span>
            <span>Open My Spreadsheet in Google Sheets</span>
            <span class="external-icon">↗</span>
          </a>
        }

        <div class="sheets-info">
          <div class="info-item">
            <span class="info-icon">🔒</span>
            <span>Your spreadsheet is private — only accessible by you and this app.</span>
          </div>
          <div class="info-item">
            <span class="info-icon">✏️</span>
            <span>You can view and edit data directly in Google Sheets at any time.</span>
          </div>
          <div class="info-item">
            <span class="info-icon">🔄</span>
            <span>Every change syncs instantly — no manual export needed.</span>
          </div>
        </div>
      </div>

      <!-- App Preferences -->
      <div class="card settings-section">
        <h3 class="section-title">⚙️ App Preferences</h3>

        <div class="settings-grid">
          <div class="form-group">
            <label class="form-label" for="currency">Currency Symbol</label>
            <select id="currency" class="form-control" [(ngModel)]="settings.currencySymbol">
              <option value="$">$ — US Dollar</option>
              <option value="€">€ — Euro</option>
              <option value="£">£ — British Pound</option>
              <option value="¥">¥ — Japanese Yen</option>
              <option value="₹">₹ — Indian Rupee</option>
              <option value="₩">₩ — Korean Won</option>
              <option value="₿">₿ — Bitcoin</option>
              <option value="CHF">CHF — Swiss Franc</option>
              <option value="CAD$">CAD$ — Canadian Dollar</option>
              <option value="A$">A$ — Australian Dollar</option>
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

        <div class="form-actions">
          <button class="btn btn-primary" (click)="saveSettings()" [disabled]="saving()">
            {{ saving() ? 'Saving...' : 'Save Preferences' }}
          </button>
        </div>
      </div>

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
            <span class="da-icon">🔄</span>
            <div class="da-info">
              <span class="da-title">Re-check Connection</span>
              <span class="da-desc">Verify the Google Sheets connection is working</span>
            </div>
            <button class="btn btn-ghost btn-sm" (click)="checkSync()">Check Now</button>
          </div>

          @if (syncStatus()?.spreadsheetId) {
            <div class="data-action-card">
              <span class="da-icon">📋</span>
              <div class="da-info">
                <span class="da-title">View Raw Data</span>
                <span class="da-desc">Open your spreadsheet directly in Google Sheets</span>
              </div>
              <a [href]="'https://docs.google.com/spreadsheets/d/' + syncStatus()!.spreadsheetId"
                 target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm">
                Open ↗
              </a>
            </div>
          }
        </div>
      </div>

      <!-- About -->
      <div class="card settings-section">
        <h3 class="section-title">ℹ️ About TCFlow</h3>
        <div class="about-grid">
          <div class="about-item"><span class="about-label">Version</span><span>1.0.0</span></div>
          <div class="about-item"><span class="about-label">Framework</span><span>Angular 21 + Express</span></div>
          <div class="about-item"><span class="about-label">Auth</span><span>Google OAuth 2.0</span></div>
          <div class="about-item"><span class="about-label">Storage</span><span>Google Sheets API v4</span></div>
          <div class="about-item"><span class="about-label">Charts</span><span>Chart.js</span></div>
          <div class="about-item"><span class="about-label">Data ownership</span><span>100% yours (your Drive)</span></div>
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

    /* Open sheet button */
    .open-sheet-btn {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.875rem 1rem;
      background: rgba(66, 133, 244, 0.08);
      border: 1px solid rgba(66, 133, 244, 0.25);
      border-radius: var(--radius-md);
      color: #4285F4;
      text-decoration: none;
      font-size: 0.875rem;
      font-weight: 500;
      transition: var(--transition);
    }
    .open-sheet-btn:hover {
      background: rgba(66, 133, 244, 0.15);
      color: #4285F4;
    }
    .external-icon { margin-left: auto; font-size: 0.875rem; }

    /* Sheets info bullets */
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
  `]
})
export class SettingsComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  auth = inject(AuthService);

  syncStatus = signal<any>(null);
  saving = signal(false);
  settings = { currencySymbol: '$', dateFormat: 'MM/dd/yyyy' };

  ngOnInit() {
    this.checkSync();
    this.api.getSettings().subscribe(res => {
      if (res.success) {
        this.settings.currencySymbol = res.data.currencySymbol ?? '$';
        this.settings.dateFormat = res.data.dateFormat ?? 'MM/dd/yyyy';
      }
    });
  }

  checkSync() {
    this.api.syncStatus().subscribe({
      next: res => this.syncStatus.set(res.success ? res.data : null),
      error: () => this.syncStatus.set({ connected: false })
    });
  }

  saveSettings() {
    this.saving.set(true);
    this.api.updateSettings(this.settings).subscribe({
      next: () => { this.saving.set(false); this.toast.success('Preferences saved!'); },
      error: () => { this.saving.set(false); this.toast.error('Failed to save preferences'); }
    });
  }

  avatarFallback(): string {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(this.auth.user()?.name ?? 'U')}&background=5c6bc0&color=fff&size=64`;
  }

  onAvatarError(event: Event) {
    (event.target as HTMLImageElement).src = this.avatarFallback();
  }
}

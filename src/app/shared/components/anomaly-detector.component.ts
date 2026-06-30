import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../core/services/api.service';

interface AnomalyItem {
  type: 'duplicate' | 'spike';
  severity: 'warning' | 'info';
  title: string;
  message: string;
  transactions: Array<{ id: string; date: string; description: string; amount: number }>;
}

@Component({
  selector: 'app-anomaly-detector',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="card anomaly-card">
      <div class="card-header">
        <span class="card-title">🚨 System Alerts & Audit</span>
        <span class="card-hint">Real-time scan for duplicate charges and unusual spending behavior</span>
      </div>
      
      @if (loading()) {
        <div class="anomaly-loading">
          <div class="spinner-sm"></div>
          <span>Auditing transaction logs...</span>
        </div>
      } @else if (anomalies().length === 0) {
        <div class="clean-state">
          <span class="clean-icon">🛡️</span>
          <div>
            <span class="clean-title">Audit Status: Secure</span>
            <p class="clean-desc">No double billings or spending anomalies detected in the last 90 days.</p>
          </div>
        </div>
      } @else {
        <div class="alerts-list">
          @for (item of anomalies(); track item.title) {
            <div class="alert-item" [class]="'alert-' + item.severity">
              <span class="alert-icon">{{ item.type === 'duplicate' ? '⚠️' : '⚡' }}</span>
              <div class="alert-content">
                <span class="alert-title">{{ item.title }}</span>
                <p class="alert-msg">{{ item.message }}</p>
                <div class="alert-txns">
                  @for (t of item.transactions; track t.id) {
                    <div class="alert-txn-row">
                      <span>{{ t.date }} • {{ t.description }}</span>
                      <strong>\${{ t.amount.toFixed(2) }}</strong>
                    </div>
                  }
                </div>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .anomaly-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 1.25rem;
      margin-bottom: 1.5rem;
    }
    .anomaly-loading {
      display: flex; align-items: center; justify-content: center; gap: 0.75rem;
      padding: 1.5rem; color: var(--text-muted); font-size: 0.8125rem;
    }
    .spinner-sm {
      width: 16px; height: 16px; border: 2px solid var(--border);
      border-top-color: var(--accent-blue); border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .clean-state {
      display: flex; align-items: center; gap: 1rem;
      padding: 0.75rem 1rem; background: rgba(76, 175, 80, 0.05);
      border: 1px solid rgba(76, 175, 80, 0.15); border-radius: var(--radius-md);
      margin-top: 1rem;
    }
    .clean-icon { font-size: 1.75rem; }
    .clean-title { font-size: 0.875rem; font-weight: 700; color: var(--accent-green); }
    .clean-desc { margin: 0.125rem 0 0 0; font-size: 0.75rem; color: var(--text-muted); }

    .alerts-list {
      display: flex; flex-direction: column; gap: 0.75rem; margin-top: 1rem;
    }
    .alert-item {
      display: flex; gap: 0.75rem; padding: 0.875rem 1rem;
      border-radius: var(--radius-md); border: 1px solid var(--border);
    }
    .alert-warning {
      background: rgba(255, 152, 0, 0.04);
      border-color: rgba(255, 152, 0, 0.15);
    }
    .alert-warning .alert-title { color: var(--accent-yellow); }
    .alert-info {
      background: rgba(92, 107, 192, 0.04);
      border-color: rgba(92, 107, 192, 0.15);
    }
    .alert-info .alert-title { color: var(--accent-blue-light); }

    .alert-icon { font-size: 1.25rem; flex-shrink: 0; }
    .alert-content { display: flex; flex-direction: column; gap: 0.25rem; flex: 1; }
    .alert-title { font-size: 0.8125rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.02em; }
    .alert-msg { margin: 0; font-size: 0.8125rem; color: var(--text-primary); line-height: 1.4; }

    .alert-txns {
      margin-top: 0.5rem; display: flex; flex-direction: column; gap: 0.375rem;
      border-top: 1px dashed var(--border); padding-top: 0.5rem;
    }
    .alert-txn-row {
      display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-secondary);
    }
  `]
})
export class AnomalyDetectorComponent implements OnInit {
  private api = inject(ApiService);

  anomalies = signal<AnomalyItem[]>([]);
  loading = signal(true);

  ngOnInit() {
    this.api.getAnomalies().subscribe({
      next: res => {
        this.loading.set(false);
        if (res.success && res.data) {
          this.anomalies.set(res.data);
        }
      },
      error: () => {
        this.loading.set(false);
      }
    });
  }
}

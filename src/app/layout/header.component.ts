import { Component, Input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  template: `
    <header class="app-header">
      <div class="header-left">
        <h1 class="page-title">{{ title }}</h1>
        @if (subtitle) {
          <p class="page-subtitle">{{ subtitle }}</p>
        }
      </div>
      <div class="header-right">
        <div class="header-date">
          <span class="date-icon">📅</span>
          <span>{{ currentDate }}</span>
        </div>
        <ng-content></ng-content>
      </div>
    </header>
  `,
  styles: [`
    .app-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1.5rem 2rem;
      border-bottom: 1px solid var(--border);
      background: var(--bg-secondary);
      flex-wrap: wrap;
      gap: 1rem;
    }
    .header-left { display: flex; flex-direction: column; gap: 0.25rem; }
    .page-title { font-size: 1.5rem; font-weight: 700; color: var(--text-primary); }
    .page-subtitle { font-size: 0.875rem; color: var(--text-muted); }
    .header-right { display: flex; align-items: center; gap: 1rem; }
    .header-date {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.8125rem;
      color: var(--text-muted);
      background: var(--bg-card);
      padding: 0.375rem 0.75rem;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border);
    }
  `]
})
export class HeaderComponent {
  @Input() title = '';
  @Input() subtitle = '';

  get currentDate(): string {
    return new Date().toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
  }
}

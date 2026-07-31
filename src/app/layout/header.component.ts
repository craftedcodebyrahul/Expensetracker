import { Component, Input, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LayoutService } from '../core/services/layout.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  template: `
    <header class="app-header">
      <div class="header-left">
        <button class="btn-hamburger" (click)="layout.toggleMobileMenu()" aria-label="Toggle menu">☰</button>
        <div class="title-area">
          <h1 class="page-title">{{ title }}</h1>
          @if (subtitle) {
            <p class="page-subtitle">{{ subtitle }}</p>
          }
        </div>
      </div>
      <div class="header-right">
        <div class="header-date mobile-hidden">
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
      padding: 1rem 2rem;
      border-bottom: 1px solid var(--border);
      background: var(--bg-secondary);
      flex-wrap: nowrap;
      gap: 1rem;
      position: relative;
      z-index: 100;
    }
    .header-left { display: flex; align-items: center; gap: 0.75rem; }
    .title-area { display: flex; flex-direction: column; gap: 0.125rem; }
    .page-title { font-size: 1.35rem; font-weight: 700; color: var(--text-primary); letter-spacing: -0.01em; }
    .page-subtitle { font-size: 0.8125rem; color: var(--text-muted); }
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

    /* Hamburger */
    .btn-hamburger {
      display: none;
      background: none;
      border: none;
      color: var(--text-secondary);
      font-size: 1.5rem;
      cursor: pointer;
      padding: 0.25rem;
      line-height: 1;
      border-radius: var(--radius-sm);
      transition: var(--transition);
    }
    .btn-hamburger:hover {
      color: var(--text-primary);
      background: var(--bg-card);
    }

    /* Responsive */
    @media (max-width: 640px) {
      .app-header {
        padding: 0.75rem 1rem;
        flex-wrap: wrap;
        gap: 0.75rem;
      }
      .header-left {
        flex: 1;
        min-width: 200px;
      }
      .header-right {
        width: 100%;
        margin-top: 0.25rem;
        flex-wrap: wrap;
        gap: 0.5rem;
        justify-content: flex-start;
      }
      .btn-hamburger { display: block; }
      .mobile-hidden { display: none; }
    }
  `]
})
export class HeaderComponent {
  layout = inject(LayoutService);

  @Input() title = '';
  @Input() subtitle = '';

  get currentDate(): string {
    return new Date().toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
  }
}

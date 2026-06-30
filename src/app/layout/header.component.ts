import { Component, Input, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LayoutService } from '../core/services/layout.service';
import { NotificationService } from '../core/services/notification.service';

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

        <!-- Notification Dropdown -->
        <div class="notification-container">
          <button class="btn-bell" (click)="toggleDropdown($event)" aria-label="Notifications" [class.has-unread]="notificationService.unreadCount() > 0">
            <span class="bell-icon">🔔</span>
            @if (notificationService.unreadCount() > 0) {
              <span class="badge-count">{{ notificationService.unreadCount() }}</span>
            }
          </button>

          @if (showDropdown()) {
            <div class="dropdown-backdrop" (click)="closeDropdown()"></div>

            <div class="dropdown-menu animate-slide-in">
              <div class="dropdown-header">
                <h3>Notifications</h3>
                @if (notificationService.unreadCount() > 0) {
                  <button class="btn-mark-all" (click)="markAllAsRead()">Mark all read</button>
                }
              </div>

              <div class="dropdown-body">
                @if (notificationService.notifications().length === 0) {
                  <div class="empty-notifications">
                    <span class="empty-icon">🔔</span>
                    <p>All caught up!</p>
                    <p class="empty-sub">We'll alert you about budget updates, low balances, and transaction activity.</p>
                  </div>
                } @else {
                  <div class="notifications-list">
                    @for (n of notificationService.notifications(); track n.id) {
                      <div class="notification-item" [class.unread]="!n.read" [class.critical]="n.type === 'critical'">
                        <div class="notification-indicator" [class]="'indicator-' + n.type"></div>
                        <div class="notification-content">
                          <span class="notification-title">{{ n.title }}</span>
                          <span class="notification-message">{{ n.message }}</span>
                          <span class="notification-time">{{ formatTime(n.createdAt) }}</span>
                        </div>
                        <div class="notification-actions">
                          @if (!n.read) {
                            <button class="action-btn btn-read" (click)="markAsRead(n.id)" title="Mark as read">✓</button>
                          }
                          <button class="action-btn btn-delete" (click)="deleteNotification(n.id)" title="Delete">🗑️</button>
                        </div>
                      </div>
                    }
                  </div>
                }
              </div>

              @if (notificationService.notifications().length > 0) {
                <div class="dropdown-footer">
                  <button class="btn-clear-all" (click)="clearAll()">Clear All</button>
                </div>
              }
            </div>
          }
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

    /* Notification Bell */
    .notification-container {
      position: relative;
    }
    .btn-bell {
      position: relative;
      background: var(--bg-card);
      border: 1px solid var(--border);
      color: var(--text-secondary);
      border-radius: 50%;
      width: 38px;
      height: 38px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 1.1rem;
      transition: var(--transition);
    }
    .btn-bell:hover {
      color: var(--text-primary);
      border-color: var(--border-light);
      background: var(--bg-card-hover);
    }
    .btn-bell.has-unread {
      color: var(--text-primary);
    }
    .badge-count {
      position: absolute;
      top: -2px;
      right: -2px;
      background: var(--accent-red);
      color: #fff;
      font-size: 0.65rem;
      font-weight: 700;
      border-radius: 100px;
      min-width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 4px;
      border: 2px solid var(--bg-secondary);
    }

    /* Backdrop */
    .dropdown-backdrop {
      position: fixed;
      inset: 0;
      z-index: 998;
      background: transparent;
    }

    /* Dropdown Menu */
    .dropdown-menu {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      width: 340px;
      background: rgba(30, 33, 48, 0.95);
      backdrop-filter: blur(12px);
      border: 1px solid var(--border-light);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-lg);
      z-index: 999;
      display: flex;
      flex-direction: column;
      max-height: 480px;
      overflow: hidden;
    }
    .dropdown-header {
      padding: 0.875rem 1rem;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .dropdown-header h3 {
      font-size: 0.9375rem;
      font-weight: 600;
      color: var(--text-primary);
    }
    .btn-mark-all {
      background: none;
      border: none;
      color: var(--accent-blue-light);
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-mark-all:hover {
      text-decoration: underline;
    }

    .dropdown-body {
      overflow-y: auto;
      flex: 1;
    }
    .empty-notifications {
      padding: 2.5rem 1.5rem;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
    }
    .empty-notifications .empty-icon {
      font-size: 2.25rem;
      opacity: 0.25;
      margin-bottom: 0.25rem;
    }
    .empty-notifications p {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--text-secondary);
    }
    .empty-notifications .empty-sub {
      font-size: 0.75rem;
      color: var(--text-muted);
      line-height: 1.4;
    }

    /* Notifications List */
    .notifications-list {
      display: flex;
      flex-direction: column;
    }
    .notification-item {
      display: flex;
      gap: 0.75rem;
      padding: 0.875rem 1rem;
      border-bottom: 1px solid var(--border);
      transition: var(--transition);
      position: relative;
    }
    .notification-item:hover {
      background: rgba(255, 255, 255, 0.02);
    }
    .notification-item.unread {
      background: rgba(92, 107, 192, 0.05);
    }
    .notification-item.critical.unread {
      background: rgba(239, 83, 80, 0.05);
    }
    .notification-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
      margin-top: 5px;
    }
    .indicator-info { background: var(--accent-blue-light); }
    .indicator-success { background: var(--accent-green); }
    .indicator-warning { background: var(--accent-yellow); }
    .indicator-critical { background: var(--accent-red); }

    .notification-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
      min-width: 0;
    }
    .notification-title {
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--text-primary);
    }
    .notification-message {
      font-size: 0.75rem;
      color: var(--text-secondary);
      line-height: 1.4;
      word-break: break-word;
    }
    .notification-time {
      font-size: 0.6875rem;
      color: var(--text-muted);
      margin-top: 0.25rem;
    }

    .notification-actions {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
      opacity: 0;
      transition: var(--transition);
    }
    .notification-item:hover .notification-actions {
      opacity: 1;
    }
    .action-btn {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 0.125rem;
      font-size: 0.8125rem;
      line-height: 1;
      transition: var(--transition);
    }
    .action-btn:hover {
      color: var(--text-primary);
    }
    .btn-delete:hover {
      color: var(--accent-red);
    }

    .dropdown-footer {
      padding: 0.625rem 1rem;
      border-top: 1px solid var(--border);
      text-align: center;
      background: rgba(26, 29, 39, 0.4);
    }
    .btn-clear-all {
      background: none;
      border: none;
      color: var(--text-muted);
      font-size: 0.75rem;
      font-weight: 500;
      cursor: pointer;
      transition: var(--transition);
    }
    .btn-clear-all:hover {
      color: var(--text-secondary);
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

      .dropdown-menu {
        position: fixed;
        top: 56px;
        right: 12px;
        left: 12px;
        width: auto;
        max-width: none;
        max-height: 80vh;
      }
    }
  `]
})
export class HeaderComponent {
  layout = inject(LayoutService);
  notificationService = inject(NotificationService);

  @Input() title = '';
  @Input() subtitle = '';

  showDropdown = signal(false);

  get currentDate(): string {
    return new Date().toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
  }

  toggleDropdown(event: Event) {
    event.stopPropagation();
    this.showDropdown.update(v => !v);
  }

  closeDropdown() {
    this.showDropdown.set(false);
  }

  markAsRead(id: string) {
    this.notificationService.markAsRead(id);
  }

  markAllAsRead() {
    this.notificationService.markAllAsRead();
  }

  deleteNotification(id: string) {
    this.notificationService.delete(id);
  }

  clearAll() {
    this.notificationService.clearAll();
  }

  formatTime(isoString: string): string {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }
}

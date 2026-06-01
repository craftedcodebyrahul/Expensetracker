import { Component, signal, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ApiService } from '../core/services/api.service';
import { AuthService } from '../core/services/auth.service';

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, CommonModule],
  template: `
    <aside class="sidebar" [class.collapsed]="collapsed()">

      <!-- Logo -->
      <div class="sidebar-logo">
        <img src="logo.svg" alt="TCFlow logo" class="logo-img">
        @if (!collapsed()) {
          <div class="logo-text">
            <span class="logo-title">TC<span class="logo-accent">Flow</span></span>
          </div>
        }
        <button class="collapse-btn" (click)="toggleCollapse()"
                [title]="collapsed() ? 'Expand sidebar' : 'Collapse sidebar'"
                aria-label="Toggle sidebar">
          {{ collapsed() ? '›' : '‹' }}
        </button>
      </div>

      <!-- Sheets sync status -->
      @if (!collapsed()) {
        <div class="sync-status" [class.connected]="syncConnected()">
          <span class="sync-dot"></span>
          <span class="sync-label">{{ syncConnected() ? 'Sheets Connected' : 'Connecting...' }}</span>
        </div>
      }

      <!-- Navigation -->
      <nav class="sidebar-nav" aria-label="Main navigation">
        @for (item of navItems; track item.path) {
          <a [routerLink]="item.path"
             routerLinkActive="active"
             [routerLinkActiveOptions]="{ exact: item.path === '/' }"
             class="nav-item"
             [title]="collapsed() ? item.label : ''">
            <span class="nav-icon" aria-hidden="true">{{ item.icon }}</span>
            @if (!collapsed()) {
              <span class="nav-label">{{ item.label }}</span>
            }
          </a>
        }
      </nav>

      <!-- Bottom: settings + user profile -->
      <div class="sidebar-bottom">
        <a routerLink="/settings" routerLinkActive="active" class="nav-item"
           [title]="collapsed() ? 'Settings' : ''">
          <span class="nav-icon" aria-hidden="true">⚙️</span>
          @if (!collapsed()) { <span class="nav-label">Settings</span> }
        </a>

        <!-- User profile strip -->
        @if (auth.user()) {
          <div class="user-strip" [class.collapsed]="collapsed()">
            <img [src]="auth.user()!.picture || avatarFallback()"
                 [alt]="auth.user()!.name"
                 class="user-avatar"
                 (error)="onAvatarError($event)">
            @if (!collapsed()) {
              <div class="user-info">
                <span class="user-name">{{ auth.user()!.name }}</span>
                <span class="user-email">{{ auth.user()!.email }}</span>
              </div>
              <button class="logout-btn" (click)="logout()" title="Sign out" aria-label="Sign out">
                <span>↩</span>
              </button>
            }
          </div>
        }
      </div>
    </aside>
  `,
  styles: [`
    .sidebar {
      width: 240px;
      min-height: 100vh;
      background: var(--bg-secondary);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      transition: width 0.3s ease;
      position: sticky;
      top: 0;
      flex-shrink: 0;
      overflow: visible;
    }
    .sidebar.collapsed { width: 64px; }

    /* Logo */
    .sidebar-logo {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 1rem;
      border-bottom: 1px solid var(--border);
      position: relative;
      flex-shrink: 0;
      min-height: 60px;
      overflow: hidden;
    }
    .logo-img { width: 32px; height: 32px; flex-shrink: 0; }
    .logo-text { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
    .logo-title { font-size: 1.15rem; font-weight: 800; color: var(--text-primary); white-space: nowrap; letter-spacing: -0.02em; }
    .logo-accent { color: var(--accent-blue-light); }

    /* Toggle button — always visible, floats outside when collapsed */
    .collapse-btn {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      color: var(--text-secondary);
      width: 22px;
      height: 22px;
      border-radius: 50%;
      cursor: pointer;
      font-size: 0.875rem;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: var(--transition);
      position: absolute;
      right: -11px;
      top: 50%;
      transform: translateY(-50%);
      z-index: 10;
      box-shadow: 0 1px 4px rgba(0,0,0,0.4);
    }
    .collapse-btn:hover { background: var(--accent-blue); color: #fff; border-color: var(--accent-blue); }
    .collapsed .sidebar-logo { justify-content: center; padding: 1rem 0.5rem; }

    /* Sync status */
    .sync-status {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      font-size: 0.75rem;
      color: var(--text-muted);
      flex-shrink: 0;
    }
    .sync-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--accent-yellow);
      flex-shrink: 0;
      animation: pulse 2s infinite;
    }
    .sync-status.connected .sync-dot {
      background: var(--accent-green);
      box-shadow: 0 0 6px var(--accent-green);
      animation: none;
    }
    .sync-status.connected .sync-label { color: var(--accent-green); }

    /* Nav */
    .sidebar-nav {
      flex: 1;
      padding: 0.75rem 0.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      overflow-y: auto;
      overflow-x: hidden;
    }
    .nav-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.625rem 0.75rem;
      border-radius: var(--radius-sm);
      color: var(--text-secondary);
      text-decoration: none;
      font-size: 0.875rem;
      font-weight: 500;
      transition: var(--transition);
      white-space: nowrap;
      overflow: hidden;
      cursor: pointer;
      border: none;
      background: none;
      width: 100%;
      text-align: left;
      font-family: inherit;
    }
    .nav-item:hover { background: var(--bg-card); color: var(--text-primary); }
    .nav-item.active { background: rgba(92, 107, 192, 0.15); color: var(--accent-blue-light); }
    .nav-icon { font-size: 1.1rem; flex-shrink: 0; width: 20px; text-align: center; }
    .nav-label { overflow: hidden; text-overflow: ellipsis; }

    /* Bottom */
    .sidebar-bottom {
      padding: 0.5rem;
      border-top: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      flex-shrink: 0;
      overflow: hidden;
    }

    /* User strip */
    .user-strip {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      padding: 0.625rem 0.75rem;
      border-radius: var(--radius-sm);
      margin-top: 0.25rem;
      background: var(--bg-card);
      border: 1px solid var(--border);
    }
    .user-strip.collapsed { justify-content: center; padding: 0.5rem; }
    .user-avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      object-fit: cover;
      flex-shrink: 0;
      border: 2px solid var(--border-light);
    }
    .user-info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
    }
    .user-name {
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .user-email {
      font-size: 0.7rem;
      color: var(--text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .logout-btn {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 0.25rem;
      border-radius: 4px;
      font-size: 1rem;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: var(--transition);
      flex-shrink: 0;
    }
    .logout-btn:hover { color: var(--accent-red); background: rgba(239, 83, 80, 0.1); }
  `]
})
export class SidebarComponent {
  private api = inject(ApiService);
  auth = inject(AuthService);

  collapsed = signal(false);
  syncConnected = signal(false);

  navItems: NavItem[] = [
    { path: '/dashboard',    label: 'Dashboard',    icon: '📊' },
    { path: '/quick-log',    label: 'Quick Log',    icon: '⚡' },
    { path: '/transactions', label: 'Transactions', icon: '💳' },
    { path: '/insights',     label: 'Insights',     icon: '🔮' },
    { path: '/budgets',      label: 'Budgets',      icon: '🎯' },
    { path: '/categories',   label: 'Categories',   icon: '🏷️' },
    { path: '/reports',      label: 'Reports',      icon: '📈' },
  ];

  constructor() {
    this.checkSyncStatus();
  }

  toggleCollapse() {
    this.collapsed.update(v => !v);
  }

  logout() {
    this.auth.logout();
  }

  avatarFallback(): string {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(this.auth.user()?.name ?? 'U')}&background=5c6bc0&color=fff&size=64`;
  }

  onAvatarError(event: Event) {
    (event.target as HTMLImageElement).src = this.avatarFallback();
  }

  private checkSyncStatus() {
    this.api.syncStatus().subscribe({
      next: res => this.syncConnected.set(res.success && res.data?.connected),
      error: () => this.syncConnected.set(false)
    });
  }
}

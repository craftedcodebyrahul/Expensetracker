import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ApiService } from '../core/services/api.service';
import { AuthService } from '../core/services/auth.service';
import { LayoutService } from '../core/services/layout.service';

interface NavItem { path: string; label: string; icon: string; }

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, CommonModule],
  template: `
    <!-- Mobile backdrop overlay — tap to close -->
    @if (layout.mobileMenuOpen()) {
      <div class="mobile-backdrop" (click)="layout.toggleMobileMenu()" aria-hidden="true"></div>
    }

    <aside class="sidebar"
           [class.collapsed]="layout.collapsed()"
           [class.mobile-open]="layout.mobileMenuOpen()">

      <!-- Logo -->
      <div class="sidebar-logo" [class.collapsed-logo]="layout.collapsed() && !layout.mobileMenuOpen()">
        @if (!layout.collapsed() || layout.mobileMenuOpen()) {
          <div class="logo-brand">
            <img src="logo.svg" alt="TCFlow" class="logo-img">
            <span class="logo-title">TC<span class="logo-accent">Flow</span></span>
          </div>
          <button class="desktop-toggle-btn" (click)="layout.toggle()" aria-label="Collapse sidebar" title="Collapse sidebar">☰</button>
        } @else {
          <button class="desktop-toggle-btn collapsed" (click)="layout.toggle()" aria-label="Expand sidebar" title="Expand sidebar">☰</button>
        }
        <!-- Close button only visible on mobile -->
        <button class="mobile-close-btn" (click)="layout.toggleMobileMenu()" aria-label="Close menu">✕</button>
      </div>

      <!-- DB status -->
      @if (!layout.collapsed() || layout.mobileMenuOpen()) {
        <div class="sync-status" [class.connected]="syncConnected()">
          <span class="sync-dot"></span>
          <span class="sync-label">{{ syncConnected() ? 'DB Connected' : 'Connecting...' }}</span>
        </div>
      }

      <!-- Navigation -->
      <nav class="sidebar-nav" aria-label="Main navigation">
        @for (item of navItems; track item.path) {
          <a [routerLink]="item.path"
             routerLinkActive="active"
             [routerLinkActiveOptions]="{ exact: item.path === '/dashboard' }"
             class="nav-item"
             [title]="item.label"
             (click)="closeOnMobile()">
            <span class="material-symbols-outlined nav-icon" aria-hidden="true">{{ item.icon }}</span>
            @if (!layout.collapsed() || layout.mobileMenuOpen()) {
              <span class="nav-label">{{ item.label }}</span>
            }
          </a>
        }
      </nav>

      <!-- Bottom -->
      <div class="sidebar-bottom">
        <a routerLink="/settings" routerLinkActive="active" class="nav-item" title="Settings" (click)="closeOnMobile()">
          <span class="material-symbols-outlined nav-icon" aria-hidden="true">settings</span>
          @if (!layout.collapsed() || layout.mobileMenuOpen()) { <span class="nav-label">Settings</span> }
        </a>

        @if (auth.user()) {
          <div class="user-strip">
            <img [src]="auth.user()!.picture || avatarFallback()"
                 [alt]="auth.user()!.name"
                 class="user-avatar"
                 (error)="onAvatarError($event)">
            @if (!layout.collapsed() || layout.mobileMenuOpen()) {
              <div class="user-info">
                <span class="user-name">{{ auth.user()!.name }}</span>
                <span class="user-email">{{ auth.user()!.email }}</span>
              </div>
              <button class="material-symbols-outlined logout-btn" (click)="logout()" title="Sign out" aria-label="Sign out">logout</button>
            }
          </div>
        }
      </div>
    </aside>
  `,
  styles: [`
    /* ── Desktop sidebar ──────────────────────────────────────────── */
    .sidebar {
      width: 240px;
      height: 100vh;
      background: linear-gradient(180deg, var(--bg-secondary) 0%, rgba(var(--accent-rgb, 92, 107, 192), 0.03) 100%);
      backdrop-filter: blur(20px);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      transition: width 0.25s ease;
      position: sticky;
      top: 0;
      flex-shrink: 0;
      overflow: hidden;
      z-index: 300;
    }
    .sidebar.collapsed { width: 56px; }

    /* Mobile close button — hidden on desktop */
    .mobile-close-btn {
      display: none;
      margin-left: auto;
      background: none;
      border: none;
      color: var(--text-muted);
      font-size: 1rem;
      cursor: pointer;
      padding: 0.25rem;
      line-height: 1;
      flex-shrink: 0;
    }
    .mobile-close-btn:hover { color: var(--accent-red); }

    /* Backdrop — hidden on desktop */
    .mobile-backdrop { display: none; }

    /* ── Tablet: auto-collapse sidebar ───────────────────────────── */
    @media (max-width: 1024px) and (min-width: 641px) {
      .sidebar { width: 56px; }
    }

    /* ── Mobile: slide-in drawer ─────────────────────────────────── */
    @media (max-width: 640px) {
      .sidebar {
        position: fixed;
        top: 0;
        left: 0;
        height: 100vh;
        width: 260px;
        transform: translateX(-100%);
        transition: transform 0.3s ease;
        box-shadow: var(--shadow-lg);
        z-index: 400;
      }
      .sidebar.mobile-open {
        transform: translateX(0);
      }
      /* Force labels visible inside mobile drawer regardless of collapsed state */
      .sidebar.mobile-open .nav-label { display: inline !important; }
      .sidebar.mobile-open .logo-title { display: inline !important; }
      .sidebar.mobile-open .sync-status { display: flex !important; }
      .sidebar.mobile-open .user-info { display: flex !important; }
      .sidebar.mobile-open .logout-btn { display: flex !important; }
      .mobile-close-btn { display: block; }
      .mobile-backdrop {
        display: block;
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 399;
        animation: fadeIn 0.2s ease;
      }
    }

    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

    /* ── Logo ───────────────────────────────────────────────────── */
    .sidebar-logo {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.875rem 1rem;
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
      min-height: 56px;
      overflow: hidden;
      width: 100%;
    }
    .sidebar-logo.collapsed-logo {
      justify-content: center;
      padding: 0.875rem 0;
    }
    .logo-brand {
      display: flex;
      align-items: center;
      gap: 0.625rem;
    }
    .logo-img { width: 28px; height: 28px; flex-shrink: 0; }
    .logo-title { font-size: 1.1rem; font-weight: 800; color: var(--text-primary); white-space: nowrap; letter-spacing: -0.02em; }
    .logo-accent { color: var(--accent-blue-light); }

    /* Desktop toggle button inside sidebar logo header */
    .desktop-toggle-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      background: none;
      border: none;
      color: var(--text-secondary);
      font-size: 1.25rem;
      cursor: pointer;
      padding: 0.25rem;
      border-radius: var(--radius-sm);
      transition: var(--transition);
      line-height: 1;
      width: 32px;
      height: 32px;
      flex-shrink: 0;
    }
    .desktop-toggle-btn:hover {
      color: var(--text-primary);
      background: var(--bg-card);
    }
    @media (max-width: 640px) {
      .desktop-toggle-btn {
        display: none;
      }
    }

    /* ── Sync status ─────────────────────────────────────────────── */
    .sync-status {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      font-size: 0.75rem;
      color: var(--text-muted);
      flex-shrink: 0;
    }
    .sync-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent-yellow); flex-shrink: 0; animation: pulse 2s infinite; }
    .sync-status.connected .sync-dot { background: var(--accent-green); box-shadow: 0 0 5px var(--accent-green); animation: none; }
    .sync-status.connected .sync-label { color: var(--accent-green); }

    /* ── Navigation ──────────────────────────────────────────────── */
    .sidebar-nav {
      flex: 1;
      padding: 0.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
      overflow-y: auto;
      overflow-x: hidden;
    }
    .nav-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.625rem 0.625rem;
      border-radius: var(--radius-sm);
      color: var(--text-secondary);
      text-decoration: none;
      font-size: 0.875rem;
      font-weight: 500;
      transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.2s ease, color 0.2s ease;
      white-space: nowrap;
      overflow: hidden;
      border: none;
      background: none;
      width: 100%;
      text-align: left;
      font-family: inherit;
      cursor: pointer;
    }
    .nav-item:hover {
      background: var(--bg-card);
      color: var(--text-primary);
      transform: translateX(4px);
    }
    .nav-item:active {
      transform: scale(0.97) translateX(4px);
    }
    .nav-item.active { background: rgba(92,107,192,0.15); color: var(--accent-blue-light); }
    .nav-icon { font-size: 1.1rem; flex-shrink: 0; width: 20px; text-align: center; }
    .nav-label { overflow: hidden; text-overflow: ellipsis; }

    /* ── Bottom ──────────────────────────────────────────────────── */
    .sidebar-bottom {
      padding: 0.5rem;
      border-top: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      flex-shrink: 0;
      overflow: hidden;
    }
    .user-strip {
      display: flex; align-items: center; gap: 0.5rem;
      padding: 0.5rem 0.625rem;
      border-radius: var(--radius-sm);
      background: var(--bg-card);
      border: 1px solid var(--border);
      overflow: hidden;
    }
    .user-avatar { width: 30px; height: 30px; border-radius: 50%; object-fit: cover; flex-shrink: 0; border: 2px solid var(--border-light); }
    .user-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .user-name { font-size: 0.8rem; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .user-email { font-size: 0.7rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .logout-btn { background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 0.25rem; border-radius: 4px; font-size: 1rem; transition: var(--transition); flex-shrink: 0; }
    .logout-btn:hover { color: var(--accent-red); background: rgba(239,83,80,0.1); }
  `]
})
export class SidebarComponent {
  private api = inject(ApiService);
  auth = inject(AuthService);
  layout = inject(LayoutService);

  syncConnected = signal(false);

  navItems: NavItem[] = [
    { path: '/dashboard',      label: 'Dashboard',      icon: 'grid_view' },
    { path: '/quick-log',      label: 'Quick Log',      icon: 'bolt' },
    { path: '/transactions',   label: 'Transactions',   icon: 'credit_card' },
    { path: '/accounts',       label: 'Accounts',       icon: 'account_balance' },
    { path: '/insights',       label: 'Insights',       icon: 'online_prediction' },
    { path: '/budgets',        label: 'Budgets',        icon: 'track_changes' },
    { path: '/goals',          label: 'Goals',          icon: 'emoji_events' },
    { path: '/savings-simulator', label: 'Savings Simulator', icon: 'balance' },
    { path: '/bills-calendar', label: 'Upcoming Bills', icon: 'calendar_month' },
    { path: '/categories',     label: 'Categories',     icon: 'sell' },
    { path: '/reports',        label: 'Reports',        icon: 'show_chart' },
  ];

  constructor() {
    this.api.syncStatus().subscribe({
      next: res => this.syncConnected.set(res.success && res.data?.connected),
      error: () => this.syncConnected.set(false)
    });
  }

  /** Close the mobile drawer after navigation */
  closeOnMobile() {
    if (this.layout.mobileMenuOpen()) {
      this.layout.toggleMobileMenu();
    }
  }

  logout() { this.auth.logout(); }
  avatarFallback() { return `https://ui-avatars.com/api/?name=${encodeURIComponent(this.auth.user()?.name ?? 'U')}&background=5c6bc0&color=fff&size=64`; }
  onAvatarError(e: Event) { (e.target as HTMLImageElement).src = this.avatarFallback(); }
}

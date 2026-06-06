import { Component, inject } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { filter, map } from 'rxjs/operators';
import { toSignal } from '@angular/core/rxjs-interop';
import { SidebarComponent } from './layout/sidebar.component';
import { ToastComponent } from './shared/components/toast.component';
import { AuthService } from './core/services/auth.service';
import { LayoutService } from './core/services/layout.service';

// Routes that use full-page layout (no sidebar)
const PUBLIC_ROUTES = ['', 'login', 'privacy', 'terms'];

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, ToastComponent, CommonModule],
  template: `
    @if (showSidebar()) {
      <div class="app-layout">
        <app-sidebar></app-sidebar>

        <!-- Desktop collapse toggle — hidden on mobile (hamburger in header takes over) -->
        <button
          class="sidebar-toggle"
          [class.collapsed]="layout.collapsed()"
          (click)="layout.toggle()"
          [attr.aria-label]="layout.collapsed() ? 'Expand sidebar' : 'Collapse sidebar'"
          [title]="layout.collapsed() ? 'Expand sidebar' : 'Collapse sidebar'">
          {{ layout.collapsed() ? '›' : '‹' }}
        </button>

        <main class="app-main">
          <router-outlet></router-outlet>
        </main>
      </div>
    } @else {
      <router-outlet></router-outlet>
    }
    <app-toast></app-toast>
  `,
  styles: [`
    .app-layout {
      display: flex;
      min-height: 100vh;
      position: relative;
    }
    .app-main {
      flex: 1;
      min-width: 0;
      overflow-y: auto;
    }

    /* Desktop collapse toggle */
    .sidebar-toggle {
      position: fixed;
      top: 20px;
      left: calc(240px - 12px);
      z-index: 200;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: var(--bg-secondary);
      border: 1px solid var(--border-light);
      color: var(--text-secondary);
      cursor: pointer;
      font-size: 1rem;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: left 0.25s ease, background 0.15s ease, color 0.15s ease;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    }
    .sidebar-toggle.collapsed {
      left: calc(56px - 12px);
    }
    .sidebar-toggle:hover {
      background: var(--accent-blue);
      color: #fff;
      border-color: var(--accent-blue);
    }

    /* Hide desktop toggle on mobile — hamburger in header takes over */
    @media (max-width: 640px) {
      .sidebar-toggle { display: none; }
    }
    /* On tablet sidebar is always collapsed so adjust toggle position */
    @media (max-width: 1024px) and (min-width: 641px) {
      .sidebar-toggle { left: calc(56px - 12px); }
    }
  `]
})
export class App {
  auth = inject(AuthService);
  layout = inject(LayoutService);
  private router = inject(Router);

  private currentPath = toSignal(
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      map(e => (e as NavigationEnd).urlAfterRedirects.split('?')[0].replace(/^\//, ''))
    ),
    { initialValue: '' }
  );

  showSidebar() {
    const path = this.currentPath();
    return this.auth.isLoggedIn && !PUBLIC_ROUTES.includes(path);
  }
}

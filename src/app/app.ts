import { Component, inject } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { filter, map } from 'rxjs/operators';
import { toSignal } from '@angular/core/rxjs-interop';
import { SidebarComponent } from './layout/sidebar.component';
import { AiCoachDrawerComponent } from './shared/components/ai-coach-drawer.component';
import { AuthService } from './core/services/auth.service';
import { LayoutService } from './core/services/layout.service';

// Routes that use full-page layout (no sidebar)
const PUBLIC_ROUTES = ['', 'login', 'privacy', 'terms'];

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, AiCoachDrawerComponent, CommonModule],
  template: `
    @if (showSidebar()) {
      <div class="app-layout">
        <app-sidebar></app-sidebar>

        <main class="app-main">
          <router-outlet></router-outlet>
        </main>
      </div>
    } @else {
      <router-outlet></router-outlet>
    }
    <app-ai-coach-drawer></app-ai-coach-drawer>

    @if (auth.isLoggedIn && showSidebar()) {
      <button class="btn-floating-coach" (click)="layout.toggleAiCoach()" aria-label="Toggle AI Coach">
        💬 AI Coach
      </button>
    }
  `,
  styles: [`
    .app-layout {
      display: flex;
      height: 100vh;
      overflow: hidden;
      position: relative;
    }
    .app-main {
      flex: 1;
      min-width: 0;
      overflow-y: auto;
    }
    .btn-floating-coach {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: var(--accent-blue);
      color: #fff;
      border: none;
      border-radius: 30px;
      padding: 0.75rem 1.25rem;
      font-weight: 600;
      font-size: 0.875rem;
      box-shadow: 0 4px 16px rgba(92, 107, 192, 0.4);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      z-index: 999;
      transition: var(--transition);
    }
    .btn-floating-coach:hover {
      background: var(--accent-blue-light);
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(92, 107, 192, 0.5);
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

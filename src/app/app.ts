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
      height: 100vh;
      overflow: hidden;
      position: relative;
    }
    .app-main {
      flex: 1;
      min-width: 0;
      overflow-y: auto;
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

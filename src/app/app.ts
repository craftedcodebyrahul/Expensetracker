import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { SidebarComponent } from './layout/sidebar.component';
import { ToastComponent } from './shared/components/toast.component';
import { AuthService } from './core/services/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, ToastComponent, CommonModule],
  template: `
    @if (auth.isLoggedIn) {
      <!-- Authenticated: sidebar + routed content -->
      <div class="app-layout">
        <app-sidebar></app-sidebar>
        <main class="app-main">
          <router-outlet></router-outlet>
        </main>
      </div>
    } @else {
      <!-- Unauthenticated: full-page router outlet (login page) -->
      <router-outlet></router-outlet>
    }
    <app-toast></app-toast>
  `,
  styles: [`
    .app-layout { display: flex; min-height: 100vh; }
    .app-main { flex: 1; min-width: 0; overflow-y: auto; }
  `]
})
export class App {
  // Auth is already initialized by APP_INITIALIZER before this component renders.
  // No need for ngOnInit — just read the signal directly.
  auth = inject(AuthService);
}

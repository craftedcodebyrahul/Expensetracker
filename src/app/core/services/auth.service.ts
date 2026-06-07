import { Injectable, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap, catchError, of } from 'rxjs';

export interface AuthUser {
  userId: string;
  email: string;
  name: string;
  picture: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private platformId = inject(PLATFORM_ID);

  readonly user = signal<AuthUser | null>(null);
  // initialized is still used by guards as a safety net
  readonly initialized = signal(false);

  /**
   * Called by APP_INITIALIZER — completes before any routing happens.
   * Hits /auth/me to restore an existing session cookie.
   */
  init() {
    // SSR has no access to the browser's session cookie — calling /auth/me
    // from the server always returns null and that null gets baked into the
    // pre-rendered HTML. When the client hydrates it reuses that null state
    // and the authGuard immediately redirects to /login even for logged-in users.
    // Fix: skip the HTTP call during SSR; the browser will always call /auth/me
    // with its real session cookie during client-side bootstrap.
    if (!isPlatformBrowser(this.platformId)) {
      this.initialized.set(true);
      return of(null);
    }

    return this.http.get<{ success: boolean; data: AuthUser | null }>('/auth/me').pipe(
      tap(res => {
        this.user.set(res.data ?? null);
        this.initialized.set(true);
      }),
      catchError(() => {
        this.user.set(null);
        this.initialized.set(true);
        return of(null);
      })
    );
  }

  /** Redirect browser to Google OAuth — no-op during SSR */
  loginWithGoogle() {
    if (isPlatformBrowser(this.platformId)) {
      window.location.href = '/auth/google';
    }
  }

  /** POST logout, clear state, go to home */
  logout() {
    this.http.post('/auth/logout', {}).subscribe(() => {
      this.user.set(null);
      this.initialized.set(true);
      this.router.navigate(['/']);
    });
  }

  get isLoggedIn(): boolean {
    return this.user() !== null;
  }
}

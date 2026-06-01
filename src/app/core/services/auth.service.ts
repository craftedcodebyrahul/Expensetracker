import { Injectable, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap, catchError, of } from 'rxjs';

export interface AuthUser {
  email: string;
  name: string;
  picture: string;
  spreadsheetId: string;
  tokenExpiry: number;
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

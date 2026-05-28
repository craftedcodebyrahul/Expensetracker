import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="login-page">
      <!-- Background decoration -->
      <div class="bg-orb bg-orb-1"></div>
      <div class="bg-orb bg-orb-2"></div>
      <div class="bg-orb bg-orb-3"></div>

      <div class="login-card">
        <!-- Logo -->
        <div class="login-logo">
          <div class="logo-icon-lg">💰</div>
          <div>
            <h1 class="logo-name">FinTrack <span class="logo-pro">Pro</span></h1>
            <p class="logo-tagline">Your personal finance command center</p>
          </div>
        </div>

        <!-- Error banner -->
        @if (authError()) {
          <div class="error-banner" role="alert">
            <span>⚠️</span>
            <span>{{ friendlyError(authError()!) }}</span>
          </div>
        }

        <!-- Features list -->
        <div class="features-list">
          @for (f of features; track f.icon) {
            <div class="feature-item">
              <span class="feature-icon">{{ f.icon }}</span>
              <span class="feature-text">{{ f.text }}</span>
            </div>
          }
        </div>

        <!-- Sign in button -->
        <button class="google-btn" (click)="signIn()" [disabled]="signingIn()">
          @if (signingIn()) {
            <div class="btn-spinner"></div>
            <span>Redirecting to Google...</span>
          } @else {
            <svg class="google-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span>Continue with Google</span>
          }
        </button>

        <!-- Privacy note -->
        <p class="privacy-note">
          By signing in, you authorize FinTrack Pro to create and manage a Google Spreadsheet
          in your Drive to store your financial data. Your data stays in your own Google account.
        </p>

        <!-- Divider -->
        <div class="login-divider">
          <span>What happens when you sign in</span>
        </div>

        <!-- Steps -->
        <div class="steps-list">
          @for (step of steps; track step.num) {
            <div class="step-item">
              <div class="step-num">{{ step.num }}</div>
              <div class="step-info">
                <span class="step-title">{{ step.title }}</span>
                <span class="step-desc">{{ step.desc }}</span>
              </div>
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    .login-page {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bg-primary);
      padding: 2rem;
      position: relative;
      overflow: hidden;
    }

    /* Animated background orbs */
    .bg-orb {
      position: absolute;
      border-radius: 50%;
      filter: blur(80px);
      opacity: 0.15;
      animation: float 8s ease-in-out infinite;
    }
    .bg-orb-1 { width: 400px; height: 400px; background: var(--accent-blue); top: -100px; left: -100px; animation-delay: 0s; }
    .bg-orb-2 { width: 300px; height: 300px; background: var(--accent-green); bottom: -50px; right: -50px; animation-delay: 3s; }
    .bg-orb-3 { width: 250px; height: 250px; background: var(--accent-purple); top: 50%; left: 60%; animation-delay: 6s; }
    @keyframes float {
      0%, 100% { transform: translateY(0) scale(1); }
      50% { transform: translateY(-20px) scale(1.05); }
    }

    .login-card {
      background: var(--bg-card);
      border: 1px solid var(--border-light);
      border-radius: var(--radius-xl);
      padding: 2.5rem;
      width: 100%;
      max-width: 480px;
      position: relative;
      z-index: 1;
      box-shadow: var(--shadow-lg), 0 0 60px rgba(92, 107, 192, 0.1);
    }

    .login-logo {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .logo-icon-lg { font-size: 3rem; }
    .logo-name { font-size: 1.75rem; font-weight: 800; color: var(--text-primary); line-height: 1; }
    .logo-pro { color: var(--accent-blue-light); }
    .logo-tagline { font-size: 0.875rem; color: var(--text-muted); margin-top: 0.25rem; }

    .error-banner {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      background: rgba(239, 83, 80, 0.1);
      border: 1px solid rgba(239, 83, 80, 0.3);
      border-radius: var(--radius-md);
      padding: 0.875rem 1rem;
      margin-bottom: 1.5rem;
      font-size: 0.875rem;
      color: var(--accent-red-light);
    }

    .features-list {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.625rem;
      margin-bottom: 2rem;
    }
    .feature-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.625rem 0.75rem;
      background: var(--bg-input);
      border-radius: var(--radius-sm);
      font-size: 0.8125rem;
      color: var(--text-secondary);
    }
    .feature-icon { font-size: 1rem; flex-shrink: 0; }

    .google-btn {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.875rem;
      padding: 0.875rem 1.5rem;
      background: #fff;
      color: #3c4043;
      border: none;
      border-radius: var(--radius-md);
      font-size: 1rem;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      transition: var(--transition);
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      margin-bottom: 1rem;
    }
    .google-btn:hover:not(:disabled) {
      background: #f8f9fa;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
      transform: translateY(-1px);
    }
    .google-btn:disabled { opacity: 0.7; cursor: not-allowed; }
    .google-icon { width: 20px; height: 20px; flex-shrink: 0; }
    .btn-spinner {
      width: 18px;
      height: 18px;
      border: 2px solid rgba(60,64,67,0.3);
      border-top-color: #3c4043;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      flex-shrink: 0;
    }

    .privacy-note {
      font-size: 0.75rem;
      color: var(--text-muted);
      text-align: center;
      line-height: 1.5;
      margin-bottom: 1.5rem;
    }

    .login-divider {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1.25rem;
    }
    .login-divider::before, .login-divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--border);
    }
    .login-divider span { font-size: 0.75rem; color: var(--text-muted); white-space: nowrap; }

    .steps-list { display: flex; flex-direction: column; gap: 0.75rem; }
    .step-item { display: flex; align-items: flex-start; gap: 0.875rem; }
    .step-num {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: rgba(92, 107, 192, 0.2);
      color: var(--accent-blue-light);
      font-size: 0.75rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      margin-top: 1px;
    }
    .step-info { display: flex; flex-direction: column; gap: 0.125rem; }
    .step-title { font-size: 0.8125rem; font-weight: 600; color: var(--text-primary); }
    .step-desc { font-size: 0.75rem; color: var(--text-muted); }

    @media (max-width: 480px) {
      .login-card { padding: 1.75rem 1.25rem; }
      .features-list { grid-template-columns: 1fr; }
    }
  `]
})
export class LoginComponent implements OnInit {
  private route = inject(ActivatedRoute);
  authService = inject(AuthService);

  signingIn = signal(false);
  authError = signal<string | null>(null);

  features = [
    { icon: '📊', text: 'Dashboard & charts' },
    { icon: '💳', text: 'Track transactions' },
    { icon: '🎯', text: 'Budget management' },
    { icon: '📈', text: 'Financial reports' },
    { icon: '🏷️', text: 'Custom categories' },
    { icon: '🔒', text: 'Your data, your Drive' },
  ];

  steps = [
    { num: '1', title: 'Sign in with Google', desc: 'Securely authenticate with your Google account' },
    { num: '2', title: 'Spreadsheet created', desc: 'A "FinTrack Pro" spreadsheet is created in your Drive' },
    { num: '3', title: 'Start tracking', desc: 'Add transactions — everything syncs to your spreadsheet' },
  ];

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      if (params['auth_error']) {
        this.authError.set(params['auth_error']);
      }
    });
  }

  signIn() {
    this.signingIn.set(true);
    this.authService.loginWithGoogle();
  }

  friendlyError(error: string): string {
    const map: Record<string, string> = {
      'access_denied': 'You denied access. Please try again and allow the required permissions.',
      'invalid_state': 'Security check failed. Please try signing in again.',
      'no_profile': 'Could not retrieve your Google profile. Please try again.',
    };
    return map[error] ?? `Sign-in failed: ${error}. Please try again.`;
  }
}

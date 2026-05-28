import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  // ── Public ──────────────────────────────────────────────────────────────────
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.component').then(m => m.LoginComponent),
    canActivate: [guestGuard],
    title: 'Sign In — FinTrack Pro'
  },

  // ── Protected (require Google login) ────────────────────────────────────────
  {
    path: '',
    loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
    canActivate: [authGuard],
    title: 'Dashboard — FinTrack Pro'
  },
  {
    path: 'quick-log',
    loadComponent: () => import('./features/transactions/quick-log.component').then(m => m.QuickLogComponent),
    canActivate: [authGuard],
    title: 'Quick Log — FinTrack Pro'
  },
  {
    path: 'transactions/new',
    loadComponent: () => import('./features/transactions/quick-log.component').then(m => m.QuickLogComponent),
    canActivate: [authGuard],
    title: 'Quick Log — FinTrack Pro'
  },
  {
    path: 'transactions',
    loadComponent: () => import('./features/transactions/transactions.component').then(m => m.TransactionsComponent),
    canActivate: [authGuard],
    title: 'Transactions — FinTrack Pro'
  },
  {
    path: 'budgets',
    loadComponent: () => import('./features/budgets/budgets.component').then(m => m.BudgetsComponent),
    canActivate: [authGuard],
    title: 'Budgets — FinTrack Pro'
  },
  {
    path: 'categories',
    loadComponent: () => import('./features/categories/categories.component').then(m => m.CategoriesComponent),
    canActivate: [authGuard],
    title: 'Categories — FinTrack Pro'
  },
  {
    path: 'reports',
    loadComponent: () => import('./features/reports/reports.component').then(m => m.ReportsComponent),
    canActivate: [authGuard],
    title: 'Reports — FinTrack Pro'
  },
  {
    path: 'settings',
    loadComponent: () => import('./features/settings/settings.component').then(m => m.SettingsComponent),
    canActivate: [authGuard],
    title: 'Settings — FinTrack Pro'
  },

  { path: '**', redirectTo: '' }
];

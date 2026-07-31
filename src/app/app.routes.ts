import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  // ── Public (no auth required) ────────────────────────────────────────────
  {
    path: '',
    loadComponent: () => import('./features/home/home.component').then(m => m.HomeComponent),
    title: 'TCFlow — Personal Finance Tracker'
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.component').then(m => m.LoginComponent),
    canActivate: [guestGuard],
    title: 'Sign In — TCFlow'
  },
  {
    path: 'privacy',
    loadComponent: () => import('./features/legal/privacy.component').then(m => m.PrivacyComponent),
    title: 'Privacy Policy — TCFlow'
  },
  {
    path: 'terms',
    loadComponent: () => import('./features/legal/terms.component').then(m => m.TermsComponent),
    title: 'Terms of Service — TCFlow'
  },

  // ── Protected (require Google login) ────────────────────────────────────
  {
    path: 'dashboard',
    loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
    canActivate: [authGuard],
    title: 'Dashboard — TCFlow'
  },
  {
    path: 'quick-log',
    loadComponent: () => import('./features/transactions/quick-log.component').then(m => m.QuickLogComponent),
    canActivate: [authGuard],
    title: 'Quick Log — TCFlow'
  },
  {
    path: 'transactions/new',
    loadComponent: () => import('./features/transactions/quick-log.component').then(m => m.QuickLogComponent),
    canActivate: [authGuard],
    title: 'Quick Log — TCFlow'
  },
  {
    path: 'transactions/import',
    loadComponent: () => import('./features/transactions/bank-import.component').then(m => m.BankImportComponent),
    canActivate: [authGuard],
    title: 'Import Statement — TCFlow'
  },
  {
    path: 'transactions',
    loadComponent: () => import('./features/transactions/transactions.component').then(m => m.TransactionsComponent),
    canActivate: [authGuard],
    title: 'Transactions — TCFlow'
  },
  {
    path: 'budgets',
    loadComponent: () => import('./features/budgets/budgets.component').then(m => m.BudgetsComponent),
    canActivate: [authGuard],
    title: 'Budgets — TCFlow'
  },
  {
    path: 'goals',
    loadComponent: () => import('./features/goals/goals.component').then(m => m.GoalsComponent),
    canActivate: [authGuard],
    title: 'Goals — TCFlow'
  },
  {
    path: 'savings-simulator',
    loadComponent: () => import('./features/savings-simulator/savings-simulator.component').then(m => m.SavingsSimulatorComponent),
    canActivate: [authGuard],
    title: 'Savings Simulator — TCFlow'
  },
  {
    path: 'bills-calendar',
    loadComponent: () => import('./features/bills-calendar/bills-calendar.component').then(m => m.BillsCalendarComponent),
    canActivate: [authGuard],
    title: 'Upcoming Bills — TCFlow'
  },
  {
    path: 'categories',
    loadComponent: () => import('./features/categories/categories.component').then(m => m.CategoriesComponent),
    canActivate: [authGuard],
    title: 'Categories — TCFlow'
  },
  {
    path: 'accounts',
    loadComponent: () => import('./features/accounts/accounts.component').then(m => m.AccountsComponent),
    canActivate: [authGuard],
    title: 'Accounts — TCFlow'
  },
  {
    path: 'insights',
    loadComponent: () => import('./features/insights/insights.component').then(m => m.InsightsComponent),
    canActivate: [authGuard],
    title: 'Insights — TCFlow'
  },
  {
    path: 'reports',
    loadComponent: () => import('./features/reports/reports.component').then(m => m.ReportsComponent),
    canActivate: [authGuard],
    title: 'Reports — TCFlow'
  },
  {
    path: 'settings',
    loadComponent: () => import('./features/settings/settings.component').then(m => m.SettingsComponent),
    canActivate: [authGuard],
    title: 'Settings — TCFlow'
  },
  {
    path: 'debt-planner',
    loadComponent: () => import('./features/debt-planner/debt-planner.component').then(m => m.DebtPlannerComponent),
    canActivate: [authGuard],
    title: 'Debt Payoff Planner — TCFlow'
  },

  { path: '**', redirectTo: '' }
];

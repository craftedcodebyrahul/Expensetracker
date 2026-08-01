import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent {
  auth = inject(AuthService);
  signingIn = signal(false);
  year = new Date().getFullYear();

  features = [
    {
      icon: '📊',
      title: 'Smart Dashboard',
      desc: 'Real-time overview of income, expenses, net balance, and savings rate — updated the moment you add a transaction.'
    },
    {
      icon: '⚡',
      title: 'Quick Log',
      desc: 'Log any transaction in under 5 seconds. No forms, no friction — built for the way you actually spend money.'
    },
    {
      icon: '🎯',
      title: 'Budget Tracking',
      desc: 'Set monthly budgets per category with live progress bars and automatic alerts before you overspend.'
    },
    {
      icon: '🏦',
      title: 'Account Balances',
      desc: 'Track assets and liabilities separately. Every transaction updates your account balance and net worth instantly.'
    },
    {
      icon: '📈',
      title: 'Reports & Analytics',
      desc: 'Monthly and yearly breakdowns with charts, category drill-downs, and savings rate history.'
    },
    {
      icon: '🤖',
      title: 'AI Financial Advisor',
      desc: 'Powered by Google Gemini — get a plain-language audit of your spending, cashflow health, and what to improve.'
    },
    {
      icon: '🔄',
      title: 'Recurring Transactions',
      desc: 'Set up salary, rent, subscriptions, or any repeating entry. TCFlow auto-posts them on schedule — no manual work.'
    },
    {
      icon: '🗄️',
      title: 'Private Database',
      desc: 'Your data lives in a private Turso (edge SQLite) database — fast reads, no quota limits, fully isolated to you.'
    },
  ];

  howItWorks = [
    {
      num: '01',
      title: 'Sign in with Google',
      desc: 'One click — no passwords, no sign-up forms. Just your existing Google account for identity.'
    },
    {
      num: '02',
      title: 'Your account is ready instantly',
      desc: 'TCFlow creates your private database record and seeds default categories and accounts automatically.'
    },
    {
      num: '03',
      title: 'Start tracking',
      desc: 'Add transactions, set budgets, connect accounts — your financial picture comes together in real time.'
    },
  ];

  signIn() {
    this.signingIn.set(true);
    this.auth.loginWithGoogle();
  }

  devLogin() {
    this.signingIn.set(true);
    this.auth.loginAsDevUser('101278500117613125855');
  }
}

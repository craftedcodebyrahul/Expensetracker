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
    { icon: '📊', title: 'Smart Dashboard', desc: 'Real-time overview of your income, expenses, net balance, and savings rate with live charts.' },
    { icon: '⚡', title: 'Quick Log', desc: 'Log a transaction in seconds — no forms, no friction. Perfect for on-the-go expense tracking.' },
    { icon: '🎯', title: 'Budget Tracking', desc: 'Set monthly budgets per category. Get alerts before you overspend.' },
    { icon: '🔮', title: 'Financial Insights', desc: 'See where you are and where you\'ll be. Savings trajectory, projections, and health score.' },
    { icon: '📈', title: 'Reports & Analytics', desc: 'Monthly and yearly breakdowns with charts. Understand your spending patterns.' },
    { icon: '📋', title: 'Google Sheets Storage', desc: 'Your data lives in your own Google Spreadsheet. You own it — always accessible, always private.' },
  ];

  howItWorks = [
    { num: '01', title: 'Sign in with Google', desc: 'One click — no passwords, no sign-up forms. Just your existing Google account.' },
    { num: '02', title: 'Your spreadsheet is created', desc: 'TCFlow automatically creates a private "TCFlow — My Finances" spreadsheet in your Google Drive.' },
    { num: '03', title: 'Start tracking', desc: 'Add transactions, set budgets, and watch your financial picture come together in real time.' },
  ];

  signIn() {
    this.signingIn.set(true);
    this.auth.loginWithGoogle();
  }
}

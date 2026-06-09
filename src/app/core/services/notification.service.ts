import { Injectable, inject, signal, computed, effect } from '@angular/core';
import { AppNotification, NotificationType } from '../models/notification.model';
import { AccountService } from './account.service';
import { BudgetService } from './budget.service';
import { TransactionService } from './transaction.service';
import { ToastService } from './toast.service';

const STORAGE_KEY = 'TCFLOW_NOTIFICATIONS';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private accountService = inject(AccountService);
  private budgetService = inject(BudgetService);
  private transactionService = inject(TransactionService);
  private toast = inject(ToastService);

  readonly notifications = signal<AppNotification[]>([]);

  readonly unreadCount = computed(() =>
    this.notifications().filter(n => !n.read).length
  );

  private prevTransactions: any[] = [];

  constructor() {
    this.loadNotifications();

    // 1. Reactive Watcher for Budget Alerts
    effect(() => {
      const alerts = this.budgetService.budgetAlerts();
      alerts.forEach(alert => {
        if (alert.status === 'exceeded') {
          this.add(
            `🚨 Budget Exceeded: ${alert.categoryName}`,
            `You have spent $${alert.spentAmount.toFixed(2)} which exceeds your monthly budget limit of $${alert.budgetAmount.toFixed(2)}.`,
            'critical'
          );
        } else if (alert.status === 'warning') {
          this.add(
            `⚠️ Budget Warning: ${alert.categoryName}`,
            `You have spent $${alert.spentAmount.toFixed(2)} (${Math.round(alert.percentage)}%) of your budget limit of $${alert.budgetAmount.toFixed(2)}.`,
            'warning'
          );
        }
      });
    });

    // 2. Reactive Watcher for Account Balances
    // effect(() => {
    //   const balances = this.accountService.accountBalances();
    //   const accounts = this.accountService.accounts();
    //   if (accounts.length === 0) return;

    //   accounts.forEach(a => {
    //     const bal = balances[a.id] ?? 0;
    //     if (a.type === 'asset') {
    //       if (bal < 250) {
    //         this.add(
    //           `⚠️ Low Balance: ${a.name}`,
    //           `The balance of your ${a.name} account has dropped to $${bal.toFixed(2)}, which is below the safe threshold of $250.00.`,
    //           'warning'
    //         );
    //       }
    //     } else if (a.type === 'liability') {
    //       // Liability balance is positive (representing the amount owed). Warn if it exceeds $1,500.00.
    //       if (bal > 1500) {
    //         this.add(
    //           `💳 High Debt Warning: ${a.name}`,
    //           `Your ${a.name} balance has reached $${bal.toFixed(2)}, exceeding the warning threshold of $1,500.00.`,
    //           'warning'
    //         );
    //       }
    //     }
    //   });
    // });

    // 3. Reactive Watcher for Transaction Actions (Create / Update / Delete)
    effect(() => {
      const currentTxns = this.transactionService.transactions();
      
      // On startup, initialize but do not trigger notifications for existing transactions
      if (this.prevTransactions.length === 0 && currentTxns.length > 0) {
        this.prevTransactions = [...currentTxns];
        return;
      }

      // Additions
      const added = currentTxns.filter(t => !this.prevTransactions.some(p => p.id === t.id));
      added.forEach(t => {
        const icon = t.type === 'income' ? '📈' : t.type === 'expense' ? '📉' : '🔄';
        this.add(
          `${icon} Transaction Logged`,
          `New ${t.type} of $${t.amount.toFixed(2)} for "${t.description || t.category}" was recorded.`,
          t.type === 'income' ? 'success' : 'info'
        );
      });

      // Deletions
      const deleted = this.prevTransactions.filter(p => !currentTxns.some(t => t.id === p.id));
      deleted.forEach(p => {
        this.add(
          `🗑️ Transaction Deleted`,
          `Transaction of $${p.amount.toFixed(2)} ("${p.description || p.category}") was deleted.`,
          'info'
        );
      });

      // Editions
      const edited = currentTxns.filter(t => {
        const match = this.prevTransactions.find(p => p.id === t.id);
        return match && (
          match.amount !== t.amount || 
          match.description !== t.description || 
          match.category !== t.category || 
          match.accountId !== t.accountId
        );
      });
      edited.forEach(t => {
        this.add(
          `✏️ Transaction Modified`,
          `Transaction "${t.description || t.category}" was updated to $${t.amount.toFixed(2)}.`,
          'info'
        );
      });

      this.prevTransactions = [...currentTxns];
    });
  }

  add(title: string, message: string, type: NotificationType) {
    const list = this.notifications();
    
    // De-duplication check: avoid writing identical notifications
    const exists = list.some(n => n.title === title && n.message === message);
    if (exists) return;

    const newNotification: AppNotification = {
      id: Math.random().toString(36).slice(2),
      title,
      message,
      type,
      read: false,
      createdAt: new Date().toISOString()
    };

    this.notifications.update(n => [newNotification, ...n]);
    this.saveNotifications();

    // Trigger standard toast alert in bottom-right corner
    this.toast.show(message, type === 'critical' ? 'error' : type);
  }

  markAsRead(id: string) {
    this.notifications.update(list =>
      list.map(n => n.id === id ? { ...n, read: true } : n)
    );
    this.saveNotifications();
  }

  markAllAsRead() {
    this.notifications.update(list =>
      list.map(n => ({ ...n, read: true }))
    );
    this.saveNotifications();
  }

  delete(id: string) {
    this.notifications.update(list => list.filter(n => n.id !== id));
    this.saveNotifications();
  }

  clearAll() {
    this.notifications.set([]);
    this.saveNotifications();
  }

  private loadNotifications() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.notifications.set(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Failed to load notifications from localStorage', e);
    }
  }

  private saveNotifications() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.notifications()));
    } catch (e) {
      console.error('Failed to save notifications to localStorage', e);
    }
  }
}

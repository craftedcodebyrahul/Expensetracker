import { Injectable, inject, signal, computed } from '@angular/core';
import { ApiService } from './api.service';
import { TransactionService } from './transaction.service';
import { Account } from '../models';
import { tap, catchError, of } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AccountService {
  private api = inject(ApiService);
  private txnService = inject(TransactionService);

  readonly accounts = signal<Account[]>([]);
  readonly loading = signal(false);

  readonly assetAccounts = computed(() =>
    this.accounts().filter(a => a.type === 'asset')
  );

  readonly liabilityAccounts = computed(() =>
    this.accounts().filter(a => a.type === 'liability')
  );

  getAccountById(id: string): Account | undefined {
    return this.accounts().find(a => a.id === id);
  }

  loadAccounts() {
    this.loading.set(true);
    return this.api.getAccounts().pipe(
      tap(res => {
        if (res.success) {
          this.accounts.set(res.data);
        }
        this.loading.set(false);
      }),
      catchError(() => {
        this.loading.set(false);
        return of(null);
      })
    );
  }

  createAccount(data: Omit<Account, 'id' | 'createdAt'>) {
    return this.api.createAccount(data).pipe(
      tap(res => {
        if (res.success) this.accounts.update(accs => [...accs, res.data]);
      }),
      catchError(err => of(null))
    );
  }

  updateAccount(id: string, data: Partial<Account>) {
    return this.api.updateAccount(id, data).pipe(
      tap(res => {
        if (res.success) {
          this.accounts.update(accs => accs.map(a => a.id === id ? res.data : a));
        }
      }),
      catchError(err => of(null))
    );
  }

  deleteAccount(id: string) {
    return this.api.deleteAccount(id).pipe(
      tap(res => {
        if (res.success) this.accounts.update(accs => accs.filter(a => a.id !== id));
      }),
      catchError(err => of(null))
    );
  }

  readonly accountBalances = computed(() => {
    const txns = this.txnService.postedTransactions();
    const accs = this.accounts();

    const balances: Record<string, number> = {};

    // Initialize all accounts to their initial balance (always stored as positive)
    // Assets: positive balance = money you have
    // Liabilities: positive balance = money you OWE
    accs.forEach(a => balances[a.id] = Math.abs(a.initialBalance ?? 0));

    txns.forEach(t => {
      if (t.type === 'income') {
        // Income: adds to the credited account (asset gains value)
        balances[t.accountId] = (balances[t.accountId] || 0) + t.amount;
      } else if (t.type === 'expense') {
        // Expense paid from an asset: asset loses value
        // Expense paid from a liability (credit card charge): liability increases
        const acc = accs.find(a => a.id === t.accountId);
        if (acc?.type === 'liability') {
          balances[t.accountId] = (balances[t.accountId] || 0) + t.amount; // you owe MORE
        } else {
          balances[t.accountId] = (balances[t.accountId] || 0) - t.amount; // you have LESS
        }
      } else if (t.type === 'transfer') {
        // Transfer: subtract from source, add to destination
        const fromAcc = accs.find(a => a.id === t.accountId);
        const toAcc = accs.find(a => a.id === t.toAccountId);
        if (fromAcc?.type === 'liability') {
          // Transferring FROM a liability (e.g. cash advance): owe MORE
          balances[t.accountId] = (balances[t.accountId] || 0) + t.amount;
        } else {
          balances[t.accountId] = (balances[t.accountId] || 0) - t.amount; // asset decreases
        }
        if (t.toAccountId) {
          if (toAcc?.type === 'liability') {
            // Transferring TO a liability (e.g. credit card payment): owe LESS
            balances[t.toAccountId] = (balances[t.toAccountId] || 0) - t.amount;
          } else {
            balances[t.toAccountId] = (balances[t.toAccountId] || 0) + t.amount; // asset increases
          }
        }
      }
    });

    return balances;
  });

  readonly netWorth = computed(() => {
    const balances = this.accountBalances();
    const accs = this.accounts();
    let netWorth = 0;
    accs.forEach(a => {
      const bal = balances[a.id] || 0;
      if (a.type === 'asset') {
        netWorth += bal; // assets add to net worth
      } else {
        netWorth -= bal; // liabilities reduce net worth (bal is positive = what you owe)
      }
    });
    return netWorth;
  });
}

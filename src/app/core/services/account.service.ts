import { Injectable, inject, signal, computed } from '@angular/core';
import { ApiService } from './api.service';
import { TransactionService } from './transaction.service';
import { SettingsService } from './settings.service';
import { Account, StockHolding, StockOrder } from '../models';
import { tap, catchError, of } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AccountService {
  api = inject(ApiService);
  private txnService = inject(TransactionService);
  private settingsService = inject(SettingsService);

  readonly accounts = signal<Account[]>([]);
  readonly exchangeRates = signal<Record<string, number>>({});
  readonly loading = signal(false);
  readonly refreshingPrices = signal(false);

  readonly assetAccounts = computed(() =>
    this.accounts().filter(a => a.type === 'asset')
  );

  readonly liabilityAccounts = computed(() =>
    this.accounts().filter(a => a.type === 'liability')
  );

  readonly investmentAccounts = computed(() =>
    this.accounts().filter(a => a.isInvestment)
  );

  getAccountById(id: string): Account | undefined {
    return this.accounts().find(a => a.id === id);
  }

  loadExchangeRates() {
    return this.api.getExchangeRates().pipe(
      tap(res => {
        if (res.success) this.exchangeRates.set(res.data);
      }),
      catchError(() => of(null))
    );
  }

  loadAccounts() {
    this.loading.set(true);
    this.loadExchangeRates().subscribe();
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

  // ── Stock Holdings ──────────────────────────────────────────────────────────

  addHolding(accountId: string, ticker: string, shares: number) {
    return this.api.addHolding(accountId, ticker, shares).pipe(
      tap(res => {
        if (res.success) {
          this.accounts.update(accs => accs.map(a => {
            if (a.id !== accountId) return a;
            return { ...a, stockHoldings: [...(a.stockHoldings ?? []), res.data] };
          }));
        }
      }),
      catchError(err => of(null))
    );
  }

  updateHolding(accountId: string, holdingId: string, shares: number) {
    return this.api.updateHolding(accountId, holdingId, shares).pipe(
      tap(res => {
        if (res.success) {
          this.accounts.update(accs => accs.map(a => {
            if (a.id !== accountId) return a;
            return {
              ...a,
              stockHoldings: (a.stockHoldings ?? []).map(h => h.id === holdingId ? res.data : h),
            };
          }));
        }
      }),
      catchError(err => of(null))
    );
  }

  deleteHolding(accountId: string, holdingId: string) {
    return this.api.deleteHolding(accountId, holdingId).pipe(
      tap(res => {
        if (res.success) {
          this.accounts.update(accs => accs.map(a => {
            if (a.id !== accountId) return a;
            return { ...a, stockHoldings: (a.stockHoldings ?? []).filter(h => h.id !== holdingId) };
          }));
        }
      }),
      catchError(err => of(null))
    );
  }

  // ── Stock Orders ────────────────────────────────────────────────────────────

  getStockOrders(accountId: string) {
    return this.api.getStockOrders(accountId);
  }

  addStockOrder(
    accountId: string,
    ticker: string,
    type: 'BUY' | 'SELL',
    shares: number,
    pricePerShare: number,
    date: string
  ) {
    return this.api.addStockOrder(accountId, ticker, type, shares, pricePerShare, date).pipe(
      tap(res => {
        if (res.success) {
          this.loadAccounts().subscribe();
          this.txnService.loadTransactions().subscribe();
        }
      })
    );
  }

  updateStockOrder(
    accountId: string,
    orderId: string,
    shares: number,
    pricePerShare: number,
    date: string
  ) {
    return this.api.updateStockOrder(accountId, orderId, shares, pricePerShare, date).pipe(
      tap(res => {
        if (res.success) {
          this.loadAccounts().subscribe();
          this.txnService.loadTransactions().subscribe();
        }
      })
    );
  }

  deleteStockOrder(accountId: string, orderId: string) {
    return this.api.deleteStockOrder(accountId, orderId).pipe(
      tap(res => {
        if (res.success) {
          this.loadAccounts().subscribe();
          this.txnService.loadTransactions().subscribe();
        }
      })
    );
  }

  refreshStockPrices() {
    this.refreshingPrices.set(true);
    return this.api.refreshStockPrices().pipe(
      tap(res => {
        if (res.success) this.accounts.set(res.data);
        this.refreshingPrices.set(false);
      }),
      catchError(() => {
        this.refreshingPrices.set(false);
        return of(null);
      })
    );
  }

  /** Investment value for an account = sum(shares * price) across all holdings */
  investmentValue(accountId: string): number {
    const acc = this.getAccountById(accountId);
    if (!acc?.isInvestment || !acc.stockHoldings?.length) return 0;
    return acc.stockHoldings.reduce((sum, h) => sum + h.shares * h.price, 0);
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
        // If the account is a liability, it decreases the balance (what you owe)
        const acc = accs.find(a => a.id === t.accountId);
        if (acc?.type === 'liability') {
          balances[t.accountId] = (balances[t.accountId] || 0) - t.amount; // you owe LESS
        } else {
          balances[t.accountId] = (balances[t.accountId] || 0) + t.amount; // you have MORE
        }
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

    // For investment accounts, add the market value of holdings on top of cash balance
    accs.forEach(a => {
      if (a.isInvestment && a.stockHoldings?.length) {
        const mktVal = a.stockHoldings.reduce((sum, h) => sum + h.shares * h.price, 0);
        balances[a.id] = (balances[a.id] || 0) + mktVal;
      }
    });

    return balances;
  });

  readonly netWorth = computed(() => {
    const balances = this.accountBalances();
    const accs = this.accounts();
    const rates = this.exchangeRates();
    const primaryCurrency = this.settingsService.currency();
    
    let netWorth = 0;
    accs.forEach(a => {
      const bal = balances[a.id] || 0;
      const accCurrency = a.currency || 'USD';
      
      let convertedBal = bal;
      if (accCurrency.toUpperCase() !== primaryCurrency.toUpperCase() && Object.keys(rates).length > 0) {
        const fromRate = rates[accCurrency.toUpperCase()] || 1.0;
        const toRate = rates[primaryCurrency.toUpperCase()] || 1.0;
        convertedBal = (bal / fromRate) * toRate;
      }
      
      if (a.type === 'asset') {
        netWorth += convertedBal;
      } else {
        netWorth -= convertedBal;
      }
    });
    return netWorth;
  });
}

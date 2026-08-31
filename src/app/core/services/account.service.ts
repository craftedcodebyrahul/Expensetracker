import { Injectable, inject, signal, computed } from '@angular/core';
import { ApiService } from './api.service';
import { SettingsService } from './settings.service';
import { Account, StockHolding, StockOrder } from '../models';
import { tap, catchError, of } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AccountService {
  api = inject(ApiService);
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
        }
      })
    );
  }

  deleteStockOrder(accountId: string, orderId: string) {
    return this.api.deleteStockOrder(accountId, orderId).pipe(
      tap(res => {
        if (res.success) {
          this.loadAccounts().subscribe();
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
    const accs = this.accounts();
    const balances: Record<string, number> = {};

    accs.forEach(a => {
      balances[a.id] = a.currentBalance ?? Math.abs(a.initialBalance ?? 0);
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

export interface StockHolding {
  id: string;
  accountId: string;
  ticker: string;
  shares: number;
  price: number;
  updatedAt: string;
}

export interface Account {
  id: string;
  name: string;
  type: 'asset' | 'liability';
  currency?: string;
  initialBalance?: number;
  isInvestment?: boolean;
  stockHoldings?: StockHolding[];
  createdAt?: string;
}

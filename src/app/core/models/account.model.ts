export interface StockHolding {
  id: string;
  accountId: string;
  ticker: string;
  shares: number;
  price: number;
  costBasis: number;
  updatedAt: string;
}

export interface StockOrder {
  id: string;
  accountId: string;
  ticker: string;
  type: 'BUY' | 'SELL';
  shares: number;
  pricePerShare: number;
  date: string;
  transactionId?: string;
  createdAt?: string;
}

export interface Account {
  id: string;
  name: string;
  type: 'asset' | 'liability';
  currency?: string;
  initialBalance?: number;
  isInvestment?: boolean;
  apr?: number;
  minimumPayment?: number;
  currentBalance?: number;
  stockHoldings?: StockHolding[];
  stockOrders?: StockOrder[];
  createdAt?: string;
}

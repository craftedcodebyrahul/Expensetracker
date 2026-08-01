export type TransactionType = 'income' | 'expense' | 'transfer';

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  category: string;
  description: string;
  date: string; // ISO date string YYYY-MM-DD
  tags: string[];
  isRecurring: boolean;
  recurringFrequency?: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';
  recurringId?: string;  // Groups all occurrences of the same recurring series
  paymentMethod?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  accountId: string;
  toAccountId?: string;
  status?: 'posted' | 'scheduled';
  stockOrderId?: string;
}

export interface TransactionFilter {
  type?: TransactionType | 'all';
  category?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  tags?: string[];
  minAmount?: number;
  maxAmount?: number;
  accountId?: string;
  page?: number;
  limit?: number | 'all';
}

export interface PaginatedTransactions {
  transactions: Transaction[];
  pagination: {
    totalItems: number;
    totalPages: number;
    page: number;
    limit: number;
  };
}

export interface TransactionSummary {
  totalIncome: number;
  totalExpenses: number;
  netBalance: number;
  transactionCount: number;
  avgTransaction: number;
  topCategory: string;
}

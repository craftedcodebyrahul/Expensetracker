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
  recurringFrequency?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  recurringId?: string;  // Groups all occurrences of the same recurring series
  paymentMethod?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  accountId: string;
  toAccountId?: string;
  status?: 'posted' | 'scheduled';
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
}

export interface TransactionSummary {
  totalIncome: number;
  totalExpenses: number;
  netBalance: number;
  transactionCount: number;
  avgTransaction: number;
  topCategory: string;
}

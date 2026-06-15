export interface RecurringSchedule {
  id: string;
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  category: string;
  description: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  startDate: string; // YYYY-MM-DD
  nextDueDate: string; // YYYY-MM-DD
  accountId: string;
  toAccountId?: string;
  createdAt?: string;
}

export interface DetectedBill {
  description: string;
  type: 'income' | 'expense';
  amount: number;
  category: string;
  accountId: string;
  frequency: 'weekly' | 'monthly' | 'yearly';
  startDate: string;
  nextDueDate: string;
  matchCount: number;
}

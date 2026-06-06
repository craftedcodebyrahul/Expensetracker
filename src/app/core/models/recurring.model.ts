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

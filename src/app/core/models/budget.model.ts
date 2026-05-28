export interface Budget {
  id: string;
  categoryId: string;
  categoryName: string;
  amount: number;
  period: 'monthly' | 'yearly';
  month?: number; // 1-12
  year: number;
  spent: number; // computed
  remaining: number; // computed
  percentage: number; // computed
  createdAt: string;
}

export interface BudgetAlert {
  categoryId: string;
  categoryName: string;
  budgetAmount: number;
  spentAmount: number;
  percentage: number;
  status: 'safe' | 'warning' | 'exceeded';
}

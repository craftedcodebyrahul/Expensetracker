export interface Category {
  id: string;
  name: string;
  type: 'income' | 'expense' | 'both';
  icon: string;
  color: string;
  budget?: number; // monthly budget limit for expense categories
  createdAt: string;
}

export const DEFAULT_CATEGORIES: Category[] = [
  // Expense categories
  { id: 'food', name: 'Food & Dining', type: 'expense', icon: '🍽️', color: '#FF6384', createdAt: new Date().toISOString() },
  { id: 'transport', name: 'Transportation', type: 'expense', icon: '🚗', color: '#36A2EB', createdAt: new Date().toISOString() },
  { id: 'housing', name: 'Housing & Rent', type: 'expense', icon: '🏠', color: '#FFCE56', createdAt: new Date().toISOString() },
  { id: 'utilities', name: 'Utilities', type: 'expense', icon: '💡', color: '#4BC0C0', createdAt: new Date().toISOString() },
  { id: 'healthcare', name: 'Healthcare', type: 'expense', icon: '🏥', color: '#9966FF', createdAt: new Date().toISOString() },
  { id: 'entertainment', name: 'Entertainment', type: 'expense', icon: '🎬', color: '#FF9F40', createdAt: new Date().toISOString() },
  { id: 'shopping', name: 'Shopping', type: 'expense', icon: '🛍️', color: '#FF6384', createdAt: new Date().toISOString() },
  { id: 'education', name: 'Education', type: 'expense', icon: '📚', color: '#36A2EB', createdAt: new Date().toISOString() },
  { id: 'travel', name: 'Travel', type: 'expense', icon: '✈️', color: '#4BC0C0', createdAt: new Date().toISOString() },
  { id: 'subscriptions', name: 'Subscriptions', type: 'expense', icon: '📱', color: '#9966FF', createdAt: new Date().toISOString() },
  { id: 'insurance', name: 'Insurance', type: 'expense', icon: '🛡️', color: '#FFCE56', createdAt: new Date().toISOString() },
  { id: 'other_expense', name: 'Other Expenses', type: 'expense', icon: '💸', color: '#C9CBCF', createdAt: new Date().toISOString() },
  // Income categories
  { id: 'salary', name: 'Salary', type: 'income', icon: '💼', color: '#4CAF50', createdAt: new Date().toISOString() },
  { id: 'freelance', name: 'Freelance', type: 'income', icon: '💻', color: '#8BC34A', createdAt: new Date().toISOString() },
  { id: 'investment', name: 'Investment Returns', type: 'income', icon: '📈', color: '#00BCD4', createdAt: new Date().toISOString() },
  { id: 'rental', name: 'Rental Income', type: 'income', icon: '🏘️', color: '#FF9800', createdAt: new Date().toISOString() },
  { id: 'business', name: 'Business Income', type: 'income', icon: '🏢', color: '#9C27B0', createdAt: new Date().toISOString() },
  { id: 'gift', name: 'Gifts & Bonuses', type: 'income', icon: '🎁', color: '#E91E63', createdAt: new Date().toISOString() },
  { id: 'other_income', name: 'Other Income', type: 'income', icon: '💰', color: '#607D8B', createdAt: new Date().toISOString() },
];

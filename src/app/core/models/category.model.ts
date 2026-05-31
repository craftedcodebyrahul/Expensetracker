export interface Category {
  id: string;
  name: string;
  type: 'income' | 'expense' | 'both';
  icon: string;
  color: string;
  budget?: number;
  createdAt: string;
}

const NOW = new Date().toISOString();

export const DEFAULT_CATEGORIES: Category[] = [
  // ── Expense ──────────────────────────────────────────────────────────────────
  { id: 'food',          name: 'Food & Dining',      type: 'expense', icon: '🍽️', color: '#FF6384', createdAt: NOW },
  { id: 'transport',     name: 'Transportation',     type: 'expense', icon: '🚗', color: '#36A2EB', createdAt: NOW },
  { id: 'housing',       name: 'Housing & Rent',     type: 'expense', icon: '🏠', color: '#FFCE56', createdAt: NOW },
  { id: 'utilities',     name: 'Utilities',          type: 'expense', icon: '💡', color: '#4BC0C0', createdAt: NOW },
  { id: 'healthcare',    name: 'Healthcare',         type: 'expense', icon: '🏥', color: '#9966FF', createdAt: NOW },
  { id: 'entertainment', name: 'Entertainment',      type: 'expense', icon: '🎬', color: '#FF9F40', createdAt: NOW },
  { id: 'shopping',      name: 'Shopping',           type: 'expense', icon: '🛍️', color: '#FF6384', createdAt: NOW },
  { id: 'education',     name: 'Education',          type: 'expense', icon: '📚', color: '#36A2EB', createdAt: NOW },
  { id: 'travel',        name: 'Travel',             type: 'expense', icon: '✈️', color: '#4BC0C0', createdAt: NOW },
  { id: 'subscriptions', name: 'Subscriptions',      type: 'expense', icon: '📱', color: '#9966FF', createdAt: NOW },
  { id: 'insurance',     name: 'Insurance',          type: 'expense', icon: '🛡️', color: '#FFCE56', createdAt: NOW },
  { id: 'groceries',     name: 'Groceries',          type: 'expense', icon: '🛒', color: '#8BC34A', createdAt: NOW },
  { id: 'dining_out',    name: 'Dining Out',         type: 'expense', icon: '🍕', color: '#FF5722', createdAt: NOW },
  { id: 'fitness',       name: 'Fitness & Sports',   type: 'expense', icon: '🏋️', color: '#00BCD4', createdAt: NOW },
  { id: 'personal_care', name: 'Personal Care',      type: 'expense', icon: '💅', color: '#E91E63', createdAt: NOW },
  { id: 'pets',          name: 'Pets',               type: 'expense', icon: '🐾', color: '#795548', createdAt: NOW },
  { id: 'gifts_given',   name: 'Gifts Given',        type: 'expense', icon: '🎁', color: '#9C27B0', createdAt: NOW },
  { id: 'taxes',         name: 'Taxes & Fees',       type: 'expense', icon: '🧾', color: '#607D8B', createdAt: NOW },
  { id: 'other_expense', name: 'Other Expenses',     type: 'expense', icon: '💸', color: '#C9CBCF', createdAt: NOW },

  // ── Income ───────────────────────────────────────────────────────────────────
  { id: 'salary',        name: 'Salary',             type: 'income',  icon: '💼', color: '#4CAF50', createdAt: NOW },
  { id: 'freelance',     name: 'Freelance',          type: 'income',  icon: '💻', color: '#8BC34A', createdAt: NOW },
  { id: 'investment',    name: 'Investment Returns', type: 'income',  icon: '📈', color: '#00BCD4', createdAt: NOW },
  { id: 'rental',        name: 'Rental Income',      type: 'income',  icon: '🏘️', color: '#FF9800', createdAt: NOW },
  { id: 'business',      name: 'Business Income',    type: 'income',  icon: '🏢', color: '#9C27B0', createdAt: NOW },
  { id: 'bonus',         name: 'Bonus',              type: 'income',  icon: '🎯', color: '#F44336', createdAt: NOW },
  { id: 'gift_received', name: 'Gifts Received',     type: 'income',  icon: '🎁', color: '#E91E63', createdAt: NOW },
  { id: 'refund',        name: 'Refunds',            type: 'income',  icon: '↩️', color: '#00BCD4', createdAt: NOW },
  { id: 'side_hustle',   name: 'Side Hustle',        type: 'income',  icon: '⚡', color: '#FF9800', createdAt: NOW },
  { id: 'other_income',  name: 'Other Income',       type: 'income',  icon: '💰', color: '#607D8B', createdAt: NOW },
];

export interface Category {
  id: string;
  name: string;
  type: 'income' | 'expense' | 'both';
  icon: string;
  color: string;
  budget?: number;
  parentId?: string | null;
  children?: Category[];
  createdAt: string;
}

const NOW = new Date().toISOString();

export const DEFAULT_CATEGORIES: Category[] = [
  // ── Expense Parents & Subcategories ──────────────────────────────────────────
  { id: 'food',          name: 'Food & Dining',      type: 'expense', icon: '🍽️', color: '#FF6384', parentId: null, createdAt: NOW },
  { id: 'groceries',     name: 'Groceries',          type: 'expense', icon: '🛒', color: '#8BC34A', parentId: 'food', createdAt: NOW },
  { id: 'dining_out',    name: 'Dining Out',         type: 'expense', icon: '🍕', color: '#FF5722', parentId: 'food', createdAt: NOW },

  { id: 'transport',     name: 'Transportation',     type: 'expense', icon: '🚗', color: '#36A2EB', parentId: null, createdAt: NOW },
  { id: 'auto_insurance',name: 'Car Insurance',      type: 'expense', icon: '🛡️', color: '#FFCE56', parentId: 'transport', createdAt: NOW },
  { id: 'car_payment',   name: 'Car Payment / Loan', type: 'expense', icon: '🚘', color: '#36A2EB', parentId: 'transport', createdAt: NOW },
  { id: 'gas_fuel',      name: 'Gas & Fuel',         type: 'expense', icon: '⛽', color: '#FF9F40', parentId: 'transport', createdAt: NOW },

  { id: 'housing',       name: 'Housing & Rent',     type: 'expense', icon: '🏠', color: '#FFCE56', parentId: null, createdAt: NOW },
  { id: 'utilities',     name: 'Utilities',          type: 'expense', icon: '💡', color: '#4BC0C0', parentId: 'housing', createdAt: NOW },

  { id: 'healthcare',    name: 'Healthcare',         type: 'expense', icon: '🏥', color: '#9966FF', parentId: null, createdAt: NOW },
  { id: 'entertainment', name: 'Entertainment',      type: 'expense', icon: '🎬', color: '#FF9F40', parentId: null, createdAt: NOW },
  { id: 'subscriptions', name: 'Subscriptions',      type: 'expense', icon: '📱', color: '#9966FF', parentId: 'entertainment', createdAt: NOW },

  { id: 'shopping',      name: 'Shopping',           type: 'expense', icon: '🛍️', color: '#FF6384', parentId: null, createdAt: NOW },
  { id: 'personal_care', name: 'Personal Care',      type: 'expense', icon: '💅', color: '#E91E63', parentId: null, createdAt: NOW },
  { id: 'fitness',       name: 'Fitness & Sports',   type: 'expense', icon: '🏋️', color: '#00BCD4', parentId: null, createdAt: NOW },
  { id: 'education',     name: 'Education',          type: 'expense', icon: '📚', color: '#36A2EB', parentId: null, createdAt: NOW },
  { id: 'travel',        name: 'Travel',             type: 'expense', icon: '✈️', color: '#4BC0C0', parentId: null, createdAt: NOW },
  { id: 'pets',          name: 'Pets',               type: 'expense', icon: '🐾', color: '#795548', parentId: null, createdAt: NOW },
  { id: 'gifts_given',   name: 'Gifts Given',        type: 'expense', icon: '🎁', color: '#9C27B0', parentId: null, createdAt: NOW },
  { id: 'taxes',         name: 'Taxes & Fees',       type: 'expense', icon: '🧾', color: '#607D8B', parentId: null, createdAt: NOW },
  { id: 'other_expense', name: 'Other Expenses',     type: 'expense', icon: '💸', color: '#C9CBCF', parentId: null, createdAt: NOW },

  // ── Income ───────────────────────────────────────────────────────────────────
  { id: 'salary',        name: 'Salary',             type: 'income',  icon: '💼', color: '#4CAF50', parentId: null, createdAt: NOW },
  { id: 'freelance',     name: 'Freelance',          type: 'income',  icon: '💻', color: '#8BC34A', parentId: null, createdAt: NOW },
  { id: 'investment',    name: 'Investment Returns', type: 'income',  icon: '📈', color: '#00BCD4', parentId: null, createdAt: NOW },
  { id: 'rental',        name: 'Rental Income',      type: 'income',  icon: '🏘️', color: '#FF9800', parentId: null, createdAt: NOW },
  { id: 'business',      name: 'Business Income',    type: 'income',  icon: '🏢', color: '#9C27B0', parentId: null, createdAt: NOW },
  { id: 'bonus',         name: 'Bonus',              type: 'income',  icon: '🎯', color: '#F44336', parentId: null, createdAt: NOW },
  { id: 'gift_received', name: 'Gifts Received',     type: 'income',  icon: '🎁', color: '#E91E63', parentId: null, createdAt: NOW },
  { id: 'refund',        name: 'Refunds',            type: 'income',  icon: '↩️', color: '#00BCD4', parentId: null, createdAt: NOW },
  { id: 'side_hustle',   name: 'Side Hustle',        type: 'income',  icon: '⚡', color: '#FF9800', parentId: null, createdAt: NOW },
  { id: 'other_income',  name: 'Other Income',       type: 'income',  icon: '💰', color: '#607D8B', parentId: null, createdAt: NOW },
];

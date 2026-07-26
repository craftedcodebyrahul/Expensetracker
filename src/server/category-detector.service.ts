/**
 * src/server/category-detector.service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Smart Category Split Engine:
 * Analyzes transactions inside broad parent categories to identify merchant
 * clusters (e.g., insurance, car loan, groceries vs dining) and generates
 * actionable subcategory split recommendations.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { prisma } from './db.js';
import { v4 as uuidv4 } from 'uuid';

export interface CategorySplitSuggestion {
  id: string;
  parentCategoryId: string;
  parentCategoryName: string;
  suggestedName: string;
  suggestedIcon: string;
  suggestedColor: string;
  reason: string;
  affectedCount: number;
  totalAmount: number;
  transactionIds: string[];
  sampleDescriptions: string[];
}

interface PatternRule {
  targetSubcategoryName: string;
  icon: string;
  color: string;
  keywords: string[];
  applicableParentIds: string[];
}

const KNOWN_SPLIT_RULES: PatternRule[] = [
  // ── Transportation Splits ──────────────────────────────────────────────────
  {
    targetSubcategoryName: 'Car Insurance',
    icon: '🛡️',
    color: '#FFCE56',
    keywords: ['geico', 'state farm', 'progressive', 'allstate', 'liberty mutual', 'nationwide', 'car insurance', 'auto insurance', 'insurance'],
    applicableParentIds: ['transport', 'other_expense']
  },
  {
    targetSubcategoryName: 'Car Payment / Loan',
    icon: '🚘',
    color: '#36A2EB',
    keywords: ['honda financial', 'toyota financial', 'car payment', 'auto loan', 'ford credit', 'chase auto', 'nissan finance', 'car loan', 'auto finance', 'gm financial'],
    applicableParentIds: ['transport', 'other_expense']
  },
  {
    targetSubcategoryName: 'Gas & Fuel',
    icon: '⛽',
    color: '#FF9F40',
    keywords: ['shell', 'chevron', 'exxon', 'bp', 'speedway', 'mobil', 'gas station', 'fuel', 'petrol', 'sunoco', '7-eleven gas'],
    applicableParentIds: ['transport', 'other_expense']
  },

  // ── Food & Dining Splits ───────────────────────────────────────────────────
  {
    targetSubcategoryName: 'Groceries',
    icon: '🛒',
    color: '#8BC34A',
    keywords: ['walmart', 'trader joe', 'whole foods', 'aldy', 'aldi', 'kroger', 'safeway', 'costco', 'supermarket', 'groceries', 'target', 'publix', 'h-e-b', 'sprouts'],
    applicableParentIds: ['food', 'other_expense']
  },
  {
    targetSubcategoryName: 'Dining Out',
    icon: '🍕',
    color: '#FF5722',
    keywords: ['starbucks', 'mcdonald', 'ubereats', 'doordash', 'grubhub', 'chipotle', 'restaurant', 'burger king', 'domino', 'taco bell', 'dunkin', 'cafe', 'pizzeria', 'bar & grill'],
    applicableParentIds: ['food', 'other_expense']
  },

  // ── Entertainment Splits ───────────────────────────────────────────────────
  {
    targetSubcategoryName: 'Subscriptions',
    icon: '📱',
    color: '#9966FF',
    keywords: ['netflix', 'spotify', 'hulu', 'disney+', 'apple.com/bill', 'youtube', 'amazon prime', 'hbomax', 'paramount+', 'playstation', 'xbox'],
    applicableParentIds: ['entertainment', 'other_expense']
  },

  // ── Housing & Utilities Splits ─────────────────────────────────────────────
  {
    targetSubcategoryName: 'Utilities',
    icon: '💡',
    color: '#4BC0C0',
    keywords: ['electric', 'water bill', 'power & light', 'energy', 'coned', 'gas utility', 'waste management', 'trash', 'sewer'],
    applicableParentIds: ['housing', 'other_expense']
  }
];

export class CategoryDetectorService {
  /**
   * Analyze user transactions and generate category split suggestions
   */
  public async getSplitSuggestions(userId: string): Promise<CategorySplitSuggestion[]> {
    // 1. Fetch user's categories
    const userCategories = await prisma.category.findMany({ where: { userId } });
    const categoryMap = new Map<string, any>(userCategories.map((c: any) => [c.id, c]));
    const existingNames = new Set(userCategories.map((c: any) => c.name.toLowerCase()));

    // 2. Fetch user's expense transactions
    const transactions = await prisma.transaction.findMany({
      where: { userId, type: 'expense' },
      orderBy: { date: 'desc' },
      take: 500,
    });

    if (transactions.length === 0) return [];

    // Group transactions by categoryId
    const txnsByCategory = new Map<string, any[]>();
    for (const t of transactions) {
      const catId = t.category || 'other_expense';
      if (!txnsByCategory.has(catId)) {
        txnsByCategory.set(catId, []);
      }
      txnsByCategory.get(catId)!.push(t);
    }

    const suggestions: CategorySplitSuggestion[] = [];

    // 3. Evaluate known split rules against transactions in parent categories
    for (const rule of KNOWN_SPLIT_RULES) {
      // If user already has a category/subcategory with this exact name, skip
      if (existingNames.has(rule.targetSubcategoryName.toLowerCase())) {
        continue;
      }

      for (const parentId of rule.applicableParentIds) {
        const parentCat = categoryMap.get(parentId);
        if (!parentCat) continue;

        const catTxns = txnsByCategory.get(parentId);
        if (!catTxns || catTxns.length < 2) continue;

        // Match transactions against rule keywords
        const matchingTxns = catTxns.filter((t: any) => {
          const text = `${t.description} ${t.rawDescription || ''}`.toLowerCase();
          return rule.keywords.some(kw => text.includes(kw));
        });

        if (matchingTxns.length >= 2) {
          const totalAmount = matchingTxns.reduce((sum: number, t: any) => sum + t.amount, 0);
          const sampleDescriptions = matchingTxns
            .slice(0, 3)
            .map((t: any) => `${t.description} ($${t.amount.toFixed(2)})`);

          suggestions.push({
            id: `split_${parentId}_${rule.targetSubcategoryName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
            parentCategoryId: parentCat.id,
            parentCategoryName: parentCat.name,
            suggestedName: rule.targetSubcategoryName,
            suggestedIcon: rule.icon,
            suggestedColor: rule.color,
            reason: `Detected ${matchingTxns.length} transactions totaling $${totalAmount.toFixed(2)} for ${rule.targetSubcategoryName} inside ${parentCat.name}.`,
            affectedCount: matchingTxns.length,
            totalAmount: Math.round(totalAmount * 100) / 100,
            transactionIds: matchingTxns.map((t: any) => t.id),
            sampleDescriptions,
          });
        }
      }
    }

    return suggestions;
  }

  /**
   * Execute category split: creates a new subcategory under parentCategoryId and reassigns specified transactions
   */
  public async executeCategorySplit(
    userId: string,
    parentCategoryId: string,
    subcategories: Array<{ name: string; icon: string; color: string; transactionIds: string[] }>
  ): Promise<{ createdCategories: any[]; updatedTransactionCount: number }> {
    const parent = await prisma.category.findFirst({ where: { id: parentCategoryId, userId } });
    if (!parent) {
      throw new Error(`Parent category not found: ${parentCategoryId}`);
    }

    const createdCategories: any[] = [];
    let updatedTransactionCount = 0;

    for (const sub of subcategories) {
      // Check if subcategory already exists under this parent
      let subCat = await prisma.category.findFirst({
        where: { userId, name: sub.name, parentId: parentCategoryId }
      });

      if (!subCat) {
        subCat = await prisma.category.create({
          data: {
            id: uuidv4(),
            userId,
            name: sub.name,
            type: parent.type,
            icon: sub.icon || '🏷️',
            color: sub.color || parent.color,
            parentId: parentCategoryId,
            createdAt: new Date().toISOString(),
          }
        });
      }

      createdCategories.push(subCat);

      if (sub.transactionIds && sub.transactionIds.length > 0) {
        const res = await prisma.transaction.updateMany({
          where: {
            userId,
            id: { in: sub.transactionIds }
          },
          data: {
            category: subCat.id
          }
        });
        updatedTransactionCount += res.count;
      }
    }

    return { createdCategories, updatedTransactionCount };
  }
}

export const categoryDetectorService = new CategoryDetectorService();

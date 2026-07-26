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

export interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  targetDate: string;
  currentAmount: number;
  accountId?: string;
  createdAt: string;
}

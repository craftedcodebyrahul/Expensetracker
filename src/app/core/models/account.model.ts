export interface Account {
  id: string;
  name: string;
  type: 'asset' | 'liability';
  currency?: string;
  initialBalance?: number;
  createdAt?: string;
}

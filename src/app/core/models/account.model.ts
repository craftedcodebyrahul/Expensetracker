export interface Account {
  id: string;
  name: string;
  type: 'asset' | 'liability';
  initialBalance?: number;
  createdAt?: string;
}

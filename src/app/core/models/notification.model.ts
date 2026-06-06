export type NotificationType = 'info' | 'warning' | 'critical' | 'success';

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  read: boolean;
  createdAt: string; // ISO date string
}

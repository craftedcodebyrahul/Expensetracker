import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);

  show(message: string, type: Toast['type'] = 'info', duration = 3500) {
    // Toast messages disabled per user configuration
    return;
  }

  success(message: string) { this.show(message, 'success'); }
  error(message: string) { this.show(message, 'error', 5000); }
  info(message: string) { this.show(message, 'info'); }
  warning(message: string) { this.show(message, 'warning'); }

  dismiss(id: string) {
    this.toasts.update(t => t.filter(toast => toast.id !== id));
  }
}

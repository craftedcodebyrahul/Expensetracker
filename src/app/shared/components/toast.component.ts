import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-container">
      @for (toast of toastService.toasts(); track toast.id) {
        <div class="toast toast-{{ toast.type }}">
          <span>{{ toastIcon(toast.type) }}</span>
          <span>{{ toast.message }}</span>
          <button class="toast-close" (click)="toastService.dismiss(toast.id)">✕</button>
        </div>
      }
    </div>
  `,
  styles: [`
    .toast-close {
      background: none;
      border: none;
      color: inherit;
      cursor: pointer;
      margin-left: auto;
      opacity: 0.7;
      font-size: 0.875rem;
      padding: 0 0.25rem;
    }
    .toast-close:hover { opacity: 1; }
  `]
})
export class ToastComponent {
  toastService = inject(ToastService);

  toastIcon(type: string): string {
    const icons: Record<string, string> = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
    return icons[type] ?? 'ℹ️';
  }
}

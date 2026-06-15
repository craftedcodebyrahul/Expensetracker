import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { ToastService } from './toast.service';
import { tap, catchError, of } from 'rxjs';

export interface AppSettings {
  currency: string;
  currencySymbol: string;
  dateFormat: string;
}

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  // Global reactive settings — used by pipes and components across the app
  readonly currency = signal('USD');
  readonly currencySymbol = signal('$');
  readonly dateFormat = signal('MM/dd/yyyy');
  readonly loaded = signal(false);

  load() {
    return this.api.getSettings().pipe(
      tap(res => {
        if (res.success && res.data) {
          this.currency.set(res.data.currency ?? 'USD');
          this.currencySymbol.set(res.data.currencySymbol ?? '$');
          this.dateFormat.set(res.data.dateFormat ?? 'MM/dd/yyyy');
        }
        this.loaded.set(true);
      }),
      catchError(() => {
        this.loaded.set(true);
        return of(null);
      })
    );
  }

  save(settings: AppSettings) {
    return this.api.updateSettings(settings).pipe(
      tap(res => {
        if (res.success) {
          this.currency.set(settings.currency);
          this.currencySymbol.set(settings.currencySymbol);
          this.dateFormat.set(settings.dateFormat);
          this.toast.success('Preferences saved!');
        } else {
          this.toast.error(res.error ?? 'Failed to save preferences');
        }
      }),
      catchError(err => {
        this.toast.error(err?.error?.error ?? err?.message ?? 'Failed to save preferences');
        return of(null);
      })
    );
  }
}

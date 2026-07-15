import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { ToastService } from './toast.service';
import { tap, catchError, of } from 'rxjs';

export interface DashboardWidgets {
  onboarding: boolean;
  monthComparison: boolean;
  anomalyDetector: boolean;
  summaryGrid: boolean;
  chartsRow: boolean;
  bottomRow: boolean;
  upcomingBills: boolean;
  categorySpend: boolean;
  aiAudit: boolean;
}

export interface VisualSettings {
  themeName: 'dark' | 'light' | 'oled' | 'sepia' | 'nord' | 'cyberpunk';
  accentColor: 'indigo' | 'emerald' | 'rose' | 'amber' | 'violet' | 'cyan';
  fontFamily: 'Inter' | 'Outfit' | 'Roboto' | 'Playfair' | 'Lexend';
  borderRadius: 'sharp' | 'classic' | 'smooth' | 'rounded';
  density: 'comfortable' | 'compact';
  dashboardWidgets: DashboardWidgets;
}

export interface AppSettings {
  currency: string;
  currencySymbol: string;
  dateFormat: string;
  theme?: string;
  monthlyReportEnabled: boolean;
}

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  // Global reactive settings — used by pipes and components across the app
  readonly currency = signal('USD');
  readonly currencySymbol = signal('$');
  readonly dateFormat = signal('MM/dd/yyyy');
  readonly monthlyReportEnabled = signal(true);
  readonly loaded = signal(false);

  // Extended visual settings signals
  readonly themeName = signal<'dark' | 'light' | 'oled' | 'sepia' | 'nord' | 'cyberpunk'>('dark');
  readonly accentColor = signal<'indigo' | 'emerald' | 'rose' | 'amber' | 'violet' | 'cyan'>('indigo');
  readonly fontFamily = signal<'Inter' | 'Outfit' | 'Roboto' | 'Playfair' | 'Lexend'>('Inter');
  readonly borderRadius = signal<'sharp' | 'classic' | 'smooth' | 'rounded'>('smooth');
  readonly density = signal<'comfortable' | 'compact'>('comfortable');
  readonly dashboardWidgets = signal<DashboardWidgets>({
    onboarding: true,
    monthComparison: true,
    anomalyDetector: true,
    summaryGrid: true,
    chartsRow: true,
    bottomRow: true,
    upcomingBills: true,
    categorySpend: true,
    aiAudit: true
  });

  readonly currencies = [
    { code: 'USD', symbol: '$', name: 'US Dollar' },
    { code: 'EUR', symbol: '€', name: 'Euro' },
    { code: 'GBP', symbol: '£', name: 'British Pound' },
    { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
    { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
    { code: 'KRW', symbol: '₩', name: 'Korean Won' },
    { code: 'CAD', symbol: 'CAD$', name: 'Canadian Dollar' },
    { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
    { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
  ];

  getSymbol(code: string): string {
    const found = this.currencies.find(c => c.code.toUpperCase() === (code || 'USD').toUpperCase());
    return found ? found.symbol : '$';
  }

  load() {
    return this.api.getSettings().pipe(
      tap(res => {
        console.log('Settings loaded', res);
        if (res.success && res.data) {
          this.currency.set(res.data.currency ?? 'USD');
          this.currencySymbol.set(res.data.currencySymbol ?? '$');
          this.dateFormat.set(res.data.dateFormat ?? 'MM/dd/yyyy');
          this.monthlyReportEnabled.set(res.data.monthlyReportEnabled !== false);
          this.parseTheme(res.data.theme);
        }
        this.loaded.set(true);
      }),
      catchError(() => {
        this.loaded.set(true);
        this.applyVisualSettings();
        return of(null);
      })
    );
  }

  save(settings: AppSettings) {
    // Automatically serialize visual settings signals into the theme field
    const themeObj: VisualSettings = {
      themeName: this.themeName(),
      accentColor: this.accentColor(),
      fontFamily: this.fontFamily(),
      borderRadius: this.borderRadius(),
      density: this.density(),
      dashboardWidgets: this.dashboardWidgets()
    };
    settings.theme = JSON.stringify(themeObj);

    return this.api.updateSettings(settings).pipe(
      tap(res => {
        if (res.success) {
          this.currency.set(settings.currency);
          this.currencySymbol.set(settings.currencySymbol);
          this.dateFormat.set(settings.dateFormat);
          this.monthlyReportEnabled.set(settings.monthlyReportEnabled);
          this.applyVisualSettings();
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

  applyVisualSettings() {
    if (typeof document === 'undefined') return;
    const html = document.documentElement;
    html.setAttribute('data-theme', this.themeName());
    html.setAttribute('data-accent', this.accentColor());
    html.setAttribute('data-font', this.fontFamily());
    html.setAttribute('data-radius', this.borderRadius());
    html.setAttribute('data-density', this.density());
  }

  private parseTheme(themeStr: string | undefined) {
    let parsed: Partial<VisualSettings> = {};
    
    // Default values
    let themeVal: VisualSettings['themeName'] = 'dark';
    let accentVal: VisualSettings['accentColor'] = 'indigo';
    let fontVal: VisualSettings['fontFamily'] = 'Inter';
    let radiusVal: VisualSettings['borderRadius'] = 'smooth';
    let densityVal: VisualSettings['density'] = 'comfortable';
    let widgetsVal: DashboardWidgets = {
      onboarding: true,
      monthComparison: true,
      anomalyDetector: true,
      summaryGrid: true,
      chartsRow: true,
      bottomRow: true,
      upcomingBills: true,
      categorySpend: true,
      aiAudit: true
    };

    if (themeStr) {
      if (themeStr.startsWith('{')) {
        try {
          parsed = JSON.parse(themeStr);
          themeVal = parsed.themeName ?? 'dark';
          accentVal = parsed.accentColor ?? 'indigo';
          fontVal = parsed.fontFamily ?? 'Inter';
          radiusVal = parsed.borderRadius ?? 'smooth';
          densityVal = parsed.density ?? 'comfortable';
          if (parsed.dashboardWidgets) {
            widgetsVal = { ...widgetsVal, ...parsed.dashboardWidgets };
          }
        } catch (e) {
          console.warn('Failed to parse theme JSON', e);
        }
      } else {
        themeVal = (themeStr === 'light' || themeStr === 'dark' || themeStr === 'oled' || themeStr === 'sepia' || themeStr === 'nord' || themeStr === 'cyberpunk')
          ? themeStr as any
          : 'dark';
      }
    }

    this.themeName.set(themeVal);
    this.accentColor.set(accentVal);
    this.fontFamily.set(fontVal);
    this.borderRadius.set(radiusVal);
    this.density.set(densityVal);
    this.dashboardWidgets.set(widgetsVal);

    this.applyVisualSettings();
  }
}

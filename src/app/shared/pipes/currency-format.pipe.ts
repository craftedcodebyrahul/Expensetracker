import { Pipe, PipeTransform, inject } from '@angular/core';
import { SettingsService } from '../../core/services/settings.service';

@Pipe({ name: 'currencyFormat', standalone: true })
export class CurrencyFormatPipe implements PipeTransform {
  private settingsService = inject(SettingsService);

  transform(value: number, symbol?: string, decimals = 2): string {
    const sym = symbol !== undefined ? symbol : this.settingsService.currencySymbol();
    if (value == null || isNaN(value)) return `${sym}0.00`;
    const formatted = Math.abs(value).toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    return `${sym}${formatted}`;
  }
}

import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LayoutService {
  /** Whether the sidebar is collapsed — shared between sidebar and the toggle button in app.ts */
  readonly collapsed = signal(false);

  /** Mobile menu open state for drawer overlay */
  readonly mobileMenuOpen = signal(false);

  toggle() { this.collapsed.update(v => !v); }

  toggleMobileMenu() { this.mobileMenuOpen.update(v => !v); }
}

import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LayoutService {
  /** Whether the sidebar is collapsed — shared between sidebar and the toggle button in app.ts */
  readonly collapsed = signal(false);

  /** Mobile menu open state for drawer overlay */
  readonly mobileMenuOpen = signal(false);

  /** AI Finance Coach drawer open state */
  readonly aiCoachOpen = signal(false);

  toggle() { this.collapsed.update(v => !v); }

  toggleMobileMenu() { this.mobileMenuOpen.update(v => !v); }

  toggleAiCoach() { this.aiCoachOpen.update(v => !v); }
}

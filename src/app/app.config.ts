import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  APP_INITIALIZER,
  inject,
} from '@angular/core';
import { provideRouter, withViewTransitions } from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { routes } from './app.routes';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { AuthService } from './core/services/auth.service';
import { firstValueFrom } from 'rxjs';

/**
 * Run auth.init() before the router performs its first navigation.
 * This ensures guards see the correct login state on the very first load
 * (including after the OAuth callback redirect).
 */
function initAuth() {
  const auth = inject(AuthService);
  return () => firstValueFrom(auth.init(), { defaultValue: null });
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withViewTransitions()),
    provideHttpClient(withFetch()),
    provideClientHydration(withEventReplay()),
    {
      provide: APP_INITIALIZER,
      useFactory: initAuth,
      multi: true,
      deps: [],
    },
  ]
};

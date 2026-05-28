import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Protects routes that require a logged-in user.
 * Auth is guaranteed to be initialized by APP_INITIALIZER before guards run.
 */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isLoggedIn) return true;
  return router.createUrlTree(['/login']);
};

/**
 * Prevents logged-in users from seeing the login page.
 */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isLoggedIn) return true;
  return router.createUrlTree(['/']);
};

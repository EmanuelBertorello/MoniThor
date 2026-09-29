import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth.service';

function waitForInit(auth: AuthService): Promise<void> {
  if (auth.initialized()) return Promise.resolve();
  return new Promise(resolve => {
    const id = setInterval(() => {
      if (auth.initialized()) { clearInterval(id); resolve(); }
    }, 50);
  });
}

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await waitForInit(auth);
  return auth.isAuthenticated() ? true : router.createUrlTree(['/login']);
};

export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await waitForInit(auth);
  return auth.isAdmin() ? true : router.createUrlTree(['/dashboard']);
};

export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await waitForInit(auth);
  return !auth.isAuthenticated() ? true : router.createUrlTree(['/dashboard']);
};

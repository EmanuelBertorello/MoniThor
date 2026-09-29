import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, switchMap } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return from(auth.getIdToken()).pipe(
    switchMap(token => {
      // ngrok-skip-browser-warning: el plan gratuito de ngrok le devuelve una
      // pagina HTML de advertencia a cualquier pedido con User-Agent de
      // navegador. Sin este header la API contesta HTML en vez de JSON y se
      // rompe todo. El valor da igual, alcanza con que el header exista.
      const headers: Record<string, string> = { 'ngrok-skip-browser-warning': 'true' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const cloned = req.clone({ setHeaders: headers });
      return next(cloned).pipe(
        catchError(err => {
          if (err.status === 401) router.navigate(['/login']);
          return throwError(() => err);
        })
      );
    })
  );
};

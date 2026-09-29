import { ApplicationConfig, provideZoneChangeDetection, APP_INITIALIZER } from '@angular/core';
import { provideRouter, withViewTransitions } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { cargarRuntimeConfig } from './core/services/runtime-config';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withViewTransitions()),
    provideHttpClient(withInterceptors([authInterceptor])),
    // Lee /config.json antes del primer render, para que ApiService y el socket
    // ya conozcan la URL del backend. En Angular 18 todavia va con el token
    // APP_INITIALIZER (provideAppInitializer llego en la 19).
    { provide: APP_INITIALIZER, useFactory: () => cargarRuntimeConfig, multi: true },
  ],
};

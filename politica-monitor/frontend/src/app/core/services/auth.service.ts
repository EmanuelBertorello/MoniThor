import { Injectable, signal, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from 'firebase/auth';
import { environment } from '../../../environments/environment';
import { apiBaseUrl } from './runtime-config';

export interface AppUser {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'ANALYST' | 'VIEWER';
  plan: 'BASICO' | 'CAMPANA' | 'PREMIUM';
  isActive: boolean;
  demoExpiresAt?: string | null;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private router = inject(Router);

  private app = getApps().length ? getApps()[0] : initializeApp(environment.firebase);
  readonly firebaseAuth = getAuth(this.app);

  readonly firebaseUser = signal<FirebaseUser | null>(null);
  readonly appUser = signal<AppUser | null>(null);
  readonly loading = signal(true);
  readonly initialized = signal(false);
  readonly firebaseReady = signal(false);

  readonly isAuthenticated = computed(() => !!this.firebaseUser());
  readonly isAdmin = computed(() => this.appUser()?.role === 'ADMIN');
  readonly isViewer = computed(() => this.appUser()?.role === 'VIEWER');

  constructor() {
    onAuthStateChanged(this.firebaseAuth, async (user) => {
      this.firebaseUser.set(user);
      this.firebaseReady.set(true);

      if (user) {
        try {
          const token = await user.getIdToken();
          // apiBaseUrl() y no environment.apiUrl: en el build de produccion esa
          // constante todavia apunta al Render borrado, asi que /auth/me daba
          // 404 siempre, appUser quedaba en null y de ahi salia todo lo que
          // depende de el — el indicador en "Offline" (el socket solo conecta
          // cuando hay appUser) y el menu de admin escondido.
          const apiUrl = apiBaseUrl() || '';
          const res = await fetch(`${apiUrl}/api/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            this.setAppUser(data.user ?? data);
          } else {
            this.loading.set(false);
            this.initialized.set(true);
          }
        } catch {
          this.loading.set(false);
          this.initialized.set(true);
        }
      } else {
        this.appUser.set(null);
        this.loading.set(false);
        this.initialized.set(true);
      }
    });
  }

  setAppUser(user: AppUser) {
    this.appUser.set(user);
    this.loading.set(false);
    this.initialized.set(true);
  }

  async login(email: string, password: string): Promise<void> {
    await signInWithEmailAndPassword(this.firebaseAuth, email, password);
  }

  async logout(): Promise<void> {
    await signOut(this.firebaseAuth);
    this.appUser.set(null);
    this.initialized.set(false);
    this.loading.set(true);
    this.router.navigate(['/login']);
  }

  async getIdToken(): Promise<string | null> {
    return this.firebaseAuth.currentUser?.getIdToken() ?? null;
  }
}

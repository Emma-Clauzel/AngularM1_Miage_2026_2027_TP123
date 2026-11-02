import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs';
import { AuthResponse } from '../models/auth-response.model';
import { ProfileAvatar } from '../models/profile-avatar.model';
import { PublicAccount } from '../models/public-account.model';
import { User } from '../models/user.model';

/** Handles authentication and the current user's profile. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  readonly currentUser = signal<User | null>(null);
  readonly token = signal<string | null>(localStorage.getItem('gpc_token'));

  /** Reloads the signed-in user's profile from the token saved in this browser. */
  restoreSession(): void {
    if (!this.token() || this.currentUser()) return;

    this.profile().subscribe({
      error: () => {
        // Keep the saved token if the API is temporarily unavailable.
      },
    });
  }

  login(email: string, password: string) {
    return this.http
      .post<AuthResponse>('/api/auth/login', { email, password })
      .pipe(tap((response) => this.storeAuthentication(response)));
  }

  publicAccounts() {
    return this.http.get<PublicAccount[]>('/api/auth/accounts');
  }

  deletePublicAccount(id: string, password: string) {
    return this.http.delete<void>(`/api/auth/accounts/${encodeURIComponent(id)}`, { body: { password } });
  }

  register(name: string, email: string, password: string, avatar: ProfileAvatar) {
    return this.http.post<AuthResponse>('/api/auth/register', { name, email, password, avatar });
  }

  profile() {
    return this.http
      .get<User>('/api/users/me')
      .pipe(tap((user) => this.currentUser.set(user)));
  }

  update(name: string, avatar?: ProfileAvatar) {
    return this.http
      .put<User>('/api/users/me', { name, ...(avatar ? { avatar } : {}) })
      .pipe(tap((user) => this.currentUser.set(user)));
  }

  logout(): void {
    localStorage.removeItem('gpc_token');
    this.token.set(null);
    this.currentUser.set(null);
  }

  private storeAuthentication(response: AuthResponse): void {
    localStorage.setItem('gpc_token', response.token);
    this.token.set(response.token);
    this.currentUser.set(response.user);
  }
}

import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { MusicPlayerService } from '../../shared/services/music-player.service';
import { AuthService } from '../../shared/services/auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class AppComponent {
  readonly auth = inject(AuthService);
  readonly player = inject(MusicPlayerService);
  readonly darkTheme = signal(false);
  private readonly router = inject(Router);

  constructor() {
    this.auth.restoreSession();
    try {
      this.darkTheme.set(localStorage.getItem('gpc-theme') === 'dark');
    } catch {
      // Le thème clair reste le choix par défaut si le stockage est indisponible.
    }
    this.applyTheme();
  }

  get isNowPlayingPage(): boolean {
    return this.router.url.startsWith('/now-playing');
  }

  get isTracksPage(): boolean {
    return this.router.url.startsWith('/tracks');
  }

  logout(): void {
    this.player.clear();
    this.auth.logout();
    void this.router.navigateByUrl('/login');
  }

  toggleTheme(): void {
    this.darkTheme.update((enabled) => !enabled);
    try {
      localStorage.setItem('gpc-theme', this.darkTheme() ? 'dark' : 'light');
    } catch {
      // Le changement de thème reste appliqué jusqu'au rechargement de la page.
    }
    this.applyTheme();
  }

  private applyTheme(): void {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark-theme', this.darkTheme());
    }
  }
}

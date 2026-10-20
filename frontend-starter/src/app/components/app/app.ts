import { Component, inject } from '@angular/core';
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
  private readonly router = inject(Router);

  get isNowPlayingPage(): boolean {
    return this.router.url.startsWith('/now-playing');
  }

  logout(): void {
    this.player.clear();
    this.auth.logout();
    void this.router.navigateByUrl('/login');
  }
}

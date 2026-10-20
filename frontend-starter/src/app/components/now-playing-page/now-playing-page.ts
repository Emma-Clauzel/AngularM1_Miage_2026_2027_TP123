import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MusicPlayerService } from '../../shared/services/music-player.service';
@Component({ imports: [RouterLink], templateUrl: './now-playing-page.html', styleUrl: './now-playing-page.css' })
export class NowPlayingPageComponent { readonly player = inject(MusicPlayerService); }

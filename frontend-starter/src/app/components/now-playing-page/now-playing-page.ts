import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MusicPlayerService } from '../../shared/services/music-player.service';
@Component({ imports: [RouterLink], templateUrl: './now-playing-page.html', styleUrl: './now-playing-page.css' })
export class NowPlayingPageComponent {
  readonly player = inject(MusicPlayerService);
  readonly Math = Math;
  readonly spikePath = computed(() => {
    const levels = this.player.bassBands();
    const overall = this.player.audioLevel();
    const points: string[] = [];
    const spikes = 24;
    for (let index = 0; index < spikes * 2; index++) {
      const angle = -Math.PI / 2 + index * Math.PI / spikes;
      const isSpike = index % 2 === 0;
      const band = levels[Math.floor(index / 2) % levels.length] ?? 0;
      const irregularity = 0.72 + ((Math.sin(index * 17.13) + 1) / 2) * 0.55;
      const rawLevel = Math.min(1, band * 0.85 + overall * 0.15);
      const level = Math.pow(rawLevel, 40.2);
      const radius = isSpike ? 165 + level * 265 * irregularity : 156 + ((index * 13) % 9);
      const x = 250 + Math.cos(angle) * radius;
      const y = 250 + Math.sin(angle) * radius;
      points.push(`${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    return `${points.join(' ')}Z`;
  });

  startTrainingCurrent(): void {
    const track = this.player.currentTrack();
    if (track) this.player.startTraining(track);
  }
}

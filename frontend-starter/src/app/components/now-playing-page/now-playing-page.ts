import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MusicPlayerService } from '../../shared/services/music-player.service';
import { TrackService } from '../../shared/services/track.service';
import { Track } from '../../shared/models/track.model';
@Component({ imports: [RouterLink], templateUrl: './now-playing-page.html', styleUrl: './now-playing-page.css' })
export class NowPlayingPageComponent {
  readonly player = inject(MusicPlayerService);
  private readonly tracksApi = inject(TrackService);
  readonly Math = Math;
  readonly practiceLoopName = signal('');
  readonly practiceLoopError = signal('');
  readonly savingPracticeLoop = signal(false);
  readonly deletingPracticeLoopId = signal<string | null>(null);
  readonly editingPracticeLoopId = signal<string | null>(null);
  readonly editingPracticeLoopName = signal('');
  readonly renamingPracticeLoopId = signal<string | null>(null);
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

  setPracticeLoopName(event: Event): void {
    this.practiceLoopName.set((event.target as HTMLInputElement).value);
  }

  savePracticeLoop(): void {
    const track = this.player.currentTrack();
    const start = this.player.loopStart();
    const end = this.player.loopEnd();
    const name = this.practiceLoopName().trim();
    if (!track || start === null || end === null || end <= start || this.savingPracticeLoop()) return;
    if (!name) {
      this.practiceLoopError.set('Donne un nom au passage avant de l’enregistrer.');
      return;
    }
    if (name.length > 60) {
      this.practiceLoopError.set('Le nom du passage ne peut pas dépasser 60 caractères.');
      return;
    }

    this.savingPracticeLoop.set(true);
    this.practiceLoopError.set('');
    this.tracksApi.savePracticeLoop(track.id, { name, start, end }).subscribe({
      next: ({ practiceLoops }) => {
        this.syncPracticeLoops(track, practiceLoops);
        this.practiceLoopName.set('');
        this.player.trainingMessage.set(`Passage « ${name} » enregistré.`);
      },
      error: (error: { error?: { message?: string } }) => {
        this.practiceLoopError.set(error.error?.message ?? 'Impossible d’enregistrer ce passage.');
        this.savingPracticeLoop.set(false);
      },
      complete: () => this.savingPracticeLoop.set(false),
    });
  }

  loadPracticeLoop(loop: { name: string; start: number; end: number }): void {
    this.practiceLoopError.set('');
    this.player.loadPracticeLoop(loop);
  }

  startRenamePracticeLoop(loop: { id: string; name: string }): void {
    this.editingPracticeLoopId.set(loop.id);
    this.editingPracticeLoopName.set(loop.name);
    this.practiceLoopError.set('');
  }

  setEditingPracticeLoopName(event: Event): void {
    this.editingPracticeLoopName.set((event.target as HTMLInputElement).value);
  }

  cancelRenamePracticeLoop(): void {
    this.editingPracticeLoopId.set(null);
    this.editingPracticeLoopName.set('');
  }

  renamePracticeLoop(loopId: string): void {
    const track = this.player.currentTrack();
    const name = this.editingPracticeLoopName().trim();
    if (!track || !name || name.length > 60 || this.renamingPracticeLoopId()) {
      if (!name) this.practiceLoopError.set('Le nom du passage ne peut pas être vide.');
      else if (name.length > 60) this.practiceLoopError.set('Le nom du passage ne peut pas dépasser 60 caractères.');
      return;
    }
    this.renamingPracticeLoopId.set(loopId);
    this.practiceLoopError.set('');
    this.tracksApi.renamePracticeLoop(track.id, loopId, name).subscribe({
      next: ({ practiceLoops }) => {
        this.syncPracticeLoops(track, practiceLoops);
        this.cancelRenamePracticeLoop();
        this.player.trainingMessage.set('Passage renommé.');
      },
      error: (error: { error?: { message?: string } }) => {
        this.practiceLoopError.set(error.error?.message ?? 'Impossible de renommer ce passage.');
        this.renamingPracticeLoopId.set(null);
      },
      complete: () => this.renamingPracticeLoopId.set(null),
    });
  }

  deletePracticeLoop(loopId: string): void {
    const track = this.player.currentTrack();
    if (!track || this.deletingPracticeLoopId()) return;
    this.deletingPracticeLoopId.set(loopId);
    this.practiceLoopError.set('');
    this.tracksApi.deletePracticeLoop(track.id, loopId).subscribe({
      next: ({ practiceLoops }) => {
        this.syncPracticeLoops(track, practiceLoops);
        this.player.trainingMessage.set('Passage supprimé.');
      },
      error: (error: { error?: { message?: string } }) => {
        this.practiceLoopError.set(error.error?.message ?? 'Impossible de supprimer ce passage.');
        this.deletingPracticeLoopId.set(null);
      },
      complete: () => this.deletingPracticeLoopId.set(null),
    });
  }

  private syncPracticeLoops(track: Track, practiceLoops: NonNullable<Track['practiceLoops']>): void {
    this.player.syncTrackMetadata({ ...track, practiceLoops });
  }
}

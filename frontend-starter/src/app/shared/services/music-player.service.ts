import { computed, inject, Injectable, signal } from '@angular/core';
import { Track } from '../models/track.model';
import { TrackService } from './track.service';

@Injectable({ providedIn: 'root' })
export class MusicPlayerService {
  private readonly tracksApi = inject(TrackService);
  private audio?: HTMLAudioElement;
  private audioUrl = '';
  private coverUrl = '';
  private requestId = 0;
  readonly currentTrack = signal<Track | null>(null);
  readonly queue = signal<Track[]>([]);
  readonly loading = signal(false);
  readonly playing = signal(false);
  readonly error = signal('');
  readonly cover = signal('');
  readonly currentTime = signal(0);
  readonly duration = signal(0);
  readonly loopMode = signal<'off' | 'all' | 'one'>('off');
  readonly shuffle = signal(false);
  private readonly history: string[] = [];
  private shuffledRemaining: string[] = [];
  readonly hasPrevious = computed(() => this.shuffle() ? this.history.length > 0 : this.currentIndex() > 0);
  readonly hasNext = computed(() => {
    const i = this.currentIndex();
    const count = this.queue().length;
    return count > 0 && (this.shuffle() ? this.shuffledRemaining.length > 0 || this.loopMode() === 'all' : i < 0 || i < count - 1 || this.loopMode() === 'all');
  });

  constructor() {
    if (typeof Audio !== 'undefined') {
      this.audio = new Audio(); this.audio.preload = 'auto';
      this.audio.addEventListener('play', () => this.playing.set(true));
      this.audio.addEventListener('pause', () => this.playing.set(false));
      this.audio.addEventListener('ended', () => this.onEnded());
      this.audio.addEventListener('timeupdate', () => this.currentTime.set(this.audio?.currentTime ?? 0));
      this.audio.addEventListener('durationchange', () => this.duration.set(this.audio?.duration || 0));
      this.audio.addEventListener('error', () => this.error.set('Le navigateur n’a pas réussi à lire ce fichier audio.'));
    }
  }
  setQueue(tracks: Track[]): void {
    this.queue.set(tracks);
    const availableIds = new Set(tracks.map((track) => track.id));
    this.history.splice(0, this.history.length, ...this.history.filter((id) => availableIds.has(id)));
    this.shuffledRemaining = this.shuffledRemaining.filter((id) => availableIds.has(id));
    if (this.shuffle()) {
      const currentId = this.currentTrack()?.id;
      const addedIds = tracks.map((track) => track.id).filter((id) => id !== currentId && !this.shuffledRemaining.includes(id));
      this.shuffledRemaining.push(...this.shuffleIds(addedIds));
    }
  }
  cycleLoopMode(): void { this.loopMode.update((mode) => mode === 'off' ? 'all' : mode === 'all' ? 'one' : 'off'); }
  toggleShuffle(): void {
    this.shuffle.update((enabled) => !enabled);
    this.shuffledRemaining = this.shuffle() ? this.makeShuffleQueue() : [];
    this.history.length = 0;
  }
  play(track: Track): void {
    if (this.currentTrack()?.id === track.id && this.audioUrl) { void this.resume(); return; }
    const id = ++this.requestId; this.loading.set(true); this.error.set(''); this.currentTrack.set(track); this.currentTime.set(0); this.duration.set(0); this.loadCover(track);
    this.tracksApi.audio(track.id).subscribe({
      next: (blob) => { if (id !== this.requestId || !this.audio) return; this.revokeAudio(); this.audioUrl = URL.createObjectURL(blob); this.audio.src = this.audioUrl; this.audio.load(); this.loading.set(false); void this.audio.play().catch(() => this.error.set('La lecture a été bloquée par le navigateur. Appuyez sur lecture pour réessayer.')); },
      error: () => { if (id !== this.requestId) return; this.loading.set(false); this.error.set('Impossible de charger ce morceau. Réessayez.'); },
    });
  }
  toggle(): void { if (this.loading()) return; if (this.playing()) this.audio?.pause(); else void this.resume(); }
  async resume(): Promise<void> { if (!this.audio || !this.audioUrl) return; try { await this.audio.play(); this.error.set(''); } catch { this.error.set('La lecture n’a pas pu démarrer. Réessayez.'); } }
  previous(): void {
    if (this.shuffle()) {
      const previousId = this.history.pop();
      const previousTrack = this.queue().find((track) => track.id === previousId);
      if (previousTrack) {
        const currentId = this.currentTrack()?.id;
        if (currentId && this.queue().some((track) => track.id === currentId)) this.shuffledRemaining.unshift(currentId);
        this.play(previousTrack);
        return;
      }
    }
    const i = this.currentIndex();
    if (i > 0) this.play(this.queue()[i - 1]);
  }
  next(): void {
    const tracks = this.queue();
    if (!tracks.length) return;
    const current = this.currentTrack();
    const i = this.currentIndex();
    if (this.shuffle()) {
      if (!this.shuffledRemaining.length && this.loopMode() === 'all') this.shuffledRemaining = this.makeShuffleQueue(true);
      const nextId = this.shuffledRemaining.shift();
      const nextTrack = tracks.find((track) => track.id === nextId);
      if (nextTrack) {
        if (current && tracks.some((track) => track.id === current.id)) this.history.push(current.id);
        this.play(nextTrack);
      }
      return;
    }
    if (i < 0) this.play(tracks[0]);
    else if (i < tracks.length - 1) this.play(tracks[i + 1]);
    else if (this.loopMode() === 'all') this.play(tracks[0]);
  }
  seek(event: Event): void { if (this.audio && this.duration()) this.audio.currentTime = Number((event.target as HTMLInputElement).value); }
  clear(): void {
    this.requestId++; this.audio?.pause(); this.audio?.removeAttribute('src'); this.audio?.load(); this.revokeAudio();
    if (this.coverUrl) URL.revokeObjectURL(this.coverUrl); this.coverUrl = ''; this.cover.set(''); this.currentTrack.set(null); this.queue.set([]); this.history.length = 0; this.shuffledRemaining = []; this.loopMode.set('off'); this.shuffle.set(false); this.loading.set(false); this.playing.set(false); this.error.set(''); this.currentTime.set(0); this.duration.set(0);
  }
  formatTime(seconds: number): string { if (!Number.isFinite(seconds)) return '0:00'; return Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2, '0'); }
  private currentIndex(): number { const id = this.currentTrack()?.id; return id ? this.queue().findIndex((track) => track.id === id) : -1; }
  private makeShuffleQueue(includeCurrentForLoop = false): string[] {
    const currentId = this.currentTrack()?.id;
    const ids = this.queue().map((track) => track.id).filter((id) => id !== currentId);
    if (includeCurrentForLoop && !ids.length && currentId && this.queue().some((track) => track.id === currentId)) ids.push(currentId);
    return this.shuffleIds(ids);
  }
  private shuffleIds(ids: string[]): string[] {
    const result = [...ids];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  private onEnded(): void {
    if (this.loopMode() === 'one' && this.audio) {
      this.audio.currentTime = 0;
      void this.resume();
    } else if (this.loopMode() === 'all' || this.shuffle() && this.shuffledRemaining.length > 0) this.next();
  }
  private loadCover(track: Track): void {
    if (!track.cover) { if (this.coverUrl) URL.revokeObjectURL(this.coverUrl); this.coverUrl = ''; this.cover.set(''); return; }
    this.tracksApi.cover(track.id).subscribe({ next: (blob) => { if (this.currentTrack()?.id !== track.id) return; if (this.coverUrl) URL.revokeObjectURL(this.coverUrl); this.coverUrl = URL.createObjectURL(blob); this.cover.set(this.coverUrl); }, error: () => this.cover.set('') });
  }
  private revokeAudio(): void { if (this.audioUrl) URL.revokeObjectURL(this.audioUrl); this.audioUrl = ''; }
}

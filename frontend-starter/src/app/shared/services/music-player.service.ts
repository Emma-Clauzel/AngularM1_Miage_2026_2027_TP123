import { computed, inject, Injectable, signal } from '@angular/core';
import { Track } from '../models/track.model';
import { TrackService } from './track.service';

@Injectable({ providedIn: 'root' })
export class MusicPlayerService {
  private readonly tracksApi = inject(TrackService);
  private audio?: HTMLAudioElement;
  private audioContext?: AudioContext;
  private analyser?: AnalyserNode;
  private audioSource?: MediaElementAudioSourceNode;
  private frequencyData?: Uint8Array<ArrayBuffer>;
  private previousFrequencyData?: Uint8Array<ArrayBuffer>;
  private waveformData?: Uint8Array<ArrayBuffer>;
  private bassFrame = 0;
  private lastBassUpdate = 0;
  private volumeFeedbackTimeout?: ReturnType<typeof setTimeout>;
  private audioUrl = '';
  private coverUrl = '';
  private requestId = 0;
  readonly currentTrack = signal<Track | null>(null);
  readonly queue = signal<Track[]>([]);
  readonly loading = signal(false);
  readonly playing = signal(false);
  readonly volume = signal(1);
  readonly volumeFeedback = signal<number | null>(null);
  readonly error = signal('');
  readonly cover = signal('');
  readonly currentTime = signal(0);
  readonly duration = signal(0);
  readonly bassLevel = signal(0);
  readonly bassBands = signal<number[]>(Array(16).fill(0));
  readonly audioLevel = signal(0);
  readonly beatPulse = signal(0);
  readonly trainingMode = signal(false);
  readonly playbackRate = signal(1);
  readonly loopStart = signal<number | null>(null);
  readonly loopEnd = signal<number | null>(null);
  readonly loopABActive = signal(false);
  readonly trainingMessage = signal('');
  readonly canLoopAB = computed(() => this.loopStart() !== null && this.loopEnd() !== null && this.loopEnd()! > this.loopStart()!);
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
      this.audio = new Audio(); this.audio.preload = 'auto'; this.audio.volume = this.volume();
      this.audio.addEventListener('play', () => {
        this.playing.set(true);
        this.startBassMeter();
      });
      this.audio.addEventListener('pause', () => {
        this.playing.set(false);
        this.stopBassMeter();
      });
      this.audio.addEventListener('ended', () => {
        const start = this.loopStart();
        if (this.loopABActive() && start !== null && this.audio) {
          this.audio.currentTime = start;
          void this.resume();
          return;
        }
        this.onEnded();
      });
      this.audio.addEventListener('timeupdate', () => {
        const time = this.audio?.currentTime ?? 0;
        const start = this.loopStart();
        const end = this.loopEnd();
        if (this.loopABActive() && start !== null && end !== null && time >= end && this.audio) {
          this.audio.currentTime = start;
          this.currentTime.set(start);
          return;
        }
        this.currentTime.set(time);
      });
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
  syncTrackMetadata(track: Track): void {
    if (this.currentTrack()?.id === track.id) this.currentTrack.set(track);
    this.queue.update((tracks) => tracks.map((item) => item.id === track.id ? { ...item, ...track } : item));
  }
  cycleLoopMode(): void { this.loopMode.update((mode) => mode === 'off' ? 'all' : mode === 'all' ? 'one' : 'off'); }
  adjustVolume(step: -1 | 1): void {
    const nextVolume = Math.max(0, Math.min(1, Math.round((this.volume() + step * 0.1) * 10) / 10));
    this.volume.set(nextVolume);
    if (this.audio) this.audio.volume = nextVolume;
    this.volumeFeedback.set(Math.round(nextVolume * 100));
    if (this.volumeFeedbackTimeout) clearTimeout(this.volumeFeedbackTimeout);
    this.volumeFeedbackTimeout = setTimeout(() => {
      this.volumeFeedback.set(null);
      this.volumeFeedbackTimeout = undefined;
    }, 1100);
  }
  toggleShuffle(): void {
    this.shuffle.update((enabled) => !enabled);
    this.shuffledRemaining = this.shuffle() ? this.makeShuffleQueue() : [];
    this.history.length = 0;
  }
  play(track: Track, training = false): void {
    if (training) {
      this.trainingMode.set(true);
      this.loopStart.set(null); this.loopEnd.set(null); this.loopABActive.set(false); this.trainingMessage.set('');
    } else {
      this.stopTraining();
    }
    if (this.audio) this.audio.playbackRate = this.playbackRate();
    if (this.currentTrack()?.id === track.id && this.audioUrl) { void this.resume(); return; }
    const id = ++this.requestId; this.loading.set(true); this.error.set(''); this.currentTrack.set(track); this.currentTime.set(0); this.duration.set(0); this.loadCover(track);
    this.tracksApi.audio(track.id).subscribe({
      next: (blob) => { if (id !== this.requestId || !this.audio) return; this.revokeAudio(); this.audioUrl = URL.createObjectURL(blob); this.audio.src = this.audioUrl; this.audio.load(); this.loading.set(false); void this.audio.play().catch(() => this.error.set('La lecture a été bloquée par le navigateur. Appuyez sur lecture pour réessayer.')); },
      error: () => { if (id !== this.requestId) return; this.loading.set(false); this.error.set('Impossible de charger ce morceau. Réessayez.'); },
    });
  }
  startTraining(track: Track): void {
    const preservePause = this.currentTrack()?.id === track.id && !!this.audioUrl && this.audio?.paused === true;
    this.stopTraining();
    this.playbackRate.set(1);
    if (this.audio) this.audio.playbackRate = 1;
    if (preservePause) {
      this.trainingMode.set(true);
      this.loopStart.set(null);
      this.loopEnd.set(null);
      this.loopABActive.set(false);
      this.trainingMessage.set('');
      return;
    }
    this.play(track, true);
  }
  stopTraining(): void {
    this.trainingMode.set(false);
    this.playbackRate.set(1);
    if (this.audio) this.audio.playbackRate = 1;
    this.loopStart.set(null); this.loopEnd.set(null); this.loopABActive.set(false); this.trainingMessage.set('');
  }
  setPlaybackRate(event: Event): void {
    const rate = Number((event.target as HTMLSelectElement).value);
    if (!Number.isFinite(rate)) return;
    this.applyPlaybackRate(rate);
  }
  adjustPlaybackRate(step: -1 | 1): void {
    this.applyPlaybackRate(this.playbackRate() + step * 0.25);
  }
  private applyPlaybackRate(rate: number): void {
    const clampedRate = Math.min(2, Math.max(0.25, rate));
    this.playbackRate.set(clampedRate);
    if (this.audio) {
      this.audio.playbackRate = clampedRate;
      this.audio.preservesPitch = true;
    }
  }
  markLoopStart(): void {
    const start = this.audio?.currentTime ?? this.currentTime();
    this.loopStart.set(start);
    if (this.loopEnd() !== null && this.loopEnd()! <= start) {
      this.loopEnd.set(null);
      this.loopABActive.set(false);
    }
    this.trainingMessage.set('Point A défini. Place-toi à la fin du passage et marque le point B.');
  }
  markLoopEnd(): void {
    const end = this.audio?.currentTime ?? this.currentTime();
    const start = this.loopStart();
    if (start === null) {
      this.trainingMessage.set('Définis d’abord le point A.');
      return;
    }
    if (end <= start) {
      this.trainingMessage.set('Le point B doit être après le point A.');
      return;
    }
    this.loopEnd.set(end);
    this.loopABActive.set(true);
    this.trainingMessage.set('Boucle A–B activée.');
  }
  loadPracticeLoop(loop: { name: string; start: number; end: number }): void {
    if (!Number.isFinite(loop.start) || !Number.isFinite(loop.end) || loop.start < 0 || loop.end <= loop.start) {
      this.trainingMessage.set('Ce passage enregistré contient des positions invalides.');
      return;
    }
    if (this.duration() > 0 && loop.end > this.duration()) {
      this.trainingMessage.set('Ce passage dépasse la durée du morceau. Redéfinis les points A et B.');
      return;
    }
    this.loopStart.set(loop.start);
    this.loopEnd.set(loop.end);
    this.loopABActive.set(true);
    if (this.audio) {
      this.audio.currentTime = loop.start;
      this.currentTime.set(loop.start);
    }
    this.trainingMessage.set(`Passage « ${loop.name} » chargé et boucle activée.`);
  }
  toggleLoopAB(): void {
    if (!this.canLoopAB()) {
      this.trainingMessage.set('Définis un point A puis un point B pour créer la boucle.');
      return;
    }
    this.loopABActive.update((active) => !active);
    this.trainingMessage.set(this.loopABActive() ? 'Boucle A–B activée.' : 'Boucle A–B en pause.');
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
        this.play(previousTrack, this.trainingMode());
        return;
      }
    }
    const i = this.currentIndex();
    if (i > 0) this.play(this.queue()[i - 1], this.trainingMode());
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
        this.play(nextTrack, this.trainingMode());
      }
      return;
    }
    if (i < 0) this.play(tracks[0], this.trainingMode());
    else if (i < tracks.length - 1) this.play(tracks[i + 1], this.trainingMode());
    else if (this.loopMode() === 'all') this.play(tracks[0], this.trainingMode());
  }
  seek(event: Event): void { if (this.audio && this.duration()) this.audio.currentTime = Number((event.target as HTMLInputElement).value); }
  clear(): void {
    this.requestId++; this.audio?.pause(); this.audio?.removeAttribute('src'); this.audio?.load(); this.revokeAudio();
    this.stopBassMeter(); this.stopTraining(); if (this.coverUrl) URL.revokeObjectURL(this.coverUrl); this.coverUrl = ''; this.cover.set(''); this.currentTrack.set(null); this.queue.set([]); this.history.length = 0; this.shuffledRemaining = []; this.loopMode.set('off'); this.shuffle.set(false); this.loading.set(false); this.playing.set(false); this.error.set(''); this.currentTime.set(0); this.duration.set(0);
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
  private startBassMeter(): void {
    if (typeof window === 'undefined' || !this.audio) return;
    try {
      if (!this.audioContext) {
        this.audioContext = new AudioContext();
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 4096;
        this.analyser.smoothingTimeConstant = 0.35;
        this.audioSource = this.audioContext.createMediaElementSource(this.audio);
        this.audioSource.connect(this.analyser);
        this.analyser.connect(this.audioContext.destination);
        this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
        this.previousFrequencyData = new Uint8Array(this.analyser.frequencyBinCount);
        this.waveformData = new Uint8Array(this.analyser.fftSize);
      }
      if (this.audioContext.state === 'suspended') void this.audioContext.resume();
      if (!this.analyser || !this.frequencyData || !this.previousFrequencyData || !this.waveformData || this.bassFrame) return;
      const sample = (time: number) => {
        if (!this.audio || this.audio.paused || !this.analyser || !this.frequencyData || !this.previousFrequencyData || !this.waveformData) {
          this.bassFrame = 0;
          return;
        }
        if (time - this.lastBassUpdate >= 50) {
          this.lastBassUpdate = time;
          this.analyser.getByteFrequencyData(this.frequencyData);
          this.analyser.getByteTimeDomainData(this.waveformData);
          let spectralFlux = 0;
          const rhythmBins = Math.min(32, this.frequencyData.length);
          for (let bin = 2; bin < rhythmBins; bin++) {
            spectralFlux += Math.max(0, this.frequencyData[bin] - this.previousFrequencyData[bin]);
          }
          const averageFlux = spectralFlux / Math.max(1, rhythmBins - 2);
          this.previousFrequencyData.set(this.frequencyData);
          let squaredAmplitude = 0;
          for (const sample of this.waveformData) {
            const amplitude = (sample - 128) / 128;
            squaredAmplitude += amplitude * amplitude;
          }
          const rms = Math.sqrt(squaredAmplitude / this.waveformData.length);
          const overallTarget = Math.min(1, rms * 9);
          const previousLevel = this.audioLevel();
          const onset = Math.max(0, overallTarget - previousLevel - 0.025);
          const volumePulse = onset * 4;
          const rhythmPulse = Math.max(0, (averageFlux - 1.5) * 0.12);
          const pulseTarget = Math.min(1, Math.max(volumePulse, rhythmPulse));
          this.beatPulse.update((pulse) => Math.max(pulseTarget, pulse * 0.72));
          this.audioLevel.set(Math.max(overallTarget, previousLevel * 0.78));
          const binHz = this.audioContext!.sampleRate / this.analyser!.fftSize;
          const bands = this.bassBands();
          const nextBands = bands.map((level, index) => {
            const start = Math.max(1, Math.floor((30 + index * 11) / binHz));
            const end = Math.max(start + 1, Math.floor((41 + index * 11) / binHz));
            let energy = 0;
            for (let bin = start; bin < end && bin < this.frequencyData!.length; bin++) energy += this.frequencyData![bin];
            const target = Math.min(1, (energy / Math.max(1, end - start)) / 90);
            return Math.max(target, level * 0.86);
          });
          this.bassBands.set(nextBands);
          const target = nextBands.reduce((sum, level) => sum + level, 0) / nextBands.length;
          this.bassLevel.update((level) => level * 0.35 + target * 0.65);
        }
        this.bassFrame = requestAnimationFrame(sample);
      };
      this.bassFrame = requestAnimationFrame(sample);
    } catch {
      // Audio remains playable if Web Audio analysis is unavailable.
    }
  }
  private stopBassMeter(): void {
    if (this.bassFrame && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this.bassFrame);
    this.bassFrame = 0;
    this.bassLevel.set(0);
    this.bassBands.set(Array(16).fill(0));
    this.audioLevel.set(0);
    this.beatPulse.set(0);
    this.previousFrequencyData?.fill(0);
  }
  private loadCover(track: Track): void {
    if (!track.cover) { if (this.coverUrl) URL.revokeObjectURL(this.coverUrl); this.coverUrl = ''; this.cover.set(''); return; }
    this.tracksApi.cover(track.id).subscribe({ next: (blob) => { if (this.currentTrack()?.id !== track.id) return; if (this.coverUrl) URL.revokeObjectURL(this.coverUrl); this.coverUrl = URL.createObjectURL(blob); this.cover.set(this.coverUrl); }, error: () => this.cover.set('') });
  }
  private revokeAudio(): void { if (this.audioUrl) URL.revokeObjectURL(this.audioUrl); this.audioUrl = ''; }
}

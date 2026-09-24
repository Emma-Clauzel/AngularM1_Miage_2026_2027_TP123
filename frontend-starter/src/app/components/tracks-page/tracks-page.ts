import { HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { Component, ElementRef, inject, OnDestroy, signal, ViewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Track } from '../../shared/models/track.model';
import { TrackService } from '../../shared/services/track.service';

const MAX_AUDIO_SIZE = 25 * 1024 * 1024;
const ALLOWED_AUDIO_TYPES = new Set([
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/mp4',
  'audio/x-m4a',
]);

@Component({
  imports: [ReactiveFormsModule],
  templateUrl: './tracks-page.html',
  styleUrl: './tracks-page.css',
})
export class TracksPageComponent implements OnDestroy {
  private readonly service = inject(TrackService);

  @ViewChild('audioInput') private audioInput?: ElementRef<HTMLInputElement>;
  @ViewChild('deleteDialog') private deleteDialog?: ElementRef<HTMLDialogElement>;

  readonly tracks = signal<Track[]>([]);
  readonly page = signal(1);
  readonly pages = signal(1);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly uploadLoading = signal(false);
  readonly uploadProgress = signal<number | null>(null);
  readonly uploadError = signal('');
  readonly uploadSuccess = signal('');
  readonly audioUrl = signal('');
  readonly audioLoading = signal(false);
  readonly audioError = signal('');
  readonly playingTitle = signal('');
  readonly playingTrackId = signal('');
  readonly deletingTrackId = signal('');
  readonly deleteError = signal('');
  readonly trackPendingDeletion = signal<Track | null>(null);
  readonly title = new FormControl('', { nonNullable: true });
  file?: File;

  constructor() {
    this.load();
  }

  choose(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.file = input.files?.[0];
    this.uploadError.set(this.file ? this.validateFile(this.file) : '');
    this.uploadSuccess.set('');
    console.debug('[TracksPage] Fichier sélectionné', this.file?.name);
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.service.list(this.page()).subscribe({
      next: (response) => {
        console.debug('[TracksPage] Pistes chargées', response.items.length);
        this.tracks.set(response.items);
        this.pages.set(response.pages);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        console.error('[TracksPage] Chargement impossible', error);
        this.error.set('Impossible de charger les pistes. Vérifiez votre connexion puis réessayez.');
        this.loading.set(false);
      },
    });
  }

  go(page: number): void {
    if (this.loading() || page < 1 || page > this.pages() || page === this.page()) return;
    this.page.set(page);
    this.load();
  }

  upload(): void {
    if (!this.file || this.uploadLoading()) return;

    const validationError = this.validateFile(this.file);
    if (validationError) {
      this.uploadError.set(validationError);
      return;
    }

    this.uploadError.set('');
    this.uploadSuccess.set('');
    this.uploadLoading.set(true);
    this.uploadProgress.set(null);
    const selectedFile = this.file;
    const trackTitle = this.title.value.trim() || selectedFile.name;

    this.service.upload(selectedFile, trackTitle).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.UploadProgress) {
          const total = event.total;
          this.uploadProgress.set(total ? Math.round((event.loaded / total) * 100) : null);
          return;
        }

        if (event.type === HttpEventType.Response && event.body) {
          const track = event.body;
          console.debug('[TracksPage] Piste envoyée', track.id);
          this.uploadProgress.set(100);
          this.uploadSuccess.set(`« ${track.title} » a été importé avec succès.`);
          this.title.setValue('');
          this.file = undefined;
          if (this.audioInput) this.audioInput.nativeElement.value = '';
          this.page.set(1);
          this.uploadLoading.set(false);
          this.load();
        }
      },
      error: (error: unknown) => {
        console.error('[TracksPage] Envoi impossible', error);
        this.uploadError.set(this.serverMessage(error, 'L’import a échoué. Vérifiez le fichier et réessayez.'));
        this.uploadLoading.set(false);
        this.uploadProgress.set(null);
      },
    });
  }

  play(track: Track): void {
    if (this.audioLoading()) return;
    this.audioLoading.set(true);
    this.audioError.set('');
    this.service.audio(track.id).subscribe({
      next: (blob) => {
        console.debug('[TracksPage] Audio chargé', track.id);
        this.revokeAudioUrl();
        this.audioUrl.set(URL.createObjectURL(blob));
        this.playingTitle.set(track.title);
        this.playingTrackId.set(track.id);
        this.audioLoading.set(false);
      },
      error: (error: unknown) => {
        console.error('[TracksPage] Lecture impossible', error);
        this.audioError.set(this.serverMessage(error, 'Impossible de charger ce morceau. Réessayez.'));
        this.audioLoading.set(false);
      },
    });
  }

  requestDelete(track: Track): void {
    this.trackPendingDeletion.set(track);
    this.deleteDialog?.nativeElement.showModal();
  }

  cancelDelete(): void {
    if (this.deleteDialog?.nativeElement.open) this.deleteDialog.nativeElement.close();
    this.trackPendingDeletion.set(null);
  }

  confirmDelete(): void {
    const track = this.trackPendingDeletion();
    if (!track) return;
    this.deleteDialog?.nativeElement.close();
    this.trackPendingDeletion.set(null);
    if (this.deletingTrackId()) return;

    this.deleteError.set('');
    this.deletingTrackId.set(track.id);
    this.service.delete(track.id).subscribe({
      next: () => {
        console.debug('[TracksPage] Piste supprimée', track.id);
        if (this.playingTrackId() === track.id) {
          this.revokeAudioUrl();
          this.playingTitle.set('');
          this.playingTrackId.set('');
        }

        if (this.tracks().length === 1 && this.page() > 1) this.page.update((page) => page - 1);
        this.deletingTrackId.set('');
        this.load();
      },
      error: (error: unknown) => {
        console.error('[TracksPage] Suppression impossible', error);
        this.deleteError.set(this.serverMessage(error, 'Impossible de supprimer cette piste. Réessayez.'));
        this.deletingTrackId.set('');
      },
    });
  }

  audioPlaybackError(): void {
    this.audioError.set('Le navigateur n’a pas réussi à lire ce fichier audio.');
  }

  formatSize(bytes: number): string {
    return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
  }

  formatDate(date: string): string {
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(date));
  }

  ngOnDestroy(): void {
    this.revokeAudioUrl();
  }

  private validateFile(file: File): string {
    if (!ALLOWED_AUDIO_TYPES.has(file.type)) {
      return 'Format audio non accepté. Choisissez un fichier MP3, WAV, OGG ou M4A.';
    }
    if (file.size > MAX_AUDIO_SIZE) {
      return 'Le fichier dépasse la taille maximale autorisée de 25 Mo.';
    }
    return '';
  }

  private serverMessage(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      const message = error.error?.message;
      if (typeof message === 'string') return message;
      if (error.status === 413) return 'Le fichier dépasse la taille maximale autorisée de 25 Mo.';
    }
    return fallback;
  }

  private revokeAudioUrl(): void {
    const url = this.audioUrl();
    if (url) URL.revokeObjectURL(url);
    this.audioUrl.set('');
  }
}

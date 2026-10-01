import { HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { Component, computed, ElementRef, inject, OnDestroy, signal, ViewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { CoverSuggestion, Track } from '../../shared/models/track.model';
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
  @ViewChild('uploadCoverInput') private uploadCoverInput?: ElementRef<HTMLInputElement>;
  @ViewChild('deleteDialog') private deleteDialog?: ElementRef<HTMLDialogElement>;
  @ViewChild('coverDialog') private coverDialog?: ElementRef<HTMLDialogElement>;
  @ViewChild('searchInput') private searchInput?: ElementRef<HTMLInputElement>;

  readonly tracks = signal<Track[]>([]);
  readonly page = signal(1);
  readonly pages = signal(1);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly uploadLoading = signal(false);
  readonly uploadProgress = signal<number | null>(null);
  readonly uploadError = signal('');
  readonly uploadSuccess = signal('');
  readonly metadataLoading = signal(false);
  readonly embeddedCoverPreview = signal('');
  readonly audioUrl = signal('');
  readonly audioLoading = signal(false);
  readonly audioError = signal('');
  readonly playingTitle = signal('');
  readonly playingTrackId = signal('');
  readonly deletingTrackId = signal('');
  readonly deleteError = signal('');
  readonly trackPendingDeletion = signal<Track | null>(null);
  readonly coverImages = signal<Record<string, string>>({});
  readonly coverManagerTrack = signal<Track | null>(null);
  readonly coverSuggestions = signal<CoverSuggestion[]>([]);
  readonly coverLoading = signal(false);
  readonly coverSaving = signal(false);
  readonly coverError = signal('');
  readonly coverRightsConfirmed = signal(false);
  readonly coverSearchTitle = signal('');
  readonly coverSearchArtist = signal('');
  readonly coverSearchAlbum = signal('');
  readonly uploadCoverRightsConfirmed = signal(false);
  uploadCoverFile?: File;
  coverFile?: File;
  readonly searchOpen = signal(false);
  readonly searchTerm = signal('');
  readonly artistFilter = signal('');
  readonly sizeFilter = signal('');
  readonly formatFilter = signal('');
  readonly dateFrom = signal('');
  readonly dateTo = signal('');
  readonly filteredTracks = computed(() => {
    const term = this.searchTerm().trim().toLocaleLowerCase('fr');
    const artist = this.artistFilter().trim().toLocaleLowerCase('fr');
    const sizeFilter = this.sizeFilter();
    const format = this.formatFilter();
    const from = this.dateFrom();
    const to = this.dateTo();
    return this.tracks().filter((track) => {
      const matchesTerm = !term || `${track.title} ${track.originalName}`.toLocaleLowerCase('fr').includes(term);
      const matchesArtist = !artist || (track.artist ?? '').toLocaleLowerCase('fr').includes(artist);
      const sizeMb = track.size / (1024 * 1024);
      const matchesSize = !sizeFilter || (sizeFilter === 'small' ? sizeMb < 2 : sizeFilter === 'medium' ? sizeMb >= 2 && sizeMb < 10 : sizeMb >= 10);
      const trackDate = new Date(track.createdAt).toISOString().slice(0, 10);
      const matchesDate = (!from || trackDate >= from) && (!to || trackDate <= to);
      const matchesFormat = !format || track.mimeType === format;
      return matchesTerm && matchesArtist && matchesSize && matchesDate && matchesFormat;
    });
  });
  readonly title = new FormControl('', { nonNullable: true });
  readonly artist = new FormControl('', { nonNullable: true });
  file?: File;

  constructor() {
    this.load();
  }

  choose(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.file = input.files?.[0];
    this.uploadError.set(this.file ? this.validateFile(this.file) : '');
    this.uploadSuccess.set('');
    this.title.setValue('');
    this.artist.setValue('');
    this.embeddedCoverPreview.set('');
    if (this.file && !this.uploadError()) {
      const selectedFile = this.file;
      this.metadataLoading.set(true);
      this.service.inspectAudio(selectedFile).subscribe({
        next: (metadata) => {
          if (this.file !== selectedFile) { this.metadataLoading.set(false); return; }
          this.title.setValue(metadata.title);
          this.artist.setValue(metadata.artist);
          this.embeddedCoverPreview.set(metadata.embeddedCoverDataUrl);
          this.metadataLoading.set(false);
        },
        error: (error: unknown) => {
          console.warn('[TracksPage] Prélecture des métadonnées impossible', error);
          this.metadataLoading.set(false);
        },
      });
    }
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
        for (const url of Object.values(this.coverImages())) URL.revokeObjectURL(url);
        this.coverImages.set({});
        response.items.filter((track) => !!track.cover).forEach((track) => this.loadCover(track));
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

  toggleSearch(): void {
    this.searchOpen.update((open) => !open);
    if (!this.searchOpen()) this.clearSearch();
    else setTimeout(() => this.searchInput?.nativeElement.focus());
  }

  clearSearch(): void {
    this.searchTerm.set('');
    this.artistFilter.set('');
    this.sizeFilter.set('');
    this.formatFilter.set('');
    this.dateFrom.set('');
    this.dateTo.set('');
  }

  updateFilter(event: Event, filter: 'term' | 'artist' | 'size' | 'format' | 'from' | 'to'): void {
    const value = (event.target as HTMLInputElement | HTMLSelectElement).value;
    if (filter === 'term') this.searchTerm.set(value);
    else if (filter === 'artist') this.artistFilter.set(value);
    else if (filter === 'size') this.sizeFilter.set(value);
    else if (filter === 'format') this.formatFilter.set(value);
    else if (filter === 'from') this.dateFrom.set(value);
    else this.dateTo.set(value);
  }

  openCoverManager(track: Track): void {
    this.coverManagerTrack.set(track);
    this.coverSuggestions.set([]);
    this.coverError.set('');
    this.coverRightsConfirmed.set(false);
    this.coverFile = undefined;
    this.coverSearchTitle.set(track.title);
    this.coverSearchArtist.set(track.artist ?? '');
    this.coverSearchAlbum.set(track.album ?? '');
    this.coverDialog?.nativeElement.showModal();
  }

  closeCoverManager(): void {
    if (this.coverDialog?.nativeElement.open) this.coverDialog.nativeElement.close();
    this.coverManagerTrack.set(null);
    this.coverSuggestions.set([]);
    this.coverError.set('');
    this.coverRightsConfirmed.set(false);
    this.coverFile = undefined;
  }

  updateCoverSearch(event: Event, field: 'title' | 'artist' | 'album'): void {
    const value = (event.target as HTMLInputElement).value;
    if (field === 'title') this.coverSearchTitle.set(value);
    else if (field === 'artist') this.coverSearchArtist.set(value);
    else this.coverSearchAlbum.set(value);
  }

  findCovers(): void {
    const track = this.coverManagerTrack();
    if (!track || this.coverLoading()) return;
    this.coverLoading.set(true);
    this.coverError.set('');
    this.service.coverSuggestions(track.id, {
      title: this.coverSearchTitle().trim(),
      artist: this.coverSearchArtist().trim(),
      album: this.coverSearchAlbum().trim(),
    }).subscribe({
      next: (response) => {
        this.coverSuggestions.set(response.suggestions);
        this.coverLoading.set(false);
        if (!response.suggestions.length) this.coverError.set('Aucune pochette trouvée. Essayez un autre titre, artiste ou album.');
      },
      error: (error: unknown) => {
        console.error('[TracksPage] Recherche de pochettes impossible', error);
        this.coverError.set(this.serverMessage(error, 'La recherche de pochettes est indisponible. Réessayez.'));
        this.coverLoading.set(false);
      },
    });
  }

  setCoverRights(event: Event): void {
    this.coverRightsConfirmed.set((event.target as HTMLInputElement).checked);
  }

  chooseCover(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    this.coverFile = file;
    this.coverError.set('');
    if (file && (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 5 * 1024 * 1024)) {
      this.coverFile = undefined;
      this.coverError.set('Choisissez une image JPEG ou PNG de 5 Mo maximum.');
    }
  }

  chooseUploadCover(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    this.uploadCoverFile = file;
    this.uploadError.set('');
    this.uploadCoverRightsConfirmed.set(false);
    if (file && (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 5 * 1024 * 1024)) {
      this.uploadCoverFile = undefined;
      input.value = '';
      this.uploadError.set('Choisissez une image JPEG ou PNG de 5 Mo maximum.');
    }
  }

  setUploadCoverRights(event: Event): void {
    this.uploadCoverRightsConfirmed.set((event.target as HTMLInputElement).checked);
  }

  uploadCover(): void {
    const track = this.coverManagerTrack();
    if (!track || !this.coverFile || !this.coverRightsConfirmed() || this.coverSaving()) return;
    this.coverSaving.set(true);
    this.coverError.set('');
    this.service.uploadCover(track.id, this.coverFile).subscribe({
      next: (updated) => this.coverSaved(updated),
      error: (error: unknown) => {
        console.error('[TracksPage] Import de couverture impossible', error);
        this.coverError.set(this.serverMessage(error, 'Impossible d’enregistrer cette image.'));
        this.coverSaving.set(false);
      },
    });
  }

  selectCover(suggestion: CoverSuggestion): void {
    const track = this.coverManagerTrack();
    if (!track || !this.coverRightsConfirmed() || this.coverSaving()) return;
    this.coverSaving.set(true);
    this.coverError.set('');
    this.service.selectCover(track.id, suggestion).subscribe({
      next: (updated) => this.coverSaved(updated),
      error: (error: unknown) => {
        console.error('[TracksPage] Enregistrement de pochette impossible', error);
        this.coverError.set(this.serverMessage(error, 'Impossible d’enregistrer cette pochette.'));
        this.coverSaving.set(false);
      },
    });
  }

  private coverSaved(updated: Track): void {
    console.debug('[TracksPage] Pochette enregistrée', updated.id);
    this.tracks.update((tracks) => tracks.map((track) => track.id === updated.id ? updated : track));
    this.loadCover(updated);
    this.coverSaving.set(false);
    this.coverManagerTrack.set(updated);
    this.coverFile = undefined;
    this.coverRightsConfirmed.set(false);
    this.coverError.set('Pochette enregistrée.');
  }

  private loadCover(track: Track): void {
    this.service.cover(track.id).subscribe({
      next: (blob) => {
        const previous = this.coverImages()[track.id];
        if (previous) URL.revokeObjectURL(previous);
        this.coverImages.update((images) => ({ ...images, [track.id]: URL.createObjectURL(blob) }));
      },
      error: (error: unknown) => console.error('[TracksPage] Chargement de la pochette impossible', track.id, error),
    });
  }

  upload(): void {
    if (!this.file || this.uploadLoading()) return;
    if (this.uploadCoverFile && !this.uploadCoverRightsConfirmed()) {
      this.uploadError.set('Confirmez que vous avez le droit d’utiliser cette image de couverture.');
      return;
    }

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
    const trackTitle = this.title.value.trim();
    const trackArtist = this.artist.value.trim();

    this.service.upload(selectedFile, trackTitle, trackArtist).subscribe({
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
          this.title.setValue('');
          this.artist.setValue('');
          this.embeddedCoverPreview.set('');
          this.file = undefined;
          if (this.audioInput) this.audioInput.nativeElement.value = '';
          this.page.set(1);
          const coverFile = this.uploadCoverFile;
          if (coverFile) {
            this.uploadProgress.set(null);
            this.service.uploadCover(track.id, coverFile).subscribe({
              next: () => {
                this.uploadSuccess.set(`« ${track.title} » et sa couverture ont été importés avec succès.`);
                this.uploadCoverFile = undefined;
                if (this.uploadCoverInput) this.uploadCoverInput.nativeElement.value = '';
                this.uploadCoverRightsConfirmed.set(false);
                this.uploadLoading.set(false);
                this.load();
              },
              error: (coverError: unknown) => {
                console.error('[TracksPage] Audio importé, mais couverture non enregistrée', coverError);
                this.uploadError.set(`Le morceau « ${track.title} » est importé, mais sa couverture n’a pas été enregistrée. Vous pourrez la réessayer en cliquant sur sa pochette.`);
                this.uploadLoading.set(false);
                this.load();
              },
            });
          } else {
            this.uploadProgress.set(100);
            this.uploadSuccess.set(`« ${track.title} » a été importé avec succès.`);
            this.uploadLoading.set(false);
            this.load();
          }
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
    for (const url of Object.values(this.coverImages())) URL.revokeObjectURL(url);
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

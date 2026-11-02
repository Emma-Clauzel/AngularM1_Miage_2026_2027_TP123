import { HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { Component, computed, effect, ElementRef, inject, OnDestroy, signal, ViewChild, WritableSignal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { CoverSuggestion, Track } from '../../shared/models/track.model';
import { TAG_COLOR_OPTIONS, TAG_ICON_OPTIONS, Tag, TagIcon, TagInput } from '../../shared/models/tag.model';
import { TrackService } from '../../shared/services/track.service';
import { MusicPlayerService } from '../../shared/services/music-player.service';

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
  readonly player = inject(MusicPlayerService);

  @ViewChild('audioInput') private audioInput?: ElementRef<HTMLInputElement>;
  @ViewChild('uploadCoverInput') private uploadCoverInput?: ElementRef<HTMLInputElement>;
  @ViewChild('deleteDialog') private deleteDialog?: ElementRef<HTMLDialogElement>;
  @ViewChild('coverDialog') private coverDialog?: ElementRef<HTMLDialogElement>;
  @ViewChild('tagDialog') private tagDialog?: ElementRef<HTMLDialogElement>;
  @ViewChild('searchInput') private searchInput?: ElementRef<HTMLInputElement>;

  readonly tracks = signal<Track[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly uploadLoading = signal(false);
  readonly uploadProgress = signal<number | null>(null);
  readonly uploadProgressEstimated = signal(false);
  readonly uploadError = signal('');
  readonly uploadSuccess = signal('');
  readonly metadataLoading = signal(false);
  readonly embeddedCoverPreview = signal('');
  readonly deletingTrackId = signal('');
  readonly deleteError = signal('');
  readonly trackPendingDeletion = signal<Track | null>(null);
  readonly coverImages = signal<Record<string, string>>({});
  readonly coverManagerTrack = signal<Track | null>(null);
  readonly coverSuggestions = signal<CoverSuggestion[]>([]);
  readonly coverLoading = signal(false);
  readonly coverSearchProgress = signal(0);
  readonly coverSaving = signal(false);
  readonly coverSavingAction = signal<'select' | 'upload' | null>(null);
  readonly coverSelectionProgress = signal(0);
  readonly selectedCoverKey = signal('');
  readonly coverError = signal('');
  readonly coverRightsConfirmed = signal(false);
  readonly snackbarMessage = signal('');
  readonly snackbarType = signal<'success' | 'error'>('success');
  readonly coverSearchTitle = signal('');
  readonly coverSearchArtist = signal('');
  readonly coverSearchAlbum = signal('');
  readonly uploadCoverRightsConfirmed = signal(false);
  uploadCoverFile?: File;
  coverFile?: File;
  private snackbarTimer?: ReturnType<typeof setTimeout>;
  private uploadProgressTimer?: ReturnType<typeof setInterval>;
  private coverSearchProgressTimer?: ReturnType<typeof setInterval>;
  private coverSearchResetTimer?: ReturnType<typeof setTimeout>;
  private coverSelectionProgressTimer?: ReturnType<typeof setInterval>;
  readonly searchOpen = signal(false);
  readonly searchTerm = signal('');
  readonly artistFilter = signal('');
  readonly selectedTagId = signal('');
  readonly tags = signal<Tag[]>([]);
  readonly allTracks = signal<Track[]>([]);
  readonly allTracksLoading = signal(false);
  readonly tagManagerSaving = signal(false);
  readonly tagError = signal('');
  readonly editingTagId = signal('');
  readonly tagName = signal('');
  readonly tagIcon = signal<TagIcon>('star');
  readonly tagColor = signal(TAG_COLOR_OPTIONS[0].value);
  readonly tagTrackIds = signal<string[]>([]);
  readonly tagTrackSearch = signal('');
  readonly tagIconOptions = TAG_ICON_OPTIONS;
  readonly tagColorOptions = TAG_COLOR_OPTIONS;
  readonly selectableTracks = computed(() => {
    const term = this.tagTrackSearch().trim().toLocaleLowerCase('fr');
    return this.allTracks().filter((track) => !term || `${track.title} ${track.artist ?? ''} ${track.originalName}`.toLocaleLowerCase('fr').includes(term));
  });
  readonly filteredTracks = computed(() => {
    const term = this.searchTerm().trim().toLocaleLowerCase('fr');
    const artist = this.artistFilter().trim().toLocaleLowerCase('fr');
    return this.tracks().filter((track) => {
      const matchesTerm = !term || `${track.title} ${track.originalName}`.toLocaleLowerCase('fr').includes(term);
      const matchesArtist = !artist || (track.artist ?? '').toLocaleLowerCase('fr').includes(artist);
      return matchesTerm && matchesArtist;
    });
  });
  readonly title = new FormControl('', { nonNullable: true });
  readonly artist = new FormControl('', { nonNullable: true });
  file?: File;

  constructor() {
    effect(() => this.player.setQueue(this.filteredTracks()));
    this.load();
    this.loadTags();
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
    this.service.listAll(this.selectedTagId()).subscribe({
      next: (response) => {
        console.debug('[TracksPage] Pistes chargées', response.length);
        this.tracks.set(response);
        for (const url of Object.values(this.coverImages())) URL.revokeObjectURL(url);
        this.coverImages.set({});
        response.filter((track) => !!track.cover).forEach((track) => this.loadCover(track));
        this.loading.set(false);
      },
      error: (error: unknown) => {
        console.error('[TracksPage] Chargement impossible', error);
        this.error.set('Impossible de charger les pistes. Vérifiez votre connexion puis réessayez.');
        this.loading.set(false);
      },
    });
  }

  toggleSearch(): void {
    this.searchOpen.update((open) => !open);
    if (this.searchOpen()) setTimeout(() => this.searchInput?.nativeElement.focus());
  }

  resetFilters(): void {
    this.searchTerm.set('');
    this.artistFilter.set('');
    if (this.selectedTagId()) {
      this.selectedTagId.set('');
      this.load();
    }
  }

  updateFilter(event: Event, filter: 'term' | 'artist'): void {
    const value = (event.target as HTMLInputElement | HTMLSelectElement).value;
    if (filter === 'term') this.searchTerm.set(value);
    else this.artistFilter.set(value);
  }

  setTagFilter(event: Event): void {
    this.selectedTagId.set((event.target as HTMLSelectElement).value);
    this.load();
  }

  loadTags(): void {
    this.service.listTags().subscribe({
      next: (tags) => this.tags.set(tags),
      error: (error: unknown) => {
        console.error('[TracksPage] Chargement des tags impossible', error);
        this.tagError.set(this.serverMessage(error, 'Impossible de charger les tags.'));
      },
    });
  }

  openTagManager(): void {
    this.tagError.set('');
    this.resetTagForm();
    this.tagDialog?.nativeElement.showModal();
    this.loadTags();
    this.allTracksLoading.set(true);
    this.service.listAll().subscribe({
      next: (tracks) => {
        this.allTracks.set(tracks);
        this.allTracksLoading.set(false);
      },
      error: (error: unknown) => {
        console.error('[TracksPage] Chargement des pistes pour les tags impossible', error);
        this.tagError.set(this.serverMessage(error, 'Impossible de charger les pistes à associer.'));
        this.allTracksLoading.set(false);
      },
    });
  }

  closeTagManager(): void {
    if (this.tagDialog?.nativeElement.open) this.tagDialog.nativeElement.close();
    this.tagError.set('');
  }

  startNewTag(): void {
    this.resetTagForm();
    this.tagError.set('');
  }

  editTag(tag: Tag): void {
    this.editingTagId.set(tag.id);
    this.tagName.set(tag.name);
    this.tagIcon.set(tag.icon);
    this.tagColor.set(tag.color);
    this.tagTrackIds.set([...tag.trackIds]);
    this.tagTrackSearch.set('');
    this.tagError.set('');
  }

  updateTagName(event: Event): void { this.tagName.set((event.target as HTMLInputElement).value); }
  updateTagIcon(event: Event): void { this.tagIcon.set((event.target as HTMLSelectElement).value as TagIcon); }
  updateTagColor(event: Event): void { this.tagColor.set((event.target as HTMLSelectElement).value); }
  updateTagTrackSearch(event: Event): void { this.tagTrackSearch.set((event.target as HTMLInputElement).value); }

  toggleTagTrack(trackId: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.tagTrackIds.update((ids) => checked ? [...new Set([...ids, trackId])] : ids.filter((id) => id !== trackId));
  }

  tagSymbol(icon: string): string {
    return TAG_ICON_OPTIONS.find((option) => option.value === icon)?.symbol ?? '★';
  }

  saveTag(): void {
    const name = this.tagName().trim();
    if (!name || this.tagManagerSaving() || this.allTracksLoading()) return;
    const input: TagInput = { name, icon: this.tagIcon(), color: this.tagColor(), trackIds: this.tagTrackIds() };
    this.tagManagerSaving.set(true);
    this.tagError.set('');
    const request = this.editingTagId()
      ? this.service.updateTag(this.editingTagId(), input)
      : this.service.createTag(input);
    request.subscribe({
      next: () => {
        this.tagManagerSaving.set(false);
        this.showSnackbar(this.editingTagId() ? 'Tag modifié' : 'Tag créé', 'success');
        this.closeTagManager();
        this.loadTags();
        this.load();
      },
      error: (error: unknown) => {
        console.error('[TracksPage] Enregistrement du tag impossible', error);
        this.tagError.set(this.serverMessage(error, 'Impossible d’enregistrer le tag.'));
        this.tagManagerSaving.set(false);
      },
    });
  }

  deleteTag(tag: Tag): void {
    if (!window.confirm(`Supprimer le tag « ${tag.name} » ? Les morceaux ne seront pas supprimés.`)) return;
    this.service.deleteTag(tag.id).subscribe({
      next: () => {
        this.showSnackbar('Tag supprimé', 'success');
        if (this.selectedTagId() === tag.id) this.selectedTagId.set('');
        this.loadTags();
        this.load();
      },
      error: (error: unknown) => {
        console.error('[TracksPage] Suppression du tag impossible', error);
        this.tagError.set(this.serverMessage(error, 'Impossible de supprimer le tag.'));
        this.showSnackbar('Suppression du tag échouée', 'error');
      },
    });
  }

  private resetTagForm(): void {
    this.editingTagId.set('');
    this.tagName.set('');
    this.tagIcon.set('star');
    this.tagColor.set(TAG_COLOR_OPTIONS[0].value);
    this.tagTrackIds.set([]);
    this.tagTrackSearch.set('');
  }

  openCoverManager(track: Track): void {
    this.coverManagerTrack.set(track);
    this.coverSuggestions.set([]);
    this.selectedCoverKey.set('');
    this.coverSearchProgress.set(0);
    this.coverSelectionProgress.set(0);
    if (this.coverSearchResetTimer) clearTimeout(this.coverSearchResetTimer);
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
    this.selectedCoverKey.set('');
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
    this.coverSearchProgress.set(0);
    if (this.coverSearchResetTimer) clearTimeout(this.coverSearchResetTimer);
    this.coverSearchProgressTimer = this.startEstimatedProgress(this.coverSearchProgress);
    this.coverError.set('');
    this.service.coverSuggestions(track.id, {
      title: this.coverSearchTitle().trim(),
      artist: this.coverSearchArtist().trim(),
      album: this.coverSearchAlbum().trim(),
    }).subscribe({
      next: (response) => {
        this.coverSuggestions.set(response.suggestions);
        this.stopEstimatedProgress(this.coverSearchProgressTimer);
        this.coverSearchProgressTimer = undefined;
        this.coverSearchProgress.set(100);
        this.coverLoading.set(false);
        this.coverSearchResetTimer = setTimeout(() => {
          this.coverSearchProgress.set(0);
          this.coverSearchResetTimer = undefined;
        }, 900);
        if (!response.suggestions.length) this.coverError.set('Aucune pochette trouvée. Essayez un autre titre, artiste ou album.');
      },
      error: (error: unknown) => {
        console.error('[TracksPage] Recherche de pochettes impossible', error);
        this.stopEstimatedProgress(this.coverSearchProgressTimer);
        this.coverSearchProgressTimer = undefined;
        this.coverSearchProgress.set(0);
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
    this.coverSavingAction.set('upload');
    this.coverError.set('');
    this.service.uploadCover(track.id, this.coverFile).subscribe({
      next: (updated) => this.coverSaved(updated),
      error: (error: unknown) => {
        console.error('[TracksPage] Import de couverture impossible', error);
        this.coverError.set(this.serverMessage(error, 'Impossible d’enregistrer cette image.'));
        this.coverSaving.set(false);
        this.coverSavingAction.set(null);
      },
    });
  }

  selectCover(suggestion: CoverSuggestion): void {
    const track = this.coverManagerTrack();
    if (!track || !this.coverRightsConfirmed() || this.coverSaving()) return;
    this.coverSaving.set(true);
    this.coverSavingAction.set('select');
    this.selectedCoverKey.set(suggestion.releaseId + suggestion.imageId);
    this.coverSelectionProgress.set(0);
    this.coverSelectionProgressTimer = this.startEstimatedProgress(this.coverSelectionProgress);
    this.coverError.set('');
    this.service.selectCover(track.id, suggestion).subscribe({
      next: (updated) => this.coverSaved(updated),
      error: (error: unknown) => {
        console.error('[TracksPage] Enregistrement de pochette impossible', error);
        this.stopEstimatedProgress(this.coverSelectionProgressTimer);
        this.coverSelectionProgressTimer = undefined;
        this.coverSelectionProgress.set(0);
        this.coverError.set(this.serverMessage(error, 'Impossible d’enregistrer cette pochette.'));
        this.coverSaving.set(false);
        this.coverSavingAction.set(null);
        this.selectedCoverKey.set('');
      },
    });
  }

  private coverSaved(updated: Track): void {
    console.debug('[TracksPage] Pochette enregistrée', updated.id);
    this.tracks.update((tracks) => tracks.map((track) => track.id === updated.id ? { ...track, ...updated, tags: track.tags ?? updated.tags } : track));
    this.loadCover(updated);
    if (this.coverSavingAction() === 'select') {
      this.stopEstimatedProgress(this.coverSelectionProgressTimer);
      this.coverSelectionProgressTimer = undefined;
      this.coverSelectionProgress.set(100);
    }
    this.coverSaving.set(false);
    this.coverSavingAction.set(null);
    this.selectedCoverKey.set('');
    this.coverManagerTrack.set(updated);
    this.coverFile = undefined;
    this.coverRightsConfirmed.set(false);
    this.closeCoverManager();
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
      this.showSnackbar('La musique n\'a pas pu être ajoutée', 'error');
      return;
    }

    const validationError = this.validateFile(this.file);
    if (validationError) {
      this.uploadError.set(validationError);
      this.showSnackbar('La musique n\'a pas pu être ajoutée', 'error');
      return;
    }

    this.uploadError.set('');
    this.uploadSuccess.set('');
    this.uploadLoading.set(true);
    this.uploadProgressEstimated.set(true);
    this.uploadProgress.set(0);
    this.uploadProgressTimer = setInterval(() => {
      this.uploadProgress.update((value) => Math.min(95, (value ?? 0) + 5));
    }, 350);
    const selectedFile = this.file;
    const trackTitle = this.title.value.trim();
    const trackArtist = this.artist.value.trim();

    this.service.upload(selectedFile, trackTitle, trackArtist).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.UploadProgress) {
          const total = event.total;
          if (total) {
            this.stopEstimatedProgress(this.uploadProgressTimer);
            this.uploadProgressTimer = undefined;
            this.uploadProgressEstimated.set(false);
            this.uploadProgress.set(Math.round((event.loaded / total) * 100));
          } else {
            this.uploadProgressEstimated.set(true);
            const estimatedFromBytes = Math.min(95, Math.round((event.loaded / selectedFile.size) * 100));
            this.uploadProgress.update((current) => Math.max(current ?? 0, estimatedFromBytes));
          }
          return;
        }

        if (event.type === HttpEventType.Response && event.body) {
          const track = event.body;
          console.debug('[TracksPage] Piste envoyée', track.id);
          this.showSnackbar('Musique ajoutée', 'success');
          this.stopEstimatedProgress(this.uploadProgressTimer);
          this.uploadProgressTimer = undefined;
          this.uploadProgressEstimated.set(false);
          this.uploadProgress.set(100);
          this.title.setValue('');
          this.artist.setValue('');
          this.embeddedCoverPreview.set('');
          this.file = undefined;
          if (this.audioInput) this.audioInput.nativeElement.value = '';
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
        this.showSnackbar('La musique n\'a pas pu être ajoutée', 'error');
        this.stopEstimatedProgress(this.uploadProgressTimer);
        this.uploadProgressTimer = undefined;
        this.uploadProgressEstimated.set(false);
        this.uploadLoading.set(false);
        this.uploadProgress.set(null);
      },
    });
  }

  play(track: Track): void {
    this.player.play(track);
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
        if (this.player.currentTrack()?.id === track.id) this.player.clear();

        this.deletingTrackId.set('');
        this.showSnackbar('Suppression réussie', 'success');
        this.loadTags();
        this.load();
      },
      error: (error: unknown) => {
        console.error('[TracksPage] Suppression impossible', error);
        this.deleteError.set(this.serverMessage(error, 'Impossible de supprimer cette piste. Réessayez.'));
        this.showSnackbar('Suppression échouée', 'error');
        this.deletingTrackId.set('');
      },
    });
  }

  formatSize(bytes: number): string {
    return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
  }

  formatDate(date: string): string {
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(date));
  }

  ngOnDestroy(): void {
    if (this.snackbarTimer) clearTimeout(this.snackbarTimer);
    this.stopEstimatedProgress(this.uploadProgressTimer);
    this.stopEstimatedProgress(this.coverSearchProgressTimer);
    this.stopEstimatedProgress(this.coverSelectionProgressTimer);
    if (this.coverSearchResetTimer) clearTimeout(this.coverSearchResetTimer);
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

  private showSnackbar(message: string, type: 'success' | 'error'): void {
    if (this.snackbarTimer) clearTimeout(this.snackbarTimer);
    this.snackbarMessage.set(message);
    this.snackbarType.set(type);
    this.snackbarTimer = setTimeout(() => this.snackbarMessage.set(''), 3500);
  }

  private startEstimatedProgress(progress: WritableSignal<number>): ReturnType<typeof setInterval> {
    return setInterval(() => progress.update((value) => Math.min(95, value + 5)), 350);
  }

  private stopEstimatedProgress(timer?: ReturnType<typeof setInterval>): void {
    if (timer) clearInterval(timer);
  }


}

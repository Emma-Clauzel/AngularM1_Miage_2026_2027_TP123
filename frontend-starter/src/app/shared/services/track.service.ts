import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpEvent } from '@angular/common/http';
import { Page } from '../models/page.model';
import { CoverSuggestion, Track } from '../models/track.model';
import { Tag, TagInput } from '../models/tag.model';
import { forkJoin, map, of, switchMap } from 'rxjs';

/** Encapsulates all HTTP operations for backing tracks. */
@Injectable({ providedIn: 'root' })
export class TrackService {
  private readonly http = inject(HttpClient);

  list(page = 1, limit = 5, tagId = '') {
    const params: Record<string, string | number> = { page, limit };
    if (tagId) params['tagId'] = tagId;
    return this.http.get<Page<Track>>('/api/tracks', {
      params,
    });
  }

  listAll(tagId = '') {
    return this.list(1, 20, tagId).pipe(
      switchMap((firstPage) => {
        const remaining = Array.from({ length: firstPage.pages - 1 }, (_, index) => this.list(index + 2, 20, tagId));
        if (!remaining.length) return of(firstPage.items);
        return forkJoin(remaining).pipe(map((pages) => [...firstPage.items, ...pages.flatMap((page) => page.items)]));
      }),
    );
  }

  listTags() {
    return this.http.get<Tag[]>('/api/tags');
  }

  createTag(input: TagInput) {
    return this.http.post<Tag>('/api/tags', input);
  }

  updateTag(id: string, input: TagInput) {
    return this.http.put<Tag>(`/api/tags/${id}`, input);
  }

  deleteTag(id: string) {
    return this.http.delete<void>(`/api/tags/${id}`);
  }

  updateMetadata(id: string, metadata: { title: string; artist: string; album: string }) {
    return this.http.put<Track>(`/api/tracks/${id}`, metadata);
  }

  setFavorite(id: string, isFavorite: boolean) {
    return this.http.patch<Track>(`/api/tracks/${id}/favorite`, { isFavorite });
  }

  inspectAudio(file: File) {
    const body = new FormData();
    body.append('audio', file);
    return this.http.post<{ title: string; artist: string; album: string; releaseYear: string; embeddedCoverDataUrl: string }>('/api/tracks/metadata', body);
  }

  upload(file: File, title: string, artist: string, ignoreEmbeddedCover = false) {
    const body = new FormData();
    body.append('audio', file);
    if (title.trim()) body.append('title', title.trim());
    if (artist.trim()) body.append('artist', artist.trim());
    body.append('ignoreEmbeddedCover', String(ignoreEmbeddedCover));
    return this.http.post<Track>('/api/tracks', body, {
      observe: 'events',
      reportProgress: true,
    });
  }

  audio(id: string) {
    return this.http.get(`/api/tracks/${id}/audio`, {
      responseType: 'blob',
    });
  }

  cover(id: string) {
    // L'URL de la pochette reste identique quand on remplace l'image.
    // Ce paramètre empêche le navigateur de réutiliser l'ancien Blob en cache.
    return this.http.get(`/api/tracks/${id}/cover`, {
      params: { v: Date.now() },
      responseType: 'blob',
    });
  }

  coverSuggestions(id: string, metadata: { title: string; artist: string; album: string }) {
    return this.http.get<{ metadata: { title: string; artist: string; album: string; releaseYear: string }; suggestions: CoverSuggestion[] }>(`/api/tracks/${id}/cover-suggestions`, { params: metadata });
  }

  selectCover(id: string, suggestion: CoverSuggestion) {
    return this.http.post<Track>(`/api/tracks/${id}/cover/select`, {
      releaseId: suggestion.releaseId,
      imageId: suggestion.imageId,
      rightsConfirmed: true,
    });
  }

  uploadCover(id: string, file: File) {
    const body = new FormData();
    body.append('cover', file);
    body.append('rightsConfirmed', 'true');
    return this.http.post<Track>(`/api/tracks/${id}/cover/upload`, body);
  }

  removeCover(id: string) {
    return this.http.delete<void>(`/api/tracks/${id}/cover`);
  }

  delete(id: string) {
    return this.http.delete<void>(`/api/tracks/${id}`);
  }
}

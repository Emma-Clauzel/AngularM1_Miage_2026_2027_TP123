import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpEvent } from '@angular/common/http';
import { Page } from '../models/page.model';
import { CoverSuggestion, Track } from '../models/track.model';

/** Encapsulates all HTTP operations for backing tracks. */
@Injectable({ providedIn: 'root' })
export class TrackService {
  private readonly http = inject(HttpClient);

  list(page = 1, limit = 5) {
    return this.http.get<Page<Track>>('/api/tracks', {
      params: { page, limit },
    });
  }

  inspectAudio(file: File) {
    const body = new FormData();
    body.append('audio', file);
    return this.http.post<{ title: string; artist: string; album: string; releaseYear: string; embeddedCoverDataUrl: string }>('/api/tracks/metadata', body);
  }

  upload(file: File, title: string, artist: string) {
    const body = new FormData();
    body.append('audio', file);
    if (title.trim()) body.append('title', title.trim());
    if (artist.trim()) body.append('artist', artist.trim());
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
    return this.http.get(`/api/tracks/${id}/cover`, { responseType: 'blob' });
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

  delete(id: string) {
    return this.http.delete<void>(`/api/tracks/${id}`);
  }
}

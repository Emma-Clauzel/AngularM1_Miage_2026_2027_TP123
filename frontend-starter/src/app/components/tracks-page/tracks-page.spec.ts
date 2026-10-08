import { HttpEventType } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { ɵresolveComponentResources as resolveComponentResources } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Track } from '../../shared/models/track.model';
import { TracksPageComponent } from './tracks-page';

const emptyPage = { items: [], page: 1, limit: 5, total: 0, pages: 0 };

describe('TracksPageComponent HTTP behavior', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<TracksPageComponent> | undefined;

  beforeEach(async () => {
    await resolveComponentResources(async (url) => {
      if (url.includes('tracks-page.html')) return readFile(join(process.cwd(), 'src/app/components/tracks-page/tracks-page.html'), 'utf8');
      if (url.includes('tracks-page.css')) return readFile(join(process.cwd(), 'src/app/components/tracks-page/tracks-page.css'), 'utf8');
      throw new Error(`Unexpected Angular resource: ${url}`);
    });
    TestBed.configureTestingModule({
      imports: [TracksPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = undefined;
  });

  afterEach(() => {
    fixture?.destroy();
    http.verify();
  });

  function createFixture(): ComponentFixture<TracksPageComponent> {
    fixture = TestBed.createComponent(TracksPageComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('displays an error after the track list request fails', () => {
    const view = createFixture();

    http.expectOne('/api/tracks?page=1&limit=5').flush(
      { message: 'database unavailable' },
      { status: 503, statusText: 'Service Unavailable' },
    );
    view.detectChanges();

    expect(view.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('Impossible de charger les pistes');
  });

  it('deletes a track and reloads the current page', () => {
    const view = createFixture();
    const page = view.componentInstance;
    const track: Track = {
      id: 'track-1', title: 'Blue Train', originalName: 'blue-train.mp3', mimeType: 'audio/mpeg',
      size: 1024, createdAt: '2026-10-08T00:00:00.000Z', cover: null,
    };
    http.expectOne('/api/tracks?page=1&limit=5').flush({ ...emptyPage, items: [track], total: 1, pages: 1 });
    Object.defineProperty(page, 'deleteDialog', {
      configurable: true,
      value: { nativeElement: { close: () => undefined } },
    });
    page.trackPendingDeletion.set(track);

    page.confirmDelete();

    const deletion = http.expectOne('/api/tracks/track-1');
    expect(deletion.request.method).toBe('DELETE');
    deletion.flush(null, { status: 204, statusText: 'No Content' });
    const refresh = http.expectOne('/api/tracks?page=1&limit=5');
    expect(refresh.request.method).toBe('GET');
    refresh.flush(emptyPage);

    expect(page.tracks()).toEqual([]);
    expect(page.snackbarMessage()).toBe('Suppression réussie');
  });

  it('shows measured upload progress and completes the upload', () => {
    const view = createFixture();
    const page = view.componentInstance;
    http.expectOne('/api/tracks?page=1&limit=5').flush(emptyPage);
    page.file = new File(['audio bytes'], 'blue-train.mp3', { type: 'audio/mpeg' });
    page.title.setValue('Blue Train');
    page.artist.setValue('John Coltrane');

    page.upload();

    const request = http.expectOne('/api/tracks');
    expect(request.request.method).toBe('POST');
    expect((request.request.body as FormData).get('audio')).toBeInstanceOf(File);
    expect((request.request.body as FormData).get('title')).toBe('Blue Train');
    expect((request.request.body as FormData).get('artist')).toBe('John Coltrane');
    request.event({ type: HttpEventType.UploadProgress, loaded: 50, total: 100 });
    expect(page.uploadProgress()).toBe(50);
    expect(page.uploadProgressEstimated()).toBe(false);

    request.flush({ ...componentTrack(), id: 'track-2' }, { status: 201, statusText: 'Created' });
    http.expectOne('/api/tracks?page=1&limit=5').flush(emptyPage);

    expect(page.uploadProgress()).toBe(100);
    expect(page.uploadLoading()).toBe(false);
    expect(page.snackbarMessage()).toBe('Musique ajoutée');
  });

  it('clears upload progress and reports an upload error', () => {
    const view = createFixture();
    const page = view.componentInstance;
    http.expectOne('/api/tracks?page=1&limit=5').flush(emptyPage);
    page.file = new File(['audio bytes'], 'blue-train.mp3', { type: 'audio/mpeg' });
    page.upload();

    http.expectOne('/api/tracks').flush(
      { message: 'upload failed' },
      { status: 500, statusText: 'Internal Server Error' },
    );

    expect(page.uploadLoading()).toBe(false);
    expect(page.uploadProgress()).toBeNull();
    expect(page.uploadError()).toContain('upload failed');
    expect(page.snackbarMessage()).toBe("La musique n'a pas pu être ajoutée");
  });
});

function componentTrack(): Track {
  return {
    id: '', title: 'Blue Train', originalName: 'blue-train.mp3', mimeType: 'audio/mpeg',
    size: 1024, createdAt: '2026-10-08T00:00:00.000Z', cover: null,
  };
}

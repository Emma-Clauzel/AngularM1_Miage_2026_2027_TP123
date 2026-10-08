import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { authInterceptor } from '../interceptors/auth.interceptor';
import { AuthService } from './auth.service';
import { TrackService } from './track.service';

describe('HTTP services and interceptor', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.removeItem('gpc_token');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.removeItem('gpc_token');
  });

  it('AuthService.login posts the credentials and stores the returned session', () => {
    const service = TestBed.inject(AuthService);
    const result: AuthResponseFixture = {
      token: 'test-jwt',
      user: { id: 'user-1', name: 'Ada', email: 'ada@example.test', createdAt: '2026-10-08T00:00:00.000Z' },
    };
    let receivedToken = '';

    service.login('ada@example.test', 'secret-pass').subscribe((response) => {
      receivedToken = response.token;
    });

    const request = http.expectOne('/api/auth/login');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ email: 'ada@example.test', password: 'secret-pass' });
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush(result);

    expect(receivedToken).toBe('test-jwt');
    expect(service.token()).toBe('test-jwt');
    expect(localStorage.getItem('gpc_token')).toBe('test-jwt');
  });

  it('TrackService.list sends the requested page and limit', () => {
    const service = TestBed.inject(TrackService);
    let receivedPage = 0;

    service.list(3, 10).subscribe((page) => {
      receivedPage = page.page;
    });

    const request = http.expectOne('/api/tracks?page=3&limit=10');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('page')).toBe('3');
    expect(request.request.params.get('limit')).toBe('10');
    request.flush({ items: [], page: 3, limit: 10, total: 0, pages: 0 });
    expect(receivedPage).toBe(3);
  });

  it('authInterceptor adds a bearer header when a token exists', () => {
    const auth = TestBed.inject(AuthService);
    const service = TestBed.inject(TrackService);
    auth.token.set('signed-test-token');

    service.list().subscribe();

    const request = http.expectOne('/api/tracks?page=1&limit=5');
    expect(request.request.headers.get('Authorization')).toBe('Bearer signed-test-token');
    request.flush({ items: [], page: 1, limit: 5, total: 0, pages: 0 });
  });
});

interface AuthResponseFixture {
  token: string;
  user: { id: string; name: string; email: string; createdAt: string };
}

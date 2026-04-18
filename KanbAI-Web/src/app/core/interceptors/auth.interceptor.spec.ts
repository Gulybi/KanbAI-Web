import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  let httpClient: HttpClient;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting()
      ]
    });

    httpClient = TestBed.inject(HttpClient);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should create', () => {
    expect(authInterceptor).toBeDefined();
    expect(typeof authInterceptor).toBe('function');
  });

  it('should pass through GET requests without modification', () => {
    httpClient.get('/api/test').subscribe();

    const req = httpTesting.expectOne('/api/test');
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.has('Authorization')).toBe(false);

    req.flush({ data: 'test' });
  });

  it('should pass through POST requests without modification', () => {
    const payload = { name: 'Test User' };
    httpClient.post('/api/users', payload).subscribe();

    const req = httpTesting.expectOne('/api/users');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    expect(req.request.headers.has('Authorization')).toBe(false);

    req.flush({ id: 1, ...payload });
  });

  it('should pass through PUT requests without modification', () => {
    const payload = { id: 1, name: 'Updated User' };
    httpClient.put('/api/users/1', payload).subscribe();

    const req = httpTesting.expectOne('/api/users/1');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(payload);
    expect(req.request.headers.has('Authorization')).toBe(false);

    req.flush(payload);
  });

  it('should pass through DELETE requests without modification', () => {
    httpClient.delete('/api/users/1').subscribe();

    const req = httpTesting.expectOne('/api/users/1');
    expect(req.request.method).toBe('DELETE');
    expect(req.request.headers.has('Authorization')).toBe(false);

    req.flush({ success: true });
  });

  it('should allow requests to complete successfully', () => {
    httpClient.get('/api/users').subscribe(response => {
      expect(response).toEqual({ users: [] });
    });

    const req = httpTesting.expectOne('/api/users');
    req.flush({ users: [] });
  });

  it('should not interfere with existing request headers', () => {
    const customHeaders = { 'X-Custom-Header': 'test-value' };
    httpClient.get('/api/test', { headers: customHeaders }).subscribe();

    const req = httpTesting.expectOne('/api/test');
    expect(req.request.headers.get('X-Custom-Header')).toBe('test-value');
    expect(req.request.headers.has('Authorization')).toBe(false);

    req.flush({ data: 'test' });
  });

  it('should handle multiple sequential requests', () => {
    httpClient.get('/api/test1').subscribe();
    httpClient.get('/api/test2').subscribe();
    httpClient.get('/api/test3').subscribe();

    const req1 = httpTesting.expectOne('/api/test1');
    const req2 = httpTesting.expectOne('/api/test2');
    const req3 = httpTesting.expectOne('/api/test3');

    expect(req1.request.headers.has('Authorization')).toBe(false);
    expect(req2.request.headers.has('Authorization')).toBe(false);
    expect(req3.request.headers.has('Authorization')).toBe(false);

    req1.flush({ data: 'test1' });
    req2.flush({ data: 'test2' });
    req3.flush({ data: 'test3' });
  });

  it('should not interfere with error propagation (404)', () => {
    httpClient.get('/api/not-found').subscribe({
      next: () => {
        throw new Error('should have failed with 404 error');
      },
      error: (error) => {
        expect(error.status).toBe(404);
        expect(error.statusText).toBe('Not Found');
      }
    });

    const req = httpTesting.expectOne('/api/not-found');
    req.flush('Not Found', { status: 404, statusText: 'Not Found' });
  });

  it('should not interfere with error propagation (401)', () => {
    httpClient.get('/api/unauthorized').subscribe({
      next: () => {
        throw new Error('should have failed with 401 error');
      },
      error: (error) => {
        expect(error.status).toBe(401);
        expect(error.statusText).toBe('Unauthorized');
      }
    });

    const req = httpTesting.expectOne('/api/unauthorized');
    req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });
  });

  it('should not interfere with error propagation (500)', () => {
    httpClient.get('/api/server-error').subscribe({
      next: () => {
        throw new Error('should have failed with 500 error');
      },
      error: (error) => {
        expect(error.status).toBe(500);
        expect(error.statusText).toBe('Internal Server Error');
      }
    });

    const req = httpTesting.expectOne('/api/server-error');
    req.flush('Server Error', { status: 500, statusText: 'Internal Server Error' });
  });

  it('should handle request cancellation properly', () => {
    const subscription = httpClient.get('/api/test').subscribe();

    const req = httpTesting.expectOne('/api/test');

    // Cancel the request
    subscription.unsubscribe();

    // After unsubscribe, the request is marked as cancelled
    expect(req.cancelled).toBe(true);
  });

  it('should preserve request URL and query parameters', () => {
    httpClient.get('/api/users', { params: { page: '1', limit: '10' } }).subscribe();

    const req = httpTesting.expectOne(request =>
      request.url === '/api/users' &&
      request.params.get('page') === '1' &&
      request.params.get('limit') === '10'
    );
    expect(req.request.url).toBe('/api/users');
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('limit')).toBe('10');

    req.flush({ users: [] });
  });

  it('should work with different response types', () => {
    httpClient.get('/api/file', { responseType: 'blob' }).subscribe();

    const req = httpTesting.expectOne('/api/file');
    expect(req.request.responseType).toBe('blob');

    req.flush(new Blob(['test'], { type: 'text/plain' }));
  });

  it('should handle empty response bodies', () => {
    httpClient.delete('/api/users/1').subscribe(response => {
      expect(response).toBeNull();
    });

    const req = httpTesting.expectOne('/api/users/1');
    req.flush(null);
  });

  it('should allow POST requests with JSON payload', () => {
    const payload = { name: 'Test' };
    httpClient.post('/api/users', payload).subscribe();

    const req = httpTesting.expectOne('/api/users');
    expect(req.request.body).toEqual(payload);
    expect(req.request.method).toBe('POST');

    req.flush({ id: 1 });
  });
});

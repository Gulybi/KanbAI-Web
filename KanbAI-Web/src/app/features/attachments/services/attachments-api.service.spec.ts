import { TestBed } from '@angular/core/testing';
import {
  HttpEventType,
  HttpResponse,
  provideHttpClient
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting
} from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AttachmentsApiService } from './attachments-api.service';
import {
  AssetResponseDto,
  AssetUploadResponse
} from '../models/attachment.model';
import { ApiResponse } from '../../projects/models/project.model';
import { environment } from '../../../../environments/environment';

describe('AttachmentsApiService', () => {
  let service: AttachmentsApiService;
  let httpMock: HttpTestingController;
  const baseUrl = `${environment.apiUrl}/attachment`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AttachmentsApiService,
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });
    service = TestBed.inject(AttachmentsApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('issues a POST to /attachment/task/{taskId} with the taskId URL-encoded', () => {
    const file = new File(['hello'], 'a.txt', { type: 'text/plain' });
    service.uploadAttachment('task id with space', file).subscribe();

    const expected = `${baseUrl}/task/${encodeURIComponent('task id with space')}`;
    const req = httpMock.expectOne(expected);
    expect(req.request.method).toBe('POST');
    expect(req.request.reportProgress).toBe(true);
    expect(req.request.responseType).toBe('json');
    req.flush({
      success: true,
      message: null,
      errors: [],
      data: {
        id: 'a-1',
        fileName: 'a.txt',
        storageKey: 'k',
        thumbnailKey: null,
        mimeType: 'text/plain',
        fileSize: 5,
        processingStatus: 1,
        kanbanTaskId: 'task id with space',
        createdAt: '',
        updatedAt: ''
      }
    } satisfies AssetUploadResponse);
  });

  it('sends a FormData body containing exactly one `file` entry', () => {
    const file = new File(['payload'], 'image.png', { type: 'image/png' });
    service.uploadAttachment('t-1', file).subscribe();

    const req = httpMock.expectOne(`${baseUrl}/task/t-1`);
    expect(req.request.body).toBeInstanceOf(FormData);
    const body = req.request.body as FormData;
    const entries = Array.from(body.entries());
    expect(entries.length).toBe(1);
    expect(entries[0][0]).toBe('file');
    const entryValue = entries[0][1] as File;
    expect(entryValue).toBeInstanceOf(File);
    expect(entryValue.name).toBe('image.png');

    req.flush({ success: true, message: null, errors: [], data: null });
  });

  it('does not manually set Content-Type so the browser can fill in the multipart boundary', () => {
    const file = new File(['x'], 'x.txt');
    service.uploadAttachment('t-1', file).subscribe();

    const req = httpMock.expectOne(`${baseUrl}/task/t-1`);
    expect(req.request.headers.has('Content-Type')).toBe(false);
    req.flush({ success: true, message: null, errors: [], data: null });
  });

  it('forwards raw HttpEvent stream (progress + response)', () => {
    const file = new File(['x'], 'x.txt');
    const events: Array<{ type: number }> = [];
    service.uploadAttachment('t-1', file).subscribe(evt => {
      events.push({ type: evt.type });
    });

    const req = httpMock.expectOne(`${baseUrl}/task/t-1`);
    req.event({ type: HttpEventType.UploadProgress, loaded: 1, total: 10 });
    req.event(
      new HttpResponse<AssetUploadResponse>({
        body: { success: true, message: null, errors: [], data: null },
        status: 201
      })
    );

    expect(events.some(e => e.type === HttpEventType.UploadProgress)).toBe(true);
    expect(events.some(e => e.type === HttpEventType.Response)).toBe(true);
  });

  describe('listAttachmentsByTask', () => {
    function makeAsset(id: string): AssetResponseDto {
      return {
        id,
        fileName: `${id}.pdf`,
        storageKey: 'k',
        thumbnailKey: null,
        mimeType: 'application/pdf',
        fileSize: 1024,
        processingStatus: 2,
        kanbanTaskId: 't-1',
        createdAt: '',
        updatedAt: ''
      };
    }

    it('issues a GET to /attachment/task/{taskId} with URL-encoded id', () => {
      service.listAttachmentsByTask('t id/with slash').subscribe();
      const expected = `${baseUrl}/task/${encodeURIComponent('t id/with slash')}`;
      const req = httpMock.expectOne(expected);
      expect(req.request.method).toBe('GET');
      req.flush({
        success: true,
        message: null,
        errors: [],
        data: []
      } satisfies ApiResponse<AssetResponseDto[]>);
    });

    it('unwraps the ApiResponse envelope to the raw array', () => {
      const assets = [makeAsset('a1'), makeAsset('a2')];
      let received: AssetResponseDto[] | undefined;
      service.listAttachmentsByTask('t-1').subscribe(r => (received = r));
      const req = httpMock.expectOne(`${baseUrl}/task/t-1`);
      req.flush({
        success: true,
        message: null,
        errors: [],
        data: assets
      } satisfies ApiResponse<AssetResponseDto[]>);
      expect(received).toEqual(assets);
    });

    it('returns an empty array when data is null', () => {
      let received: AssetResponseDto[] | undefined;
      service.listAttachmentsByTask('t-1').subscribe(r => (received = r));
      const req = httpMock.expectOne(`${baseUrl}/task/t-1`);
      req.flush({
        success: true,
        message: null,
        errors: [],
        data: null
      } satisfies ApiResponse<AssetResponseDto[]>);
      expect(received).toEqual([]);
    });

    it('does not manually set Authorization header (interceptor handles it)', () => {
      service.listAttachmentsByTask('t-1').subscribe();
      const req = httpMock.expectOne(`${baseUrl}/task/t-1`);
      expect(req.request.headers.has('Authorization')).toBe(false);
      req.flush({
        success: true,
        message: null,
        errors: [],
        data: []
      } satisfies ApiResponse<AssetResponseDto[]>);
    });
  });

  describe('downloadAttachment', () => {
    it('issues a GET to /attachment/{assetId} with URL-encoded id', () => {
      service.downloadAttachment('asset with space').subscribe();
      const expected = `${baseUrl}/${encodeURIComponent('asset with space')}`;
      const req = httpMock.expectOne(expected);
      expect(req.request.method).toBe('GET');
      expect(req.request.responseType).toBe('blob');
      req.flush(new Blob(['x']));
    });

    it('emits an HttpResponse<Blob>', () => {
      let received: HttpResponse<Blob> | undefined;
      service
        .downloadAttachment('a-1')
        .subscribe(r => (received = r));
      const req = httpMock.expectOne(`${baseUrl}/a-1`);
      req.flush(new Blob(['hello'], { type: 'application/pdf' }));
      expect(received).toBeInstanceOf(HttpResponse);
      expect(received?.body).toBeInstanceOf(Blob);
    });

    it('does not manually set Authorization or Content-Type', () => {
      service.downloadAttachment('a-1').subscribe();
      const req = httpMock.expectOne(`${baseUrl}/a-1`);
      expect(req.request.headers.has('Authorization')).toBe(false);
      expect(req.request.headers.has('Content-Type')).toBe(false);
      req.flush(new Blob(['x']));
    });

    it('issues exactly one request per call (no duplicate fire)', () => {
      service.downloadAttachment('a-1').subscribe();
      // httpMock.expectOne throws when more than one request matches.
      const req = httpMock.expectOne(`${baseUrl}/a-1`);
      expect(req.request.method).toBe('GET');
      req.flush(new Blob(['x']));
    });

    it('propagates errors verbatim for the mapper to classify', () => {
      let caught: unknown = null;
      service
        .downloadAttachment('a-1')
        .subscribe({ next: () => {}, error: e => (caught = e) });
      const req = httpMock.expectOne(`${baseUrl}/a-1`);
      // responseType: 'blob' requires a Blob body even on error paths.
      req.flush(new Blob(['oops'], { type: 'application/json' }), {
        status: 500,
        statusText: 'boom'
      });
      expect(caught).not.toBeNull();
    });
  });

  describe('listAttachmentsByTask additional coverage', () => {
    it('returns [] when the envelope itself is null/undefined (defensive)', () => {
      let received: AssetResponseDto[] | undefined;
      service.listAttachmentsByTask('t-1').subscribe(r => (received = r));
      const req = httpMock.expectOne(`${baseUrl}/task/t-1`);
      req.flush(null);
      expect(received).toEqual([]);
    });

    it('propagates errors verbatim for the list mapper to classify', () => {
      let caught: unknown = null;
      service
        .listAttachmentsByTask('t-1')
        .subscribe({ next: () => {}, error: e => (caught = e) });
      const req = httpMock.expectOne(`${baseUrl}/task/t-1`);
      req.flush('denied', { status: 403, statusText: 'forbidden' });
      expect(caught).not.toBeNull();
    });
  });
});

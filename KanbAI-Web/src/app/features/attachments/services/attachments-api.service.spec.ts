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
import { AssetUploadResponse } from '../models/attachment.model';
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
});

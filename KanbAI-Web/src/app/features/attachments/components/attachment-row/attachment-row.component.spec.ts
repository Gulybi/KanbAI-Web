import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  HttpErrorResponse,
  HttpResponse
} from '@angular/common/http';
import { Observable, of, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AttachmentRowComponent } from './attachment-row.component';
import { AttachmentsApiService } from '../../services/attachments-api.service';
import { AssetResponseDto } from '../../models/attachment.model';

async function flushAsync(): Promise<void> {
  // Four microtask flushes: Blob.text() schedules a real Promise which needs
  // two ticks to resolve in jsdom, plus extra slack for our mapper's await.
  for (let i = 0; i < 8; i += 1) {
    await Promise.resolve();
  }
}

function makeAsset(partial?: Partial<AssetResponseDto>): AssetResponseDto {
  return {
    id: 'asset-1',
    fileName: 'spec.pdf',
    storageKey: 'k',
    thumbnailKey: null,
    mimeType: 'application/pdf',
    fileSize: 1024 * 1024,
    processingStatus: 2,
    kanbanTaskId: 't-1',
    createdAt: '2026-05-04T10:00:00Z',
    updatedAt: '2026-05-04T10:00:00Z',
    ...partial
  };
}

class MockAttachmentsApi {
  downloadAttachment = vi.fn<
    (assetId: string) => Observable<HttpResponse<Blob>>
  >(() =>
    of(
      new HttpResponse<Blob>({
        body: new Blob(['x'], { type: 'application/pdf' }),
        status: 200
      })
    )
  );
  uploadAttachment = vi.fn();
  listAttachmentsByTask = vi.fn();
}

describe('AttachmentRowComponent', () => {
  let fixture: ComponentFixture<AttachmentRowComponent>;
  let api: MockAttachmentsApi;

  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;

  beforeEach(async () => {
    api = new MockAttachmentsApi();

    URL.createObjectURL = vi.fn(
      () => 'blob:mock'
    ) as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;

    await TestBed.configureTestingModule({
      imports: [AttachmentRowComponent],
      providers: [{ provide: AttachmentsApiService, useValue: api }]
    }).compileComponents();

    fixture = TestBed.createComponent(AttachmentRowComponent);
    fixture.componentRef.setInput('attachment', makeAsset());
    fixture.detectChanges();
  });

  afterEach(() => {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    vi.restoreAllMocks();
  });

  function downloadButton(): HTMLButtonElement {
    return fixture.debugElement
      .query(By.css('.attachment-row__download'))
      .nativeElement as HTMLButtonElement;
  }

  it('renders the filename, size, and download button with aria-label', () => {
    expect(
      fixture.debugElement.query(By.css('.attachment-row__filename'))
        .nativeElement.textContent
    ).toContain('spec.pdf');
    expect(
      fixture.debugElement.query(By.css('.attachment-row__size')).nativeElement
        .textContent
    ).toContain('1.0 MB');
    expect(downloadButton().getAttribute('aria-label')).toBe(
      'Download spec.pdf'
    );
  });

  it('binds the full filename to the title attribute for AT on truncation', () => {
    const span = fixture.debugElement.query(By.css('.attachment-row__filename'))
      .nativeElement as HTMLElement;
    expect(span.getAttribute('title')).toBe('spec.pdf');
  });

  it('resolves the icon category from the MIME type', () => {
    const icon = fixture.debugElement.query(By.css('.attachment-row__icon'))
      .nativeElement as HTMLElement;
    expect(icon.getAttribute('data-category')).toBe('pdf');
  });

  it('happy path: click → disables → triggers blob download → resets', async () => {
    downloadButton().click();
    expect(api.downloadAttachment).toHaveBeenCalledTimes(1);
    expect(api.downloadAttachment).toHaveBeenCalledWith('asset-1');
    fixture.detectChanges();
    // Synchronous `of(...)` resolves immediately; state should be idle.
    expect(fixture.componentInstance.isDownloading()).toBe(false);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('guards against double-click while a download is in flight', () => {
    const subject = new Subject<HttpResponse<Blob>>();
    api.downloadAttachment.mockReturnValueOnce(subject.asObservable());

    downloadButton().click();
    downloadButton().click();
    expect(api.downloadAttachment).toHaveBeenCalledTimes(1);

    subject.next(new HttpResponse({ body: new Blob(['x']), status: 200 }));
    subject.complete();
  });

  it('sets aria-busy and disables the button during a download', () => {
    const subject = new Subject<HttpResponse<Blob>>();
    api.downloadAttachment.mockReturnValueOnce(subject.asObservable());

    downloadButton().click();
    fixture.detectChanges();

    expect(downloadButton().disabled).toBe(true);
    expect(downloadButton().getAttribute('aria-busy')).toBe('true');

    subject.next(new HttpResponse({ body: new Blob(['x']), status: 200 }));
    subject.complete();
    fixture.detectChanges();
    expect(downloadButton().disabled).toBe(false);
    expect(downloadButton().getAttribute('aria-busy')).toBeNull();
  });

  it('maps 400 "File is still being processed." → retryable error region with Retry', async () => {
    api.downloadAttachment.mockReturnValueOnce(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            error: new Blob(
              [JSON.stringify({ message: 'File is still being processed.' })],
              { type: 'application/json' }
            )
          })
      )
    );

    downloadButton().click();
    // Error mapper reads the Blob body asynchronously; flush Promise queue.
    await flushAsync();
    fixture.detectChanges();

    expect(fixture.componentInstance.isError()).toBe(true);
    expect(fixture.componentInstance.downloadState().error?.code).toBe(
      'HTTP_400_PROCESSING'
    );
    expect(
      fixture.debugElement.query(By.css('.attachment-row__retry'))
    ).toBeTruthy();
  });

  it('maps 403 → non-retryable error region without Retry', async () => {
    api.downloadAttachment.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 403 }))
    );

    downloadButton().click();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    expect(fixture.componentInstance.downloadState().error?.code).toBe(
      'HTTP_403'
    );
    expect(fixture.componentInstance.downloadState().error?.retryable).toBe(
      false
    );
    expect(
      fixture.debugElement.query(By.css('.attachment-row__retry'))
    ).toBeNull();
  });

  it('maps 404 "File upload failed." → HTTP_404_FAILED, non-retryable', async () => {
    api.downloadAttachment.mockReturnValueOnce(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 404,
            error: new Blob(
              [JSON.stringify({ message: 'File upload failed.' })],
              { type: 'application/json' }
            )
          })
      )
    );

    downloadButton().click();
    await flushAsync();
    fixture.detectChanges();

    expect(fixture.componentInstance.downloadState().error?.code).toBe(
      'HTTP_404_FAILED'
    );
  });

  it('status 0 → NETWORK, retryable', async () => {
    api.downloadAttachment.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 0 }))
    );

    downloadButton().click();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    expect(fixture.componentInstance.downloadState().error?.code).toBe(
      'NETWORK'
    );
    expect(fixture.componentInstance.downloadState().error?.retryable).toBe(
      true
    );
  });

  it('retry re-issues the download after a retryable error', async () => {
    api.downloadAttachment.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 500 }))
    );

    downloadButton().click();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    expect(
      fixture.debugElement.query(By.css('.attachment-row__retry'))
    ).toBeTruthy();

    // Second call should succeed.
    api.downloadAttachment.mockReturnValueOnce(
      of(new HttpResponse({ body: new Blob(['ok']), status: 200 }))
    );

    const retry = fixture.debugElement.query(By.css('.attachment-row__retry'))
      .nativeElement as HTMLButtonElement;
    retry.click();
    await Promise.resolve();
    fixture.detectChanges();

    expect(api.downloadAttachment).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.isError()).toBe(false);
  });

  it('maps 400 with non-processing body → HTTP_400_OTHER, retryable', async () => {
    api.downloadAttachment.mockReturnValueOnce(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            error: new Blob(
              [JSON.stringify({ message: 'Validation failed.' })],
              { type: 'application/json' }
            )
          })
      )
    );

    downloadButton().click();
    await flushAsync();
    fixture.detectChanges();

    expect(fixture.componentInstance.downloadState().error?.code).toBe(
      'HTTP_400_OTHER'
    );
    expect(fixture.componentInstance.downloadState().error?.retryable).toBe(
      true
    );
  });

  it('maps 404 "File not found." → HTTP_404_MISSING, non-retryable', async () => {
    api.downloadAttachment.mockReturnValueOnce(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 404,
            error: new Blob(
              [JSON.stringify({ message: 'File not found.' })],
              { type: 'application/json' }
            )
          })
      )
    );

    downloadButton().click();
    await flushAsync();
    fixture.detectChanges();

    expect(fixture.componentInstance.downloadState().error?.code).toBe(
      'HTTP_404_MISSING'
    );
    expect(fixture.componentInstance.downloadState().error?.retryable).toBe(
      false
    );
    expect(
      fixture.debugElement.query(By.css('.attachment-row__retry'))
    ).toBeNull();
  });

  it('maps 404 with unparseable body → HTTP_404_OTHER, non-retryable', async () => {
    api.downloadAttachment.mockReturnValueOnce(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 404,
            error: new Blob(['not-json-at-all'], { type: 'application/json' })
          })
      )
    );

    downloadButton().click();
    await flushAsync();
    fixture.detectChanges();

    expect(fixture.componentInstance.downloadState().error?.code).toBe(
      'HTTP_404_OTHER'
    );
  });

  it('maps 500 → HTTP_5XX, retryable', async () => {
    api.downloadAttachment.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 500 }))
    );

    downloadButton().click();
    await flushAsync();
    fixture.detectChanges();

    expect(fixture.componentInstance.downloadState().error?.code).toBe(
      'HTTP_5XX'
    );
    expect(fixture.componentInstance.downloadState().error?.retryable).toBe(
      true
    );
  });

  it('maps 418 → HTTP_OTHER, retryable', async () => {
    api.downloadAttachment.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 418 }))
    );

    downloadButton().click();
    await flushAsync();
    fixture.detectChanges();

    expect(fixture.componentInstance.downloadState().error?.code).toBe(
      'HTTP_OTHER'
    );
  });

  it('clears aria-busy and re-enables the button on error (busy affordance clears on error too)', async () => {
    api.downloadAttachment.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 500 }))
    );

    downloadButton().click();
    await flushAsync();
    fixture.detectChanges();

    expect(downloadButton().disabled).toBe(false);
    expect(downloadButton().getAttribute('aria-busy')).toBeNull();
  });

  it('renders a role="alert" region for the row error with aria-live="polite"', async () => {
    api.downloadAttachment.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 500 }))
    );

    downloadButton().click();
    await flushAsync();
    fixture.detectChanges();

    const region = fixture.debugElement.query(By.css('.attachment-row__error'))
      .nativeElement as HTMLElement;
    expect(region.getAttribute('role')).toBe('alert');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.getAttribute('aria-atomic')).toBe('true');
  });

  it('retry focuses the download button after the pill unmounts', async () => {
    api.downloadAttachment.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 500 }))
    );

    downloadButton().click();
    await flushAsync();
    fixture.detectChanges();

    // Synchronous `of(...)` on the retry attempt so we can observe focus
    // after the pill unmounts and the microtask fires.
    api.downloadAttachment.mockReturnValueOnce(
      of(new HttpResponse({ body: new Blob(['ok']), status: 200 }))
    );

    const retry = fixture.debugElement.query(By.css('.attachment-row__retry'))
      .nativeElement as HTMLButtonElement;
    // Give the retry pill focus so we can prove focus moves off it.
    retry.focus();
    retry.click();
    // `handleRetryClick` uses queueMicrotask to restore focus.
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    expect(document.activeElement).toBe(downloadButton());
  });

  it('binds the `datetime` attribute to the raw ISO createdAt on the <time> element', () => {
    const time = fixture.debugElement.query(By.css('.attachment-row__date'))
      .nativeElement as HTMLElement;
    expect(time.getAttribute('datetime')).toBe('2026-05-04T10:00:00Z');
  });

  it('binds the full filename to the title attribute for very long names', () => {
    const longName =
      'meeting-notes-2026-05-06-quarterly-planning-and-retrospective-final-v4.docx';
    fixture.componentRef.setInput(
      'attachment',
      makeAsset({ fileName: longName })
    );
    fixture.detectChanges();

    const span = fixture.debugElement.query(By.css('.attachment-row__filename'))
      .nativeElement as HTMLElement;
    expect(span.getAttribute('title')).toBe(longName);
    expect(span.textContent?.trim()).toBe(longName);
    // Ellipsis behaviour is CSS-only (text-overflow: ellipsis) — we verify
    // the DOM still holds the full text so AT + title tooltip expose it.
  });

  it('renders the download glyph (not the spinner) in idle', () => {
    expect(
      fixture.debugElement.query(By.css('.attachment-row__download-icon'))
    ).toBeTruthy();
    expect(
      fixture.debugElement.query(By.css('.attachment-row__download-spinner'))
    ).toBeNull();
  });

  it('swaps the download glyph for a spinner during download', () => {
    const subject = new Subject<HttpResponse<Blob>>();
    api.downloadAttachment.mockReturnValueOnce(subject.asObservable());

    downloadButton().click();
    fixture.detectChanges();

    expect(
      fixture.debugElement.query(By.css('.attachment-row__download-spinner'))
    ).toBeTruthy();
    expect(
      fixture.debugElement.query(By.css('.attachment-row__download-icon'))
    ).toBeNull();

    subject.next(new HttpResponse({ body: new Blob(['x']), status: 200 }));
    subject.complete();
  });

  it('iconCategory falls back to image for image/webp', () => {
    fixture.componentRef.setInput(
      'attachment',
      makeAsset({ mimeType: 'image/webp', fileName: 'photo.webp' })
    );
    fixture.detectChanges();
    const icon = fixture.debugElement.query(By.css('.attachment-row__icon'))
      .nativeElement as HTMLElement;
    expect(icon.getAttribute('data-category')).toBe('image');
  });
});

describe('AttachmentRowComponent (row isolation)', () => {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;

  beforeEach(() => {
    URL.createObjectURL = vi.fn(
      () => 'blob:mock'
    ) as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
  });

  afterEach(() => {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    vi.restoreAllMocks();
  });

  it('row A error does not mutate row B state', async () => {
    // Two independent rows share one mock API service. A fails, B is idle.
    const api = new MockAttachmentsApi();

    await TestBed.configureTestingModule({
      imports: [AttachmentRowComponent],
      providers: [{ provide: AttachmentsApiService, useValue: api }]
    }).compileComponents();

    const fA = TestBed.createComponent(AttachmentRowComponent);
    fA.componentRef.setInput(
      'attachment',
      makeAsset({ id: 'asset-A', fileName: 'a.pdf' })
    );
    fA.detectChanges();

    const fB = TestBed.createComponent(AttachmentRowComponent);
    fB.componentRef.setInput(
      'attachment',
      makeAsset({ id: 'asset-B', fileName: 'b.pdf' })
    );
    fB.detectChanges();

    // Row A: throw 403. Row B: never clicked — stays idle.
    api.downloadAttachment.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 403 }))
    );

    const buttonA = fA.debugElement
      .query(By.css('.attachment-row__download'))
      .nativeElement as HTMLButtonElement;
    buttonA.click();
    for (let i = 0; i < 8; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await Promise.resolve();
    }
    fA.detectChanges();

    expect(fA.componentInstance.isError()).toBe(true);
    expect(fB.componentInstance.isError()).toBe(false);
    expect(fB.componentInstance.downloadState().phase).toBe('idle');
  });
});


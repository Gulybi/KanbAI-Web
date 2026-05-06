import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { beforeEach, describe, expect, it } from 'vitest';

import { UploadProgressRowComponent } from './upload-progress-row.component';
import { AttachmentUpload } from '../../models/attachment-upload.model';

function makeUpload(partial?: Partial<AttachmentUpload>): AttachmentUpload {
  return {
    id: 'u-1',
    taskId: 't-1',
    file: new File([new Uint8Array(4)], 'hello.pdf'),
    fileSizeDisplay: '3.8 MB',
    phase: 'uploading',
    progress: 47,
    assetId: null,
    error: null,
    startedAt: 0,
    ...partial
  };
}

async function mount(
  upload: AttachmentUpload
): Promise<{
  fixture: ComponentFixture<UploadProgressRowComponent>;
  emits: { cancel: string[]; retry: string[]; dismiss: string[] };
}> {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [UploadProgressRowComponent]
  }).compileComponents();
  const fixture = TestBed.createComponent(UploadProgressRowComponent);
  fixture.componentRef.setInput('upload', upload);
  const emits = { cancel: [] as string[], retry: [] as string[], dismiss: [] as string[] };
  fixture.componentInstance.cancel.subscribe(id => emits.cancel.push(id));
  fixture.componentInstance.retry.subscribe(id => emits.retry.push(id));
  fixture.componentInstance.dismiss.subscribe(id => emits.dismiss.push(id));
  fixture.detectChanges();
  return { fixture, emits };
}

describe('UploadProgressRowComponent', () => {
  describe('uploading phase', () => {
    let fixture: ComponentFixture<UploadProgressRowComponent>;
    let emits: { cancel: string[]; retry: string[]; dismiss: string[] };

    beforeEach(async () => {
      ({ fixture, emits } = await mount(makeUpload()));
    });

    it('renders filename and file size', () => {
      const name = fixture.debugElement.query(By.css('.upload-row__filename'));
      const size = fixture.debugElement.query(By.css('.upload-row__filesize'));
      expect(name.nativeElement.textContent.trim()).toBe('hello.pdf');
      expect(size.nativeElement.textContent).toContain('3.8 MB');
    });

    it('renders a progressbar with live aria-valuenow', () => {
      const bar = fixture.debugElement.query(By.css('.upload-row__bar'));
      expect(bar.nativeElement.getAttribute('role')).toBe('progressbar');
      expect(bar.nativeElement.getAttribute('aria-valuenow')).toBe('47');
      expect(bar.nativeElement.getAttribute('aria-valuemin')).toBe('0');
      expect(bar.nativeElement.getAttribute('aria-valuemax')).toBe('100');
    });

    it('sets progress bar width to the current percent', () => {
      const fill = fixture.debugElement.query(By.css('.upload-row__bar-fill'));
      expect((fill.nativeElement as HTMLElement).style.width).toBe('47%');
    });

    it('shows the numeric percent with % suffix', () => {
      const pct = fixture.debugElement.query(By.css('.upload-row__percent'));
      expect(pct.nativeElement.textContent.trim()).toBe('47%');
    });

    it('renders the "Uploading…" status label', () => {
      const status = fixture.debugElement.query(By.css('.upload-row__status'));
      expect(status.nativeElement.textContent).toContain('Uploading');
    });

    it('emits cancel(uploadId) when the cancel button is clicked', () => {
      const cancel = fixture.debugElement.query(By.css('.upload-row__icon-button'));
      cancel.nativeElement.click();
      expect(emits.cancel).toEqual(['u-1']);
    });

    it('does NOT render error region or retry/dismiss buttons', () => {
      expect(fixture.debugElement.query(By.css('.upload-row__error'))).toBeNull();
      expect(fixture.debugElement.query(By.css('.upload-row__retry-button'))).toBeNull();
    });
  });

  describe('processing phase', () => {
    it('switches the bar to indeterminate and omits aria-valuenow', async () => {
      const { fixture } = await mount(
        makeUpload({ phase: 'processing', progress: 100, assetId: 'a-1' })
      );
      const bar = fixture.debugElement.query(By.css('.upload-row__bar'));
      expect(bar.nativeElement.classList.contains('upload-row__bar--indeterminate')).toBe(true);
      expect(bar.nativeElement.hasAttribute('aria-valuenow')).toBe(false);
    });

    it('renders cancel as aria-disabled and does NOT emit on click', async () => {
      const { fixture, emits } = await mount(
        makeUpload({ phase: 'processing', progress: 100, assetId: 'a-1' })
      );
      const cancel = fixture.debugElement.query(By.css('.upload-row__icon-button'));
      expect(cancel.nativeElement.getAttribute('aria-disabled')).toBe('true');
      cancel.nativeElement.click();
      expect(emits.cancel).toEqual([]);
    });

    it('renders the "Processing…" status label, no numeric percent', async () => {
      const { fixture } = await mount(
        makeUpload({ phase: 'processing', progress: 100, assetId: 'a-1' })
      );
      const status = fixture.debugElement.query(By.css('.upload-row__status'));
      expect(status.nativeElement.textContent).toContain('Processing');
      expect(fixture.debugElement.query(By.css('.upload-row__percent'))).toBeNull();
    });
  });

  describe('error phase', () => {
    it('renders role=alert with the verbatim userMessage', async () => {
      const { fixture } = await mount(
        makeUpload({
          phase: 'error',
          progress: 40,
          error: {
            code: 'HTTP_413',
            userMessage: 'hello.pdf is larger than 10 MB.'
          }
        })
      );
      const alert = fixture.debugElement.query(By.css('.upload-row__error'));
      expect(alert.nativeElement.getAttribute('role')).toBe('alert');
      const message = fixture.debugElement.query(By.css('.upload-row__error-message'));
      expect(message.nativeElement.textContent).toContain('hello.pdf is larger than 10 MB.');
    });

    it('emits retry on Try again click', async () => {
      const { fixture, emits } = await mount(
        makeUpload({
          phase: 'error',
          error: { code: 'HTTP_500', userMessage: 'boom' }
        })
      );
      fixture.debugElement
        .query(By.css('.upload-row__retry-button'))
        .nativeElement.click();
      expect(emits.retry).toEqual(['u-1']);
    });

    it('emits dismiss on × click', async () => {
      const { fixture, emits } = await mount(
        makeUpload({
          phase: 'error',
          error: { code: 'HTTP_500', userMessage: 'boom' }
        })
      );
      fixture.debugElement
        .query(By.css('.upload-row__icon-button'))
        .nativeElement.click();
      expect(emits.dismiss).toEqual(['u-1']);
    });

    it('disables Try again when code === HTTP_403', async () => {
      const { fixture, emits } = await mount(
        makeUpload({
          phase: 'error',
          error: {
            code: 'HTTP_403',
            userMessage: "You're no longer a member of this project."
          }
        })
      );
      const retry = fixture.debugElement.query(By.css('.upload-row__retry-button'));
      expect(retry.nativeElement.getAttribute('aria-disabled')).toBe('true');
      retry.nativeElement.click();
      expect(emits.retry).toEqual([]);
    });

    it('does not render the progress bar in error phase', async () => {
      const { fixture } = await mount(
        makeUpload({
          phase: 'error',
          error: { code: 'HTTP_500', userMessage: 'boom' }
        })
      );
      expect(fixture.debugElement.query(By.css('.upload-row__bar'))).toBeNull();
    });
  });
});

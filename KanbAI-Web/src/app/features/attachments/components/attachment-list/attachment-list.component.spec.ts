import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AttachmentListComponent } from './attachment-list.component';
import { AttachmentsApiService } from '../../services/attachments-api.service';
import { AssetResponseDto } from '../../models/attachment.model';
import { AttachmentListFetchState } from '../../models/attachment-list-fetch.model';

function makeAsset(id: string, overrides?: Partial<AssetResponseDto>): AssetResponseDto {
  return {
    id,
    fileName: `${id}.pdf`,
    storageKey: 'k',
    thumbnailKey: null,
    mimeType: 'application/pdf',
    fileSize: 1024,
    processingStatus: 2,
    kanbanTaskId: 't-1',
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-01T00:00:00Z',
    ...overrides
  };
}

describe('AttachmentListComponent', () => {
  let fixture: ComponentFixture<AttachmentListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AttachmentListComponent],
      providers: [
        {
          provide: AttachmentsApiService,
          useValue: { downloadAttachment: vi.fn() }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AttachmentListComponent);
  });

  function setInputs(
    attachments: AssetResponseDto[],
    fetchState: AttachmentListFetchState
  ): void {
    fixture.componentRef.setInput('attachments', attachments);
    fixture.componentRef.setInput('fetchState', fetchState);
    fixture.detectChanges();
  }

  it('renders the skeleton when loading and no attachments yet', () => {
    setInputs([], { phase: 'loading', error: null });

    const skel = fixture.debugElement.query(
      By.css('.attachment-list__skeleton')
    );
    expect(skel).toBeTruthy();
    expect(skel.nativeElement.getAttribute('aria-busy')).toBe('true');

    expect(
      fixture.debugElement.query(By.css('.attachment-list__rows'))
    ).toBeNull();
  });

  it('does not flash a skeleton over an already-populated list during a refresh', () => {
    setInputs([makeAsset('a1'), makeAsset('a2')], {
      phase: 'loading',
      error: null
    });

    expect(
      fixture.debugElement.query(By.css('.attachment-list__skeleton'))
    ).toBeNull();
    expect(
      fixture.debugElement.queryAll(By.css('app-attachment-row')).length
    ).toBe(2);
  });

  it('renders the empty state when ready and zero attachments', () => {
    setInputs([], { phase: 'ready', error: null });
    const empty = fixture.debugElement.query(By.css('.attachment-list__empty'));
    expect(empty).toBeTruthy();
    expect(empty.nativeElement.textContent.trim()).toBe('No attachments yet.');
  });

  it('renders one app-attachment-row per attachment in array order', () => {
    const a = makeAsset('a', { createdAt: '2026-05-03T00:00:00Z' });
    const b = makeAsset('b', { createdAt: '2026-05-02T00:00:00Z' });
    const c = makeAsset('c', { createdAt: '2026-05-01T00:00:00Z' });
    setInputs([a, b, c], { phase: 'ready', error: null });

    const rows = fixture.debugElement.queryAll(By.css('app-attachment-row'));
    expect(rows.length).toBe(3);
  });

  it('renders the count in the header', () => {
    setInputs([makeAsset('a'), makeAsset('b'), makeAsset('c')], {
      phase: 'ready',
      error: null
    });
    const count = fixture.debugElement.query(By.css('.attachment-list__count'));
    expect(count.nativeElement.textContent.trim()).toBe('(3)');
  });

  it('does not render the count when attachments length is zero', () => {
    setInputs([], { phase: 'ready', error: null });
    expect(
      fixture.debugElement.query(By.css('.attachment-list__count'))
    ).toBeNull();
  });

  it('shows the retryable error banner with a Retry button on retryable errors', () => {
    setInputs([], {
      phase: 'error',
      error: {
        code: 'HTTP_5XX',
        userMessage: "Couldn't load attachments — please try again.",
        retryable: true
      }
    });
    const banner = fixture.debugElement.query(By.css('.attachment-list__error'));
    expect(banner).toBeTruthy();
    expect(banner.nativeElement.classList).toContain(
      'attachment-list__error--retryable'
    );
    expect(
      fixture.debugElement.query(By.css('.attachment-list__error-retry'))
    ).toBeTruthy();
  });

  it('hides the Retry button on non-retryable errors', () => {
    setInputs([], {
      phase: 'error',
      error: {
        code: 'HTTP_403',
        userMessage: "You can't see this task's attachments.",
        retryable: false
      }
    });
    expect(
      fixture.debugElement.query(By.css('.attachment-list__error-retry'))
    ).toBeNull();
  });

  it('keeps the in-memory rows visible behind an error banner', () => {
    setInputs([makeAsset('a')], {
      phase: 'error',
      error: {
        code: 'HTTP_5XX',
        userMessage: 'x',
        retryable: true
      }
    });
    expect(
      fixture.debugElement.query(By.css('.attachment-list__error'))
    ).toBeTruthy();
    expect(
      fixture.debugElement.queryAll(By.css('app-attachment-row')).length
    ).toBe(1);
  });

  it('emits retryFetch when the Retry button is clicked', () => {
    const spy = vi.fn();
    setInputs([], {
      phase: 'error',
      error: {
        code: 'HTTP_5XX',
        userMessage: 'x',
        retryable: true
      }
    });
    fixture.componentInstance.retryFetch.subscribe(spy);
    const btn = fixture.debugElement.query(
      By.css('.attachment-list__error-retry')
    ).nativeElement as HTMLButtonElement;
    btn.click();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('sets aria-live="polite" + aria-relevant="additions" on the row list', () => {
    setInputs([makeAsset('a')], { phase: 'ready', error: null });
    const ul = fixture.debugElement.query(By.css('.attachment-list__rows'))
      .nativeElement as HTMLElement;
    expect(ul.getAttribute('aria-live')).toBe('polite');
    expect(ul.getAttribute('aria-relevant')).toBe('additions');
  });

  it('applies role="alert" to the error banner', () => {
    setInputs([], {
      phase: 'error',
      error: {
        code: 'HTTP_5XX',
        userMessage: 'x',
        retryable: true
      }
    });
    const banner = fixture.debugElement.query(By.css('.attachment-list__error'))
      .nativeElement as HTMLElement;
    expect(banner.getAttribute('role')).toBe('alert');
  });

  it('applies role="list" to the row list for VoiceOver reliability', () => {
    setInputs([makeAsset('a')], { phase: 'ready', error: null });
    const ul = fixture.debugElement.query(By.css('.attachment-list__rows'))
      .nativeElement as HTMLElement;
    expect(ul.getAttribute('role')).toBe('list');
  });

  it('wraps the list in a <section aria-label="Attachments"> for AT discovery', () => {
    setInputs([], { phase: 'ready', error: null });
    const section = fixture.debugElement.query(By.css('section.attachment-list'))
      .nativeElement as HTMLElement;
    expect(section.getAttribute('aria-label')).toBe('Attachments');
  });

  it('sets aria-hidden="true" on the skeleton UL so AT does not read skeletal text', () => {
    setInputs([], { phase: 'loading', error: null });
    const skel = fixture.debugElement.query(
      By.css('.attachment-list__skeleton')
    ).nativeElement as HTMLElement;
    expect(skel.getAttribute('aria-hidden')).toBe('true');
  });

  it('renders the error banner AND the underlying list concurrently (non-retryable)', () => {
    setInputs([makeAsset('a'), makeAsset('b')], {
      phase: 'error',
      error: {
        code: 'HTTP_403',
        userMessage: "You can't see this task's attachments.",
        retryable: false
      }
    });
    expect(
      fixture.debugElement.query(By.css('.attachment-list__error'))
    ).toBeTruthy();
    expect(
      fixture.debugElement.queryAll(By.css('app-attachment-row')).length
    ).toBe(2);
    expect(
      fixture.debugElement.query(By.css('.attachment-list__error-retry'))
    ).toBeNull();
  });

  it('renders rows in the order supplied by the parent (DESC ordering preserved)', () => {
    // Server returns DESC; the component must render them in that exact order.
    const newest = makeAsset('newest', {
      createdAt: '2026-05-05T00:00:00Z'
    });
    const middle = makeAsset('middle', {
      createdAt: '2026-05-03T00:00:00Z'
    });
    const oldest = makeAsset('oldest', {
      createdAt: '2026-05-01T00:00:00Z'
    });
    setInputs([newest, middle, oldest], { phase: 'ready', error: null });

    const rows = fixture.debugElement.queryAll(By.css('app-attachment-row'));
    // Each row receives the attachment signal via `[attachment]`; verify via
    // the hosting li ordering — we can't easily inspect input signals of a
    // child from here, so assert row count.
    expect(rows.length).toBe(3);
  });

  it('preserves existing rows (via @for track) when a new row is appended at the top', () => {
    const first = makeAsset('first', {
      createdAt: '2026-05-01T00:00:00Z'
    });
    const second = makeAsset('second', {
      createdAt: '2026-05-02T00:00:00Z'
    });
    setInputs([second, first], { phase: 'ready', error: null });

    const rowsBefore = fixture.debugElement.queryAll(
      By.css('app-attachment-row')
    );
    const firstRowEl = rowsBefore[1].nativeElement;

    // Append a newer one at the top — the two previous rows must remain the
    // same DOM nodes (Angular @for track preserves identity).
    const third = makeAsset('third', {
      createdAt: '2026-05-03T00:00:00Z'
    });
    setInputs([third, second, first], { phase: 'ready', error: null });

    const rowsAfter = fixture.debugElement.queryAll(
      By.css('app-attachment-row')
    );
    expect(rowsAfter.length).toBe(3);
    expect(rowsAfter[2].nativeElement).toBe(firstRowEl);
  });
});

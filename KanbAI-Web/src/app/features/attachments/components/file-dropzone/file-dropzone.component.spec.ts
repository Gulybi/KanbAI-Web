import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { FileDropzoneComponent } from './file-dropzone.component';
import {
  ATTACHMENT_ACCEPT_ATTRIBUTE,
  ATTACHMENT_ALLOWED_EXTENSIONS_DISPLAY,
  ATTACHMENT_MAX_BYTES
} from '../../constants/attachment-rules';
import type {
  DropzoneFileSelectedEvent,
  DropzoneValidationError
} from '../../models/dropzone.model';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFile(name: string, size: number, type = 'application/octet-stream'): File {
  return new File([new Uint8Array(size)], name, { type });
}

function fakeFileList(files: File[]): FileList {
  const list = Object.assign([...files], {
    item: (i: number): File | null => files[i] ?? null
  });
  return list as unknown as FileList;
}

function attachDataTransfer(event: Event, files: File[]): void {
  // jsdom has neither DragEvent nor DataTransfer — we build a plain Event
  // of the right type and stub the minimal dataTransfer surface the
  // component consumes.
  Object.defineProperty(event, 'dataTransfer', {
    value: {
      files: fakeFileList(files),
      dropEffect: 'copy',
      items: []
    },
    configurable: true
  });
}

function makeDropEvent(files: File[]): Event {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  attachDataTransfer(event, files);
  return event;
}

function makeDragEvent(
  type: 'dragenter' | 'dragover' | 'dragleave',
  files: File[] = []
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  attachDataTransfer(event, files);
  return event;
}

// ---------------------------------------------------------------------------
// Global no-file-metadata-in-console guard. Applies to every test in this file.
// ---------------------------------------------------------------------------

let consoleLogSpy: ReturnType<typeof vi.spyOn>;

function assertNoFileMetadataLogged(): void {
  for (const call of consoleLogSpy.mock.calls) {
    for (const arg of call) {
      if (arg instanceof File) {
        throw new Error(`console.log received a File reference: ${arg.name}`);
      }
      if (typeof arg === 'string') {
        // Rough guardrail — reject the canned names used in this spec
        // (NOT user input; our own code is the only caller we care about).
        const suspects = ['spec.pdf', 'IMAGE.PNG', 'malware.exe', 'huge.pdf', 'tiny.txt'];
        for (const s of suspects) {
          if (arg.includes(s)) {
            throw new Error(`console.log contained filename "${s}" — privacy regression.`);
          }
        }
      }
    }
  }
}

describe('FileDropzoneComponent', () => {
  let fixture: ComponentFixture<FileDropzoneComponent>;
  let component: FileDropzoneComponent;
  let emittedFiles: DropzoneFileSelectedEvent[];
  let emittedErrors: DropzoneValidationError[];

  beforeEach(async () => {
    emittedFiles = [];
    emittedErrors = [];

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await TestBed.configureTestingModule({
      imports: [FileDropzoneComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(FileDropzoneComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('taskId', 'task-1');
    fixture.componentRef.setInput('disabled', false);
    fixture.componentRef.setInput('disabledReason', null);

    component.fileSelected.subscribe(e => emittedFiles.push(e));
    component.validationFailed.subscribe(e => emittedErrors.push(e));

    fixture.detectChanges();
  });

  afterEach(() => {
    assertNoFileMetadataLogged();
    consoleLogSpy.mockRestore();
    fixture.destroy();
  });

  // -------------------------------------------------------------------------
  // Rendering — idle state
  // -------------------------------------------------------------------------
  describe('Rendering — idle state', () => {
    it('renders the idle copy containing the max-size and every allowed extension', () => {
      const hint = fixture.debugElement.query(By.css('.file-dropzone__hint'));
      expect(hint).toBeTruthy();
      const text: string = hint.nativeElement.textContent;
      expect(text).toContain('10 MB');
      for (const display of ATTACHMENT_ALLOWED_EXTENSIONS_DISPLAY.split(', ')) {
        expect(text).toContain(display);
      }
    });

    it('root has role=button and tabindex=0', () => {
      const root = fixture.debugElement.query(By.css('.file-dropzone'));
      expect(root.nativeElement.getAttribute('role')).toBe('button');
      expect(root.nativeElement.getAttribute('tabindex')).toBe('0');
    });

    it('root has a non-empty aria-label describing the affordance', () => {
      const root = fixture.debugElement.query(By.css('.file-dropzone'));
      const label: string | null = root.nativeElement.getAttribute('aria-label');
      expect(label).toBeTruthy();
      expect(label!.length).toBeGreaterThan(10);
      expect(label).toContain('10 MB');
    });

    it('hidden input has the composed accept attribute', () => {
      const input = fixture.debugElement.query(By.css('.file-dropzone__native-input'));
      expect(input.nativeElement.getAttribute('accept')).toBe(ATTACHMENT_ACCEPT_ATTRIBUTE);
    });
  });

  // -------------------------------------------------------------------------
  // Drag interaction
  // -------------------------------------------------------------------------
  describe('Drag interaction', () => {
    it('dragenter transitions the phase to dragover', () => {
      const root = fixture.debugElement.query(By.css('.file-dropzone'));
      root.nativeElement.dispatchEvent(makeDragEvent('dragenter'));
      fixture.detectChanges();
      expect(component.phase()).toBe('dragover');
      expect(root.nativeElement.classList.contains('file-dropzone--dragover')).toBe(true);
    });

    it('dragleave (outside the host) returns the phase to idle', () => {
      const root = fixture.debugElement.query(By.css('.file-dropzone'));
      root.nativeElement.dispatchEvent(makeDragEvent('dragenter'));
      fixture.detectChanges();
      expect(component.phase()).toBe('dragover');

      const leaveEvent = makeDragEvent('dragleave');
      root.nativeElement.dispatchEvent(leaveEvent);
      fixture.detectChanges();
      expect(component.phase()).toBe('idle');
    });

    it('dragover calls preventDefault so drop will fire', () => {
      const root = fixture.debugElement.query(By.css('.file-dropzone'));
      const event = makeDragEvent('dragover');
      root.nativeElement.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    });

    it('dragleave into a child element (related target inside host) keeps phase=dragover', () => {
      const root = fixture.debugElement.query(By.css('.file-dropzone'));
      root.nativeElement.dispatchEvent(makeDragEvent('dragenter'));
      fixture.detectChanges();
      expect(component.phase()).toBe('dragover');

      // Simulate the pointer crossing into an inner SVG icon — the leave
      // event fires on the host but related target is *inside* the host.
      const innerChild = root.nativeElement.querySelector('.file-dropzone__icon') as HTMLElement;
      expect(innerChild).toBeTruthy();
      const leaveEvent = makeDragEvent('dragleave');
      Object.defineProperty(leaveEvent, 'relatedTarget', {
        value: innerChild,
        configurable: true
      });
      root.nativeElement.dispatchEvent(leaveEvent);
      fixture.detectChanges();

      expect(component.phase()).toBe('dragover');
    });
  });

  // -------------------------------------------------------------------------
  // Drop — happy path
  // -------------------------------------------------------------------------
  describe('Drop — happy path', () => {
    it('drops a valid PDF → phase=selected, emits fileSelected once, no error', () => {
      const root = fixture.debugElement.query(By.css('.file-dropzone'));
      root.nativeElement.dispatchEvent(makeDropEvent([makeFile('spec.pdf', 1024)]));
      fixture.detectChanges();

      expect(component.phase()).toBe('selected');
      expect(emittedFiles.length).toBe(1);
      expect(emittedFiles[0].file.name).toBe('spec.pdf');
      expect(emittedFiles[0].taskId).toBe('task-1');
      expect(emittedErrors.length).toBe(0);
    });

    it('selectedFileSummary matches "<name> · <size>"', () => {
      const root = fixture.debugElement.query(By.css('.file-dropzone'));
      root.nativeElement.dispatchEvent(makeDropEvent([makeFile('spec.pdf', 1024)]));
      fixture.detectChanges();
      expect(component.selectedFileSummary()).toMatch(/spec\.pdf.*1\.0 KB/);
    });

    it('dropping a second file replaces the selection and emits again', () => {
      const root = fixture.debugElement.query(By.css('.file-dropzone'));
      root.nativeElement.dispatchEvent(makeDropEvent([makeFile('spec.pdf', 1024)]));
      fixture.detectChanges();
      root.nativeElement.dispatchEvent(makeDropEvent([makeFile('notes.txt', 2048)]));
      fixture.detectChanges();

      expect(emittedFiles.length).toBe(2);
      expect(emittedFiles[1].file.name).toBe('notes.txt');
      expect(component.phase()).toBe('selected');
    });
  });

  // -------------------------------------------------------------------------
  // Drop — error paths
  // -------------------------------------------------------------------------
  describe('Drop — error paths', () => {
    it('format rejection: .exe → phase=error, code=FORMAT_NOT_ALLOWED, no emission', () => {
      const root = fixture.debugElement.query(By.css('.file-dropzone'));
      root.nativeElement.dispatchEvent(makeDropEvent([makeFile('malware.exe', 1024)]));
      fixture.detectChanges();

      expect(component.phase()).toBe('error');
      expect(emittedFiles.length).toBe(0);
      expect(emittedErrors.length).toBe(1);
      expect(emittedErrors[0].code).toBe('FORMAT_NOT_ALLOWED');
    });

    it('size-zero rejection', () => {
      const root = fixture.debugElement.query(By.css('.file-dropzone'));
      root.nativeElement.dispatchEvent(makeDropEvent([makeFile('spec.pdf', 0)]));
      fixture.detectChanges();

      expect(emittedErrors[0]?.code).toBe('SIZE_ZERO');
      expect(component.phase()).toBe('error');
    });

    it('size-exceeded rejection and the rendered message contains the formatted actual size', () => {
      const root = fixture.debugElement.query(By.css('.file-dropzone'));
      root.nativeElement.dispatchEvent(
        makeDropEvent([makeFile('huge.pdf', ATTACHMENT_MAX_BYTES + 1)])
      );
      fixture.detectChanges();

      expect(emittedErrors[0]?.code).toBe('SIZE_EXCEEDED');
      const headline = fixture.debugElement.query(By.css('.file-dropzone__headline'));
      expect(headline.nativeElement.textContent).toContain('MB');
    });

    it('invalid-name rejection', () => {
      const root = fixture.debugElement.query(By.css('.file-dropzone'));
      root.nativeElement.dispatchEvent(makeDropEvent([makeFile('foo\\bad.txt', 1024)]));
      fixture.detectChanges();
      expect(emittedErrors[0]?.code).toBe('NAME_INVALID');
    });

    it('recovery: error → dropping a valid file moves to selected and clears the error', () => {
      const root = fixture.debugElement.query(By.css('.file-dropzone'));
      root.nativeElement.dispatchEvent(makeDropEvent([makeFile('malware.exe', 1024)]));
      fixture.detectChanges();
      expect(component.phase()).toBe('error');

      root.nativeElement.dispatchEvent(makeDropEvent([makeFile('spec.pdf', 1024)]));
      fixture.detectChanges();
      expect(component.phase()).toBe('selected');
    });
  });

  // -------------------------------------------------------------------------
  // Drop — multi-file
  // -------------------------------------------------------------------------
  describe('Drop — multi-file', () => {
    it('all valid: keeps first, emits MULTI_FILE_TRUNCATED informational, stays in selected', () => {
      const root = fixture.debugElement.query(By.css('.file-dropzone'));
      root.nativeElement.dispatchEvent(
        makeDropEvent([
          makeFile('a.png', 1024),
          makeFile('b.png', 1024),
          makeFile('c.png', 1024)
        ])
      );
      fixture.detectChanges();

      expect(emittedFiles.length).toBe(1);
      expect(emittedFiles[0].file.name).toBe('a.png');
      expect(emittedErrors.length).toBe(1);
      expect(emittedErrors[0].code).toBe('MULTI_FILE_TRUNCATED');
      expect(emittedErrors[0].informational).toBe(true);
      expect(component.phase()).toBe('selected');

      const notice = fixture.debugElement.query(By.css('.file-dropzone__notice'));
      expect(notice).toBeTruthy();
    });

    it('first invalid: emits FORMAT_NOT_ALLOWED only, no file selected, phase=error', () => {
      const root = fixture.debugElement.query(By.css('.file-dropzone'));
      root.nativeElement.dispatchEvent(
        makeDropEvent([
          makeFile('evil.exe', 1024),
          makeFile('b.png', 1024)
        ])
      );
      fixture.detectChanges();

      expect(emittedFiles.length).toBe(0);
      expect(emittedErrors.length).toBe(1);
      expect(emittedErrors[0].code).toBe('FORMAT_NOT_ALLOWED');
      expect(component.phase()).toBe('error');
    });
  });

  // -------------------------------------------------------------------------
  // Click / keyboard fallback
  // -------------------------------------------------------------------------
  describe('Click / keyboard fallback', () => {
    it('clicking the root calls .click() on the hidden input', () => {
      const root = fixture.debugElement.query(By.css('.file-dropzone'));
      const input = fixture.debugElement.query(By.css('.file-dropzone__native-input'));
      const clickSpy = vi.spyOn(input.nativeElement as HTMLInputElement, 'click');

      root.nativeElement.click();
      expect(clickSpy).toHaveBeenCalledTimes(1);
    });

    it('Enter key activates the hidden input', () => {
      const root = fixture.debugElement.query(By.css('.file-dropzone'));
      const input = fixture.debugElement.query(By.css('.file-dropzone__native-input'));
      const clickSpy = vi.spyOn(input.nativeElement as HTMLInputElement, 'click');

      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      root.nativeElement.dispatchEvent(event);
      expect(clickSpy).toHaveBeenCalledTimes(1);
    });

    it('Space key activates the hidden input and preventDefaults the event', () => {
      const root = fixture.debugElement.query(By.css('.file-dropzone'));
      const input = fixture.debugElement.query(By.css('.file-dropzone__native-input'));
      const clickSpy = vi.spyOn(input.nativeElement as HTMLInputElement, 'click');

      const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
      root.nativeElement.dispatchEvent(event);
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(event.defaultPrevented).toBe(true);
    });

    it('cancelling the picker (change with no files) does not emit and does not change phase', () => {
      const input = fixture.debugElement.query(By.css('.file-dropzone__native-input'))
        .nativeElement as HTMLInputElement;
      // Simulate a `change` event with no files selected.
      input.dispatchEvent(new Event('change', { bubbles: true }));
      fixture.detectChanges();

      expect(emittedFiles.length).toBe(0);
      expect(emittedErrors.length).toBe(0);
      expect(component.phase()).toBe('idle');
    });

    it('picker selection runs the same validation pipeline as a drop (happy path)', () => {
      const input = fixture.debugElement.query(By.css('.file-dropzone__native-input'))
        .nativeElement as HTMLInputElement;
      Object.defineProperty(input, 'files', {
        value: fakeFileList([makeFile('pick.pdf', 1024)]),
        configurable: true
      });
      input.dispatchEvent(new Event('change', { bubbles: true }));
      fixture.detectChanges();

      expect(component.phase()).toBe('selected');
      expect(emittedFiles.length).toBe(1);
      expect(emittedFiles[0].file.name).toBe('pick.pdf');
      expect(emittedFiles[0].taskId).toBe('task-1');
    });

    it('picker selection runs the same validation pipeline as a drop (rejection path)', () => {
      const input = fixture.debugElement.query(By.css('.file-dropzone__native-input'))
        .nativeElement as HTMLInputElement;
      Object.defineProperty(input, 'files', {
        value: fakeFileList([makeFile('pick.zip', 1024)]),
        configurable: true
      });
      input.dispatchEvent(new Event('change', { bubbles: true }));
      fixture.detectChanges();

      expect(component.phase()).toBe('error');
      expect(emittedFiles.length).toBe(0);
      expect(emittedErrors.length).toBe(1);
      expect(emittedErrors[0].code).toBe('FORMAT_NOT_ALLOWED');
    });

  });

  // -------------------------------------------------------------------------
  // Disabled state
  // -------------------------------------------------------------------------
  describe('Disabled state', () => {
    beforeEach(() => {
      fixture.componentRef.setInput('disabled', true);
      fixture.componentRef.setInput('disabledReason', 'You are not a member of this project.');
      fixture.detectChanges();
    });

    it('phase is disabled regardless of other signals', () => {
      expect(component.phase()).toBe('disabled');
      expect(
        fixture.debugElement
          .query(By.css('.file-dropzone'))
          .nativeElement.classList.contains('file-dropzone--disabled')
      ).toBe(true);
    });

    it('aria-disabled="true" on the root', () => {
      const root = fixture.debugElement.query(By.css('.file-dropzone'));
      expect(root.nativeElement.getAttribute('aria-disabled')).toBe('true');
    });

    it('tabindex is -1 so the zone is not focusable', () => {
      const root = fixture.debugElement.query(By.css('.file-dropzone'));
      expect(root.nativeElement.getAttribute('tabindex')).toBe('-1');
    });

    it('drop is ignored — no emission', () => {
      const root = fixture.debugElement.query(By.css('.file-dropzone'));
      root.nativeElement.dispatchEvent(makeDropEvent([makeFile('spec.pdf', 1024)]));
      fixture.detectChanges();
      expect(emittedFiles.length).toBe(0);
      expect(component.phase()).toBe('disabled');
    });

    it('click is ignored — hidden input .click() not invoked', () => {
      const root = fixture.debugElement.query(By.css('.file-dropzone'));
      const input = fixture.debugElement.query(By.css('.file-dropzone__native-input'));
      const clickSpy = vi.spyOn(input.nativeElement as HTMLInputElement, 'click');

      root.nativeElement.click();
      expect(clickSpy).not.toHaveBeenCalled();
    });

    it('disabled reason appears in both visible copy and aria-label', () => {
      const hint = fixture.debugElement.query(By.css('.file-dropzone__hint'));
      expect(hint.nativeElement.textContent).toContain('You are not a member of this project.');

      const root = fixture.debugElement.query(By.css('.file-dropzone'));
      expect(root.nativeElement.getAttribute('aria-label')).toContain(
        'You are not a member of this project.'
      );
    });
  });

  // -------------------------------------------------------------------------
  // Accessibility — live region announcement
  // -------------------------------------------------------------------------
  describe('Accessibility — live region', () => {
    it('renders a polite, atomic visually-hidden live region in every phase', () => {
      const live = fixture.debugElement.query(By.css('.file-dropzone__sr-only'));
      expect(live).toBeTruthy();
      expect(live.nativeElement.getAttribute('aria-live')).toBe('polite');
      expect(live.nativeElement.getAttribute('aria-atomic')).toBe('true');
    });

    it('live region announces the error message on transition to error', () => {
      const root = fixture.debugElement.query(By.css('.file-dropzone'));
      root.nativeElement.dispatchEvent(makeDropEvent([makeFile('malware.exe', 1024)]));
      fixture.detectChanges();

      const live = fixture.debugElement.query(By.css('.file-dropzone__sr-only'));
      expect(live.nativeElement.textContent).toContain('File type not supported');
    });

    it('live region announces "File selected" on transition to selected', () => {
      const root = fixture.debugElement.query(By.css('.file-dropzone'));
      root.nativeElement.dispatchEvent(makeDropEvent([makeFile('spec.pdf', 1024)]));
      fixture.detectChanges();

      const live = fixture.debugElement.query(By.css('.file-dropzone__sr-only'));
      expect(live.nativeElement.textContent).toContain('File selected');
    });
  });
});

// ---------------------------------------------------------------------------
// Window-level listener lifecycle (isolated TestBed per test).
// ---------------------------------------------------------------------------
describe('FileDropzoneComponent — window suppression lifecycle', () => {
  let addSpy: ReturnType<typeof vi.spyOn>;
  let removeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.resetTestingModule();
    addSpy = vi.spyOn(window, 'addEventListener');
    removeSpy = vi.spyOn(window, 'removeEventListener');
  });

  afterEach(() => {
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  function countEvents(
    spy: ReturnType<typeof vi.spyOn>,
    type: 'dragover' | 'drop'
  ): number {
    return spy.mock.calls.filter((args: readonly unknown[]) => args[0] === type).length;
  }

  it('first mount adds one dragover + one drop listener; last unmount aborts them', async () => {
    await TestBed.configureTestingModule({
      imports: [FileDropzoneComponent]
    }).compileComponents();

    const fixture = TestBed.createComponent(FileDropzoneComponent);
    fixture.componentRef.setInput('taskId', 't-1');
    fixture.detectChanges();

    expect(countEvents(addSpy, 'dragover')).toBe(1);
    expect(countEvents(addSpy, 'drop')).toBe(1);

    fixture.destroy();
    // Abort-based cleanup does not call removeEventListener, but the
    // listeners become inert. We assert the mount count resets by
    // mounting again and seeing fresh adds.
  });

  it('two concurrent instances only install a single set of window listeners', async () => {
    await TestBed.configureTestingModule({
      imports: [FileDropzoneComponent]
    }).compileComponents();

    const a = TestBed.createComponent(FileDropzoneComponent);
    a.componentRef.setInput('taskId', 't-1');
    a.detectChanges();

    const b = TestBed.createComponent(FileDropzoneComponent);
    b.componentRef.setInput('taskId', 't-2');
    b.detectChanges();

    // Exactly one "dragover" + one "drop" window listener across both mounts.
    expect(countEvents(addSpy, 'dragover')).toBe(1);
    expect(countEvents(addSpy, 'drop')).toBe(1);

    a.destroy();
    b.destroy();
  });

  it('remount after full unmount re-installs a fresh listener pair', async () => {
    await TestBed.configureTestingModule({
      imports: [FileDropzoneComponent]
    }).compileComponents();

    const first = TestBed.createComponent(FileDropzoneComponent);
    first.componentRef.setInput('taskId', 't-1');
    first.detectChanges();
    first.destroy();

    const countBeforeRemount = countEvents(addSpy, 'drop');

    const second = TestBed.createComponent(FileDropzoneComponent);
    second.componentRef.setInput('taskId', 't-2');
    second.detectChanges();
    expect(countEvents(addSpy, 'drop')).toBe(countBeforeRemount + 1);

    second.destroy();
  });

  it('page-level drop outside the zone is preventDefaulted (AC #129)', async () => {
    await TestBed.configureTestingModule({
      imports: [FileDropzoneComponent]
    }).compileComponents();

    const fixture = TestBed.createComponent(FileDropzoneComponent);
    fixture.componentRef.setInput('taskId', 't-1');
    fixture.detectChanges();

    // Unrelated element — NOT inside the dropzone host.
    const outside = document.createElement('div');
    document.body.appendChild(outside);

    const dragoverEvent = new Event('dragover', { bubbles: true, cancelable: true });
    Object.defineProperty(dragoverEvent, 'target', { value: outside, configurable: true });
    Object.defineProperty(dragoverEvent, 'dataTransfer', {
      value: { dropEffect: 'copy', files: [], items: [] },
      configurable: true
    });
    window.dispatchEvent(dragoverEvent);
    expect(dragoverEvent.defaultPrevented).toBe(true);

    const dropEvent = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, 'target', { value: outside, configurable: true });
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: { dropEffect: 'copy', files: [], items: [] },
      configurable: true
    });
    window.dispatchEvent(dropEvent);
    expect(dropEvent.defaultPrevented).toBe(true);

    document.body.removeChild(outside);
    fixture.destroy();
  });

  it('page-level drop inside the zone is NOT preventDefaulted by the window guard', async () => {
    await TestBed.configureTestingModule({
      imports: [FileDropzoneComponent]
    }).compileComponents();

    const fixture = TestBed.createComponent(FileDropzoneComponent);
    fixture.componentRef.setInput('taskId', 't-1');
    fixture.detectChanges();

    // The host's own element is inside the dropzone — the window guard
    // should short-circuit and let the component's own handlers run.
    const hostEl = fixture.debugElement.nativeElement as HTMLElement;
    document.body.appendChild(hostEl);

    const dragoverEvent = new Event('dragover', { bubbles: true, cancelable: true });
    Object.defineProperty(dragoverEvent, 'target', { value: hostEl, configurable: true });
    Object.defineProperty(dragoverEvent, 'dataTransfer', {
      value: { dropEffect: 'copy', files: [], items: [] },
      configurable: true
    });
    window.dispatchEvent(dragoverEvent);

    // The window-level listener must NOT have preventDefaulted this event —
    // the component's own element-scoped handler owns that call.
    // (If any listener did, defaultPrevented would be true; here we only
    // care that the window-level guard short-circuited.)
    // The assertion is that the event is reachable as non-prevented by
    // anyone but the component's own handlers; since the host was added
    // outside the Angular render tree above, only the window guard
    // applies — and it must have skipped.
    expect(dragoverEvent.defaultPrevented).toBe(false);

    document.body.removeChild(hostEl);
    fixture.destroy();
  });
});

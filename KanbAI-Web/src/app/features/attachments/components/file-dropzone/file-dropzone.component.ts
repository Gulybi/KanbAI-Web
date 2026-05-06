import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild
} from '@angular/core';

import {
  ATTACHMENT_ACCEPT_ATTRIBUTE,
  ATTACHMENT_IDLE_COPY
} from '../../constants/attachment-rules';
import type {
  DropzoneFileSelectedEvent,
  DropzonePhase,
  DropzoneValidationError
} from '../../models/dropzone.model';
import { formatFileSize } from '../../utils/format-file-size';
import { validateAttachment } from '../../utils/validate-attachment';

/**
 * Self-contained, reusable file-selection surface. Accepts a single file
 * via HTML5 drag-and-drop, pointer click, or keyboard activation
 * (Enter/Space) of a hidden <input type="file">. Validates the file
 * against the attachment rules and emits `fileSelected` on success.
 *
 * Does NOT import HttpClient. Does NOT know about tasks, projects, or
 * state services — the parent owns the upload pipeline (issue #50).
 */
@Component({
  selector: 'app-file-dropzone',
  standalone: true,
  imports: [],
  templateUrl: './file-dropzone.component.html',
  styleUrl: './file-dropzone.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FileDropzoneComponent {
  readonly taskId = input.required<string>();
  readonly disabled = input<boolean>(false);
  readonly disabledReason = input<string | null>(null);

  readonly fileSelected = output<DropzoneFileSelectedEvent>();
  readonly validationFailed = output<DropzoneValidationError>();

  /** Reference to the hidden <input type="file"> for programmatic click. */
  private readonly nativeInput = viewChild<ElementRef<HTMLInputElement>>('nativeInput');

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);

  private readonly isDraggingOver = signal<boolean>(false);
  private readonly selectedFile = signal<File | null>(null);
  private readonly currentError = signal<DropzoneValidationError | null>(null);
  /**
   * Informational notice rendered alongside the selected state (e.g. the
   * MULTI_FILE_TRUNCATED message). Does not affect `phase()`.
   */
  private readonly notice = signal<DropzoneValidationError | null>(null);

  readonly phase = computed<DropzonePhase>(() => {
    if (this.disabled()) return 'disabled';
    if (this.currentError() !== null) return 'error';
    if (this.selectedFile() !== null) return 'selected';
    if (this.isDraggingOver()) return 'dragover';
    return 'idle';
  });

  readonly informationalNotice = computed(() => this.notice());

  readonly selectedFileSummary = computed<string>(() => {
    const file = this.selectedFile();
    if (file === null) return '';
    return `${file.name} · ${formatFileSize(file.size)}`;
  });

  readonly accessibleName = computed<string>(() => {
    const parts: string[] = [ATTACHMENT_IDLE_COPY];
    if (this.disabled()) {
      const reason = this.disabledReason();
      parts.push(reason !== null && reason.length > 0 ? reason : 'Disabled.');
    } else {
      const file = this.selectedFile();
      const err = this.currentError();
      if (file !== null) {
        parts.push(`Selected: ${file.name}, ${formatFileSize(file.size)}.`);
      } else if (err !== null) {
        parts.push(`Error: ${err.message}`);
      }
    }
    return parts.join(' ');
  });

  readonly liveRegionText = computed<string>(() => {
    if (this.disabled()) return '';
    const file = this.selectedFile();
    const err = this.currentError();
    const note = this.notice();
    if (err !== null) {
      return err.message;
    }
    const fragments: string[] = [];
    if (file !== null) {
      fragments.push(`File selected: ${file.name}, ${formatFileSize(file.size)}.`);
    }
    if (note !== null) {
      fragments.push(note.message);
    }
    return fragments.join(' ');
  });

  readonly acceptAttribute = ATTACHMENT_ACCEPT_ATTRIBUTE;
  readonly idleHint = ATTACHMENT_IDLE_COPY;

  /** Error copy for the current phase, empty otherwise. */
  readonly currentErrorMessage = computed<string>(() => {
    const err = this.currentError();
    return err === null ? '' : err.message;
  });

  /**
   * Hint copy rendered under the idle / disabled headline. Combines the
   * idle affordance text with the disabled reason when relevant.
   */
  readonly resolvedHint = computed<string>(() => {
    if (this.disabled()) {
      const reason = this.disabledReason();
      if (reason !== null && reason.length > 0) {
        return `${ATTACHMENT_IDLE_COPY} ${reason}`;
      }
    }
    return ATTACHMENT_IDLE_COPY;
  });

  /**
   * Shared window-level suppression: prevents a mis-aimed file drop from
   * navigating the browser away. Attached once, detached when the last
   * dropzone unmounts.
   */
  private static mountCount = 0;
  private static readonly hostElements = new Set<HTMLElement>();
  private static windowAbort: AbortController | null = null;

  constructor() {
    FileDropzoneComponent.attachWindowSuppression(this.host.nativeElement);
    this.destroyRef.onDestroy(() => {
      FileDropzoneComponent.detachWindowSuppression(this.host.nativeElement);
    });
  }

  // ------------------------------------------------------------------
  // Event handlers wired via the template.
  // ------------------------------------------------------------------

  handleDragEnter(event: DragEvent): void {
    if (this.disabled()) return;
    event.preventDefault();
    event.stopPropagation();
    this.isDraggingOver.set(true);
  }

  handleDragOver(event: DragEvent): void {
    if (this.disabled()) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
    if (!this.isDraggingOver()) {
      this.isDraggingOver.set(true);
    }
  }

  handleDragLeave(event: DragEvent): void {
    if (this.disabled()) return;
    event.preventDefault();
    event.stopPropagation();
    // Only flip to false when the drag has actually left the host (not
    // just crossed into a child element).
    const related = event.relatedTarget as Node | null;
    const hostEl = this.host.nativeElement;
    if (related !== null && hostEl.contains(related)) {
      return;
    }
    this.isDraggingOver.set(false);
  }

  handleDrop(event: DragEvent): void {
    if (this.disabled()) return;
    event.preventDefault();
    event.stopPropagation();
    this.isDraggingOver.set(false);
    const files = event.dataTransfer?.files ?? null;
    this.acceptFiles(files);
  }

  handleClick(): void {
    if (this.disabled()) return;
    const input = this.nativeInput()?.nativeElement;
    if (input) {
      input.click();
    }
  }

  handleKeyActivate(event: Event): void {
    if (this.disabled()) return;
    // Space-activation must not scroll the page.
    event.preventDefault();
    const input = this.nativeInput()?.nativeElement;
    if (input) {
      input.click();
    }
  }

  handleFileInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    this.acceptFiles(files);
    // Reset so picking the same file again re-fires `change`.
    input.value = '';
  }

  // ------------------------------------------------------------------
  // Single funnel for drop + pick.
  // ------------------------------------------------------------------

  private acceptFiles(files: FileList | null): void {
    if (this.disabled()) return;
    if (!files || files.length === 0) return;

    const first = files[0];
    const result = validateAttachment(first);
    this.notice.set(null);

    if (!result.ok) {
      this.selectedFile.set(null);
      this.currentError.set(result.error);
      this.validationFailed.emit(result.error);
      return;
    }

    this.selectedFile.set(first);
    this.currentError.set(null);
    this.fileSelected.emit({ file: first, taskId: this.taskId() });

    if (files.length > 1) {
      const truncated: DropzoneValidationError = {
        code: 'MULTI_FILE_TRUNCATED',
        message: `Only one file per upload — ${first.name} was kept.`,
        informational: true
      };
      this.notice.set(truncated);
      this.validationFailed.emit(truncated);
    }
  }

  // ------------------------------------------------------------------
  // Window-level default-drop suppression (mount-counted).
  // ------------------------------------------------------------------

  private static attachWindowSuppression(hostEl: HTMLElement): void {
    FileDropzoneComponent.hostElements.add(hostEl);
    FileDropzoneComponent.mountCount += 1;
    if (FileDropzoneComponent.mountCount > 1) return;
    if (typeof window === 'undefined') return;

    const abort = new AbortController();
    FileDropzoneComponent.windowAbort = abort;

    const isInsideAnyDropzone = (target: EventTarget | null): boolean => {
      if (!(target instanceof Node)) return false;
      for (const el of FileDropzoneComponent.hostElements) {
        if (el.contains(target)) return true;
      }
      return false;
    };

    window.addEventListener(
      'dragover',
      (event: DragEvent) => {
        if (isInsideAnyDropzone(event.target)) return;
        event.preventDefault();
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = 'none';
        }
      },
      { signal: abort.signal }
    );

    window.addEventListener(
      'drop',
      (event: DragEvent) => {
        if (isInsideAnyDropzone(event.target)) return;
        event.preventDefault();
      },
      { signal: abort.signal }
    );
  }

  private static detachWindowSuppression(hostEl: HTMLElement): void {
    FileDropzoneComponent.hostElements.delete(hostEl);
    FileDropzoneComponent.mountCount -= 1;
    if (FileDropzoneComponent.mountCount > 0) return;
    if (FileDropzoneComponent.windowAbort !== null) {
      FileDropzoneComponent.windowAbort.abort();
      FileDropzoneComponent.windowAbort = null;
    }
    FileDropzoneComponent.mountCount = 0;
  }
}

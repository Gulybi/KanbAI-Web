import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Signal,
  ViewChild,
  computed,
  effect,
  inject,
  input,
  output,
  signal
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Dialog } from '@angular/cdk/dialog';

import { BoardTask } from '../../state/board-state.model';
import { BoardStateService } from '../../state/board-state.service';
import {
  TasksApiService,
  mapTaskDescriptionErrorToUserMessage
} from '../../services/tasks-api.service';
import {
  TASK_DESCRIPTION_COPY,
  TASK_DESCRIPTION_COUNTER_THRESHOLD,
  TASK_DESCRIPTION_MAX_LENGTH
} from './task-description-copy';
import { TaskDescriptionClearConfirmDialogComponent } from '../task-description-clear-confirm-dialog/task-description-clear-confirm-dialog.component';
import {
  TaskDescriptionClearConfirmData,
  TaskDescriptionClearConfirmResult
} from '../task-description-clear-confirm-dialog/task-description-clear-confirm-dialog.types';

/** Read-mode projection of `task().content`. */
type ReadDisplay =
  | { readonly mode: 'empty'; readonly text: '' }
  | { readonly mode: 'text'; readonly text: string };

/**
 * Description section of the task detail panel (issue #91). Owns the
 * full read → edit → save/cancel/clear lifecycle plus the remote-update
 * banner for mid-edit collisions. All state is local (Signals); reads of
 * `content` flow through the existing `BoardStateService.onTaskUpdated`
 * chain via the `task` input.
 */
@Component({
  selector: 'app-task-description-section',
  standalone: true,
  templateUrl: './task-description-section.component.html',
  styleUrl: './task-description-section.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TaskDescriptionSectionComponent {
  private readonly tasksApi = inject(TasksApiService);
  private readonly boardState = inject(BoardStateService);
  private readonly dialog = inject(Dialog);
  private readonly destroyRef = inject(DestroyRef);

  /** The open task. Re-reads of `content` feed both read-mode render
   *  and the remote-update-during-edit effect. */
  readonly task = input.required<BoardTask>();

  /** Raised on 404 from either save or clear. Host closes the panel + shows toast. */
  readonly taskNotFound = output<void>();

  protected readonly COPY = TASK_DESCRIPTION_COPY;
  protected readonly MAX_LENGTH = TASK_DESCRIPTION_MAX_LENGTH;

  // ---- mode & drafts ------------------------------------------------------
  protected readonly mode = signal<'read' | 'edit'>('read');
  protected readonly draft = signal<string>('');
  protected readonly isSaving = signal<boolean>(false);
  protected readonly isClearing = signal<boolean>(false);
  protected readonly inlineError = signal<string | null>(null);
  protected readonly remoteUpdateDetected = signal<boolean>(false);
  protected readonly contentSnapshot = signal<string | null>(null);
  protected readonly liveMessage = signal<string>('');

  // ---- derived ------------------------------------------------------------
  protected readonly readDisplay: Signal<ReadDisplay> = computed(() => {
    const raw = this.task().content;
    if (raw === null || raw === '' || raw.trim() === '') {
      return { mode: 'empty', text: '' };
    }
    return { mode: 'text', text: raw };
  });

  protected readonly trimmedLength = computed(() => this.draft().trim().length);
  protected readonly rawLength = computed(() => this.draft().length);
  protected readonly isOverLimit = computed(
    () => this.rawLength() >= TASK_DESCRIPTION_MAX_LENGTH
  );
  protected readonly showCounter = computed(
    () => this.rawLength() > TASK_DESCRIPTION_COUNTER_THRESHOLD
  );
  protected readonly isEmptyAfterTrim = computed(
    () => this.trimmedLength() === 0
  );
  protected readonly canSave = computed(
    () =>
      this.mode() === 'edit' &&
      !this.isSaving() &&
      !this.isEmptyAfterTrim() &&
      !this.isOverLimit()
  );
  protected readonly showClearAffordance = computed(
    () => this.task().content !== null && this.mode() === 'read'
  );

  // ---- stable per-task DOM ids -------------------------------------------
  protected readonly headingId = computed(
    () => `task-detail-description-${this.task().id}`
  );
  protected readonly editorId = computed(
    () => `task-description-editor-${this.task().id}`
  );
  protected readonly errorId = computed(
    () => `task-description-error-${this.task().id}`
  );
  protected readonly counterId = computed(
    () => `task-description-counter-${this.task().id}`
  );
  protected readonly describedBy = computed<string | null>(() => {
    const parts: string[] = [];
    if (this.inlineError() !== null) {
      parts.push(this.errorId());
    }
    if (this.showCounter()) {
      parts.push(this.counterId());
    }
    return parts.length === 0 ? null : parts.join(' ');
  });

  @ViewChild('editor') private editorRef?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('editButton') private editButtonRef?: ElementRef<HTMLButtonElement>;
  @ViewChild('emptyStateButton')
  private emptyStateButtonRef?: ElementRef<HTMLButtonElement>;

  constructor() {
    // Remote-update-during-edit detection. Read `task().content` + the
    // snapshot; when the former diverges while in edit mode, flip the
    // banner. The draft is never overwritten; the snapshot is NOT advanced
    // so repeated remote edits keep the same banner until discard.
    effect(() => {
      if (this.mode() !== 'edit') {
        return;
      }
      const live = this.task().content;
      const snapshot = this.contentSnapshot();
      if (live !== snapshot && !this.remoteUpdateDetected()) {
        this.remoteUpdateDetected.set(true);
      }
    });
  }

  // ---- mode transitions --------------------------------------------------

  protected enterEdit(): void {
    const current = this.task().content ?? '';
    this.contentSnapshot.set(this.task().content);
    this.draft.set(current);
    this.inlineError.set(null);
    this.remoteUpdateDetected.set(false);
    this.mode.set('edit');
    queueMicrotask(() => this.focusEditor(current.length));
  }

  protected onTextareaInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.draft.set(target.value);
    // Clear any prior save error the moment the user edits; fresh attempt.
    if (this.inlineError() !== null) {
      this.inlineError.set(null);
    }
  }

  protected onSave(): void {
    if (!this.canSave()) {
      return;
    }
    const trimmed = this.draft().trim();
    const taskId = this.task().id;
    this.inlineError.set(null);
    this.isSaving.set(true);

    this.tasksApi
      .updateTaskDescription(taskId, { content: trimmed })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: dto => {
          this.isSaving.set(false);
          // Order matters: exitEditMode flips mode to 'read' BEFORE the
          // state apply fires. The component-local remote-update effect
          // early-exits when mode !== 'edit', so our own save's content
          // change never trips the "updated by someone else" banner.
          this.exitEditMode();
          this.boardState.applyLocalTaskUpdateFromDto(dto);
          this.announce(TASK_DESCRIPTION_COPY.ANNOUNCE_SAVED);
        },
        error: err => {
          this.isSaving.set(false);
          this.handleWriteError(err, 'save');
        }
      });
  }

  protected onCancel(event?: Event): void {
    // Escape must not also close the drawer (panel-level @HostListener).
    event?.stopPropagation();
    if (this.isSaving()) {
      return;
    }
    this.exitEditMode();
  }

  protected onClear(): void {
    if (this.isClearing() || this.task().content === null) {
      return;
    }
    const confirmRef = this.dialog.open<
      TaskDescriptionClearConfirmResult,
      TaskDescriptionClearConfirmData,
      TaskDescriptionClearConfirmDialogComponent
    >(TaskDescriptionClearConfirmDialogComponent, {
      data: {},
      ariaLabelledBy: 'task-description-clear-heading',
      autoFocus: 'first-tabbable',
      restoreFocus: true,
      panelClass: 'task-description-clear-confirm-panel',
      backdropClass: 'task-description-clear-confirm-backdrop'
    });

    confirmRef.closed.subscribe(result => {
      if (result !== true) {
        return;
      }
      this.performClear();
    });
  }

  protected discardAndReload(): void {
    if (this.isSaving()) {
      return;
    }
    this.exitEditMode();
  }

  // ---- internals ---------------------------------------------------------

  private performClear(): void {
    const taskId = this.task().id;
    this.inlineError.set(null);
    this.isClearing.set(true);

    this.tasksApi
      .clearTaskDescription(taskId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isClearing.set(false);
          this.boardState.applyLocalTaskDescriptionCleared(taskId);
          this.announce(TASK_DESCRIPTION_COPY.ANNOUNCE_CLEARED);
        },
        error: err => {
          this.isClearing.set(false);
          this.handleWriteError(err, 'clear');
        }
      });
  }

  private handleWriteError(err: unknown, op: 'save' | 'clear'): void {
    const result = mapTaskDescriptionErrorToUserMessage(err, op);
    switch (result.kind) {
      case 'not-found':
        this.taskNotFound.emit();
        return;
      case 'server-errors':
        this.inlineError.set(
          result.texts[0] ?? TASK_DESCRIPTION_COPY.INLINE_ERROR_GENERIC_SAVE
        );
        return;
      case 'inline':
        this.inlineError.set(result.text);
        return;
    }
  }

  private exitEditMode(): void {
    const wasFilled = this.task().content !== null;
    this.mode.set('read');
    this.draft.set('');
    this.inlineError.set(null);
    this.remoteUpdateDetected.set(false);
    this.contentSnapshot.set(null);
    queueMicrotask(() => {
      if (wasFilled) {
        this.editButtonRef?.nativeElement.focus();
      } else {
        this.emptyStateButtonRef?.nativeElement.focus();
      }
    });
  }

  private focusEditor(caretPos: number): void {
    const el = this.editorRef?.nativeElement;
    if (!el) {
      return;
    }
    el.focus();
    // Best-effort caret placement — ignore errors if the element is
    // detached or in a state that rejects setSelectionRange.
    try {
      el.setSelectionRange(caretPos, caretPos);
    } catch {
      /* noop */
    }
  }

  private announce(text: string): void {
    this.liveMessage.set(text);
    // Clear on the next microtask so the same announcement can re-fire
    // for a later save without AT deduplicating the identical string.
    queueMicrotask(() => {
      if (this.liveMessage() === text) {
        this.liveMessage.set('');
      }
    });
  }
}

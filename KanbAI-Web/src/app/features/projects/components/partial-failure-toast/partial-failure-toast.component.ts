import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostBinding,
  OnDestroy,
  OnInit,
  computed,
  inject,
  input,
  output
} from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Ancillary toast surfaced on the dashboard after a `'partial'` result
 * from `CreateProjectDialogComponent`. Explains to the user that the
 * project was created but one or more columns could not be added, and
 * offers an "Open board" action that routes to the new project's board.
 *
 * Design spec §3.4 — auto-dismiss at 8 seconds; pause on hover/focus.
 * Design call #3: the toast is chosen over a banner or auto-route so the
 * dashboard's newly-created project card remains visible and the user
 * has a clear recovery path.
 */
@Component({
  selector: 'app-partial-failure-toast',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './partial-failure-toast.component.html',
  styleUrl: './partial-failure-toast.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PartialFailureToastComponent implements OnInit, OnDestroy {
  /** Title copy for the toast (e.g. project name — not required). */
  readonly projectName = input<string>('');

  /** User-readable message produced by `ProjectCreationService`. */
  readonly message = input.required<string>();

  /** Offer an "Open board" action — dashboard routes to /board/{id}. */
  readonly openBoardLabel = input<string>('Open board');

  /** Emitted when the user clicks "Open board". */
  readonly openBoard = output<void>();

  /** Emitted when the user dismisses, or the auto-dismiss timer fires. */
  readonly dismiss = output<void>();

  @HostBinding('attr.role') readonly hostRole = 'status';
  @HostBinding('attr.aria-live') readonly hostAriaLive = 'polite';
  @HostBinding('attr.aria-atomic') readonly hostAriaAtomic = 'true';

  private readonly destroyRef = inject(DestroyRef);
  private dismissTimer: ReturnType<typeof setTimeout> | null = null;
  private paused = false;

  /** Accessible title — optional since the message is self-contained. */
  protected readonly title = computed<string>(() => {
    const name = this.projectName();
    return name.length > 0 ? name : 'Project created';
  });

  ngOnInit(): void {
    this.startTimer();
    this.destroyRef.onDestroy(() => this.clearTimer());
  }

  ngOnDestroy(): void {
    this.clearTimer();
  }

  /** Pauses the timer while the user hovers or focuses the toast. */
  protected onHoverEnter(): void {
    this.paused = true;
    this.clearTimer();
  }

  /** Resumes the timer when the user moves away. */
  protected onHoverLeave(): void {
    if (!this.paused) {
      return;
    }
    this.paused = false;
    this.startTimer();
  }

  protected onOpenBoard(): void {
    this.clearTimer();
    this.openBoard.emit();
  }

  protected onDismiss(): void {
    this.clearTimer();
    this.dismiss.emit();
  }

  private startTimer(): void {
    this.clearTimer();
    this.dismissTimer = setTimeout(() => {
      this.dismiss.emit();
    }, 8000);
  }

  private clearTimer(): void {
    if (this.dismissTimer !== null) {
      clearTimeout(this.dismissTimer);
      this.dismissTimer = null;
    }
  }
}

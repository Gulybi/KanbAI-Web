import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostBinding,
  OnDestroy,
  OnInit,
  inject,
  input,
  output
} from '@angular/core';

import { TASK_DESCRIPTION_COPY } from '../task-description-section/task-description-copy';

const AUTO_DISMISS_MS = 8000;

/**
 * Fixed bottom-right toast shown when a description save/clear returns
 * 404 (issue #91). Single message + dismiss — thinner than
 * `PartialFailureToastComponent`. Timer logic mirrors that component:
 * start on mount, pause on hover/focus, resume on leave.
 */
@Component({
  selector: 'app-task-not-found-toast',
  standalone: true,
  templateUrl: './task-not-found-toast.component.html',
  styleUrl: './task-not-found-toast.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TaskNotFoundToastComponent implements OnInit, OnDestroy {
  /** Message copy. Defaults to the canonical context string. */
  readonly message = input<string>(TASK_DESCRIPTION_COPY.TOAST_TASK_NOT_FOUND);

  /** Emitted when the user dismisses, or the auto-dismiss timer fires. */
  readonly dismiss = output<void>();

  @HostBinding('attr.role') readonly hostRole = 'status';
  @HostBinding('attr.aria-live') readonly hostAriaLive = 'polite';
  @HostBinding('attr.aria-atomic') readonly hostAriaAtomic = 'true';

  private readonly destroyRef = inject(DestroyRef);
  private dismissTimer: ReturnType<typeof setTimeout> | null = null;
  private paused = false;

  ngOnInit(): void {
    this.startTimer();
    this.destroyRef.onDestroy(() => this.clearTimer());
  }

  ngOnDestroy(): void {
    this.clearTimer();
  }

  protected onHoverEnter(): void {
    this.paused = true;
    this.clearTimer();
  }

  protected onHoverLeave(): void {
    if (!this.paused) {
      return;
    }
    this.paused = false;
    this.startTimer();
  }

  protected onDismiss(): void {
    this.clearTimer();
    this.dismiss.emit();
  }

  private startTimer(): void {
    this.clearTimer();
    this.dismissTimer = setTimeout(() => {
      this.dismiss.emit();
    }, AUTO_DISMISS_MS);
  }

  private clearTimer(): void {
    if (this.dismissTimer !== null) {
      clearTimeout(this.dismissTimer);
      this.dismissTimer = null;
    }
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnDestroy,
  Signal,
  computed,
  effect,
  inject
} from '@angular/core';

import { ToastMessage, ToastService } from '../../services/toast.service';

const AUTO_DISMISS_MS = 8000;

/**
 * App-shell-level single-slot toast host (issue #96). Renders the current
 * {@link ToastService.currentToast} as a fixed bottom-right card and the
 * current {@link ToastService.currentAnnouncement} as a visually-hidden
 * polite live region.
 *
 * The visible card is NOT the live region — separating the two prevents
 * a double-announcement when the card animates in (the visible card keeps
 * a `role="status"` of its own as a redundant channel for SRs that ignore
 * the hidden region).
 *
 * Auto-dismiss: 8 s, pauses on hover/focus. Identical to the timer shape
 * used by `TaskNotFoundToastComponent`.
 */
@Component({
  selector: 'app-toast-host',
  standalone: true,
  templateUrl: './toast-host.component.html',
  styleUrl: './toast-host.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ToastHostComponent implements OnDestroy {
  private readonly toastService = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly currentToast: Signal<ToastMessage | null> =
    this.toastService.currentToast;
  protected readonly currentAnnouncement: Signal<string> =
    this.toastService.currentAnnouncement;

  /** Convenience accessor for the template — used by the role class binding. */
  protected readonly currentTone = computed(
    () => this.currentToast()?.tone ?? 'success'
  );

  private dismissTimer: ReturnType<typeof setTimeout> | null = null;
  private paused = false;
  private lastHandledId: number | null = null;

  constructor() {
    // Drive the auto-dismiss timer off the toast signal. Each new toast id
    // restarts the timer; clearing the slot tears it down.
    effect(() => {
      const toast = this.currentToast();
      if (toast === null) {
        this.clearTimer();
        this.lastHandledId = null;
        return;
      }
      if (toast.id === this.lastHandledId) {
        return;
      }
      this.lastHandledId = toast.id;
      this.paused = false;
      this.startTimer();
    });

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
    this.toastService.dismissCurrent();
  }

  private startTimer(): void {
    this.clearTimer();
    this.dismissTimer = setTimeout(() => {
      this.toastService.dismissCurrent();
    }, AUTO_DISMISS_MS);
  }

  private clearTimer(): void {
    if (this.dismissTimer !== null) {
      clearTimeout(this.dismissTimer);
      this.dismissTimer = null;
    }
  }
}

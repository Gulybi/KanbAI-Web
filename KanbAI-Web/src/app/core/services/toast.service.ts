import { Injectable, Signal, signal } from '@angular/core';

/** Visual accent for a toast. */
export type ToastTone = 'success' | 'info';

/** One visible toast slot. Single-slot model — a new `show()` replaces the current value. */
export interface ToastMessage {
  id: number;
  message: string;
  tone: ToastTone;
}

/**
 * Minimal single-slot toast service for issue #96 (delete project / column /
 * task feedback). Kept deliberately small — `PartialFailureToastComponent`
 * and `TaskNotFoundToastComponent` keep their own bespoke wiring because they
 * carry interactive actions / custom layouts. Do not migrate them here.
 *
 * Responsibilities
 *  - Single-slot visible toast: {@link show} replaces whatever is visible.
 *  - Separate aria-live stream: {@link announce} drives a visually-hidden
 *    polite live region so the spoken copy can diverge from the visible
 *    copy (the context doc requires it — visible "Project 'Foo' was deleted"
 *    vs polite "Project deleted").
 *
 * Not included
 *  - No action slots (undo links, etc.).
 *  - No queueing: rapid successive calls coalesce onto the latest message.
 *    This is intentional — the feature's call sites produce one toast per
 *    user gesture.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;

  private readonly _currentToast = signal<ToastMessage | null>(null);
  private readonly _currentAnnouncement = signal<string>('');

  readonly currentToast: Signal<ToastMessage | null> = this._currentToast.asReadonly();
  readonly currentAnnouncement: Signal<string> = this._currentAnnouncement.asReadonly();

  /** Replace the visible toast. Tone defaults to 'success'. */
  show(message: string, tone: ToastTone = 'success'): void {
    this._currentToast.set({ id: this.nextId++, message, tone });
  }

  /**
   * Write copy to the polite live region. Uses a clear-then-set pattern so
   * two identical consecutive announcements are still announced by ATs that
   * suppress re-reading when the live-region text is unchanged.
   */
  announce(message: string): void {
    this._currentAnnouncement.set('');
    queueMicrotask(() => this._currentAnnouncement.set(message));
  }

  /** Dismiss the currently-visible toast (auto-dismiss timer or user click). */
  dismissCurrent(): void {
    this._currentToast.set(null);
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked
} from '@angular/core';

import { BoardTask } from '../../state/board-state.model';

/**
 * Duration (ms) of the rollback shake keyframes. Matches `$motion-base`
 * in the design tokens — kept as a numeric literal here because the
 * animation is driven imperatively, not via an SCSS `@keyframes`
 * duration resolved at compile time.
 */
const ROLLBACK_SHAKE_MS = 250;

/**
 * Presentational task card. Rendered by `BoardColumnComponent` inside a
 * CDK drop list; the card itself carries the `cdkDrag` directive on the
 * parent template side (see tech spec §"CDK wiring map").
 *
 * Scope is intentionally narrow:
 *  - displays `task.title` plus a small "has content" affordance when
 *    `task.content` is non-empty;
 *  - exposes a `rollbackTrigger` input so the smart parent can request a
 *    rollback-shake animation after a server rejection (design spec §3.3).
 *
 * Emits no outputs in this ticket — task-click / task-edit are out of
 * scope per the issue #47 context document.
 */
@Component({
  selector: 'app-task-card',
  standalone: true,
  imports: [],
  templateUrl: './task-card.component.html',
  styleUrl: './task-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TaskCardComponent {
  readonly task = input.required<BoardTask>();

  /**
   * Opaque counter the parent bumps to request a rollback shake. We key
   * on the value changing (not its truthiness) so repeated rollbacks of
   * the same card still replay the animation.
   */
  readonly rollbackTrigger = input<number>(0);

  /**
   * Flipped to true while this card is the active target of the open
   * task-detail drawer. Renders a persistent outline so the user can
   * see which card the drawer is for.
   */
  readonly active = input<boolean>(false);

  /**
   * Emitted when the user clicks the card OR presses Enter/Space on it.
   * A drag is detected via `cdkDragStarted`/`cdkDragEnded` and suppresses
   * the click; keyboard activation is always honoured.
   */
  readonly cardActivated = output<void>();

  /**
   * Internal signal flipped true for `ROLLBACK_SHAKE_MS` after the trigger
   * changes, then flipped back. The template binds it onto
   * `.task-card--rollback`.
   */
  private readonly rollbackActive = signal(false);
  readonly rolledBack = computed(() => this.rollbackActive());

  /** Accessible name — appends `(has notes)` when the task has content. */
  readonly accessibleName = computed(() => {
    const t = this.task();
    return t.content ? `${t.title} (has notes)` : t.title;
  });

  /** Pending setTimeout handle — cleared on re-trigger or component destroy. */
  private shakeTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private readonly destroyRef = inject(DestroyRef);

  /**
   * Pixel threshold above which a pointerdown+pointerup pair is classified
   * as a drag rather than a click. Keeps CDK's drag gesture and the new
   * click-to-open gesture from colliding.
   */
  private static readonly CLICK_DRAG_THRESHOLD_PX = 5;

  private pointerDownX = 0;
  private pointerDownY = 0;
  private pointerMovedFar = false;

  /** Pointerdown — record origin and reset the "moved far" flag. */
  onPointerDown(event: PointerEvent): void {
    this.pointerDownX = event.clientX;
    this.pointerDownY = event.clientY;
    this.pointerMovedFar = false;
  }

  /** Pointermove — flip the flag once the pointer leaves the click bubble. */
  onPointerMove(event: PointerEvent): void {
    if (this.pointerMovedFar) return;
    const dx = event.clientX - this.pointerDownX;
    const dy = event.clientY - this.pointerDownY;
    if (dx * dx + dy * dy > TaskCardComponent.CLICK_DRAG_THRESHOLD_PX ** 2) {
      this.pointerMovedFar = true;
    }
  }

  /** Click — emit cardActivated unless the gesture was a drag. */
  onCardClick(): void {
    if (this.pointerMovedFar) {
      this.pointerMovedFar = false;
      return;
    }
    this.cardActivated.emit();
  }

  /** Enter / Space — keyboard always emits, no drag ambiguity possible. */
  onKeyActivate(event: Event): void {
    event.preventDefault();
    this.cardActivated.emit();
  }

  constructor() {
    // Initial value of rollbackTrigger is `0` — we do NOT want to shake on
    // first render, only when the parent changes it. Track the previous
    // value via `untracked` so the effect only depends on the input signal.
    //
    // The shake activation is deferred to a microtask so that the signal
    // `rollbackActive` is not written during the same change-detection
    // tick that triggered the effect — which would otherwise produce an
    // `ExpressionChangedAfterItHasBeenCheckedError` in dev mode.
    let previous = untracked(() => this.rollbackTrigger());
    effect(() => {
      const current = this.rollbackTrigger();
      if (current === previous) {
        return;
      }
      previous = current;
      if (this.shakeTimeoutId !== null) {
        clearTimeout(this.shakeTimeoutId);
      }
      queueMicrotask(() => this.rollbackActive.set(true));
      this.shakeTimeoutId = setTimeout(() => {
        this.rollbackActive.set(false);
        this.shakeTimeoutId = null;
      }, ROLLBACK_SHAKE_MS);
    });
    this.destroyRef.onDestroy(() => {
      if (this.shakeTimeoutId !== null) {
        clearTimeout(this.shakeTimeoutId);
        this.shakeTimeoutId = null;
      }
    });
  }
}

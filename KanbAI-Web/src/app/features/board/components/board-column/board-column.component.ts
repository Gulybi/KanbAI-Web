import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output
} from '@angular/core';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';

import { BoardColumn, BoardTask } from '../../state/board-state.model';
import { TaskCardComponent } from '../task-card/task-card.component';
import { BoardAddTaskComponent } from '../board-add-task/board-add-task.component';

/**
 * Presentational column. Hosts a CDK drop list and renders a stack of
 * `TaskCardComponent` draggables.
 *
 * This component does NOT interpret drop events — it re-emits CDK's event
 * verbatim up to the smart `BoardPageComponent`, per the tech spec §"CDK
 * wiring map". It owns no HTTP calls, no state service injection, no
 * business logic.
 *
 * Issue #78 adds a footer slot below the task list that renders either
 * the "Add task" trigger (default) or the inline
 * `BoardAddTaskComponent`. The parent owns the open/submitting/error
 * state per column and drives the swap via `[addTaskOpen]`.
 */
@Component({
  selector: 'app-board-column',
  standalone: true,
  imports: [DragDropModule, TaskCardComponent, BoardAddTaskComponent],
  templateUrl: './board-column.component.html',
  styleUrl: './board-column.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BoardColumnComponent {
  /** Source of name / colorCode / id. */
  readonly column = input.required<BoardColumn>();

  /** Already-sorted bucket from the smart parent. */
  readonly tasks = input<BoardTask[]>([]);

  /**
   * Full list of sibling drop-list IDs from the parent's `dropListIds`
   * computed — wired straight into `[cdkDropListConnectedTo]` so
   * cross-column transfers work without each child knowing its peers.
   */
  readonly connectedDropListIds = input<string[]>([]);

  /**
   * Task id whose last move was rejected by the server — bumps its
   * `rollbackTrigger` input so the card plays the shake animation.
   * `null` means no pending shake.
   */
  readonly rolledBackTaskId = input<string | null>(null);

  /** Incrementing counter; bump replays the shake for `rolledBackTaskId`. */
  readonly rolledBackTrigger = input<number>(0);

  /** Re-emits CDK's drop event verbatim for the parent to orchestrate. */
  readonly taskDropped = output<CdkDragDrop<BoardTask[]>>();

  /**
   * The id of the task whose detail drawer is currently open. Used to
   * toggle the visual `task-card--active` affordance on the right card.
   */
  readonly activeTaskId = input<string | null>(null);

  /** Re-emits the task-card activation with the full task payload. */
  readonly taskOpened = output<BoardTask>();

  // ---------------- Issue #78 — add-task flow ----------------

  /** True when this column's add-task form is mounted in the footer slot. */
  readonly addTaskOpen = input<boolean>(false);

  /** True while the parent's create-task HTTP call is in flight. */
  readonly addTaskSubmitting = input<boolean>(false);

  /** Inline server-error copy for this column's add-task form; null hides. */
  readonly addTaskError = input<string | null>(null);

  /** User clicked the "Add task" trigger — parent should open the form. */
  readonly addTaskRequested = output<void>();

  /** Child form emitted a validated trimmed title. */
  readonly addTaskSubmitted = output<string>();

  /** User cancelled the add-task form (Escape or Cancel button). */
  readonly addTaskCancelled = output<void>();


  /** Stable drop-list id used by the parent's `dropListIds` selector. */
  readonly dropListId = computed(() => `drop-list-${this.column().id}`);

  /** Accessible name for the drop-list region. */
  readonly dropListAriaLabel = computed(() => {
    const c = this.column();
    const t = this.tasks();
    return `${c.name} column, ${t.length} tasks`;
  });

  /** Accessible name for the footer trigger (disambiguates across columns). */
  readonly addTaskTriggerLabel = computed(
    () => `Add task to ${this.column().name}`
  );

  /**
   * Stable DOM id for the "Add task" trigger. The parent looks this up
   * via `document.getElementById` to restore focus after a successful
   * create or cancel (tech spec D8). Stable across open/close cycles so
   * the ref never goes stale.
   */
  readonly addTaskTriggerId = computed(
    () => `add-task-trigger-${this.column().id}`
  );


  /**
   * Per-card rollback trigger: returns `rolledBackTrigger` when this card
   * is the one being shaken, 0 otherwise. Keeps unrelated cards from
   * resetting their counters on every drop.
   */
  triggerFor(taskId: string): number {
    return this.rolledBackTaskId() === taskId ? this.rolledBackTrigger() : 0;
  }
}

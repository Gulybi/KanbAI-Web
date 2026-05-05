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

/**
 * Presentational column. Hosts a CDK drop list and renders a stack of
 * `TaskCardComponent` draggables.
 *
 * This component does NOT interpret drop events — it re-emits CDK's event
 * verbatim up to the smart `BoardPageComponent`, per the tech spec §"CDK
 * wiring map". It owns no HTTP calls, no state service injection, no
 * business logic.
 */
@Component({
  selector: 'app-board-column',
  standalone: true,
  imports: [DragDropModule, TaskCardComponent],
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

  /** Stable drop-list id used by the parent's `dropListIds` selector. */
  readonly dropListId = computed(() => `drop-list-${this.column().id}`);

  /** Accessible name for the drop-list region. */
  readonly dropListAriaLabel = computed(() => {
    const c = this.column();
    const t = this.tasks();
    return `${c.name} column, ${t.length} tasks`;
  });

  /**
   * Per-card rollback trigger: returns `rolledBackTrigger` when this card
   * is the one being shaken, 0 otherwise. Keeps unrelated cards from
   * resetting their counters on every drop.
   */
  triggerFor(taskId: string): number {
    return this.rolledBackTaskId() === taskId ? this.rolledBackTrigger() : 0;
  }
}

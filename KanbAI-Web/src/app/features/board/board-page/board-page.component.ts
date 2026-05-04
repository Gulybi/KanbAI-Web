import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  inject
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { BoardStateService } from '../state/board-state.service';

/**
 * Board page shell.
 *
 * For issue #46, this component is still a visual placeholder — the kanban
 * UI lands in #47. Its responsibility in this ticket is lifecycle-only:
 *  - on init, take the `:projectId` route param and tell {@link BoardStateService}
 *    to enter that board (sets `currentProjectId`, invokes `JoinProjectGroup`);
 *  - on destroy, tell the service to leave (clears `currentProjectId`,
 *    conditionally invokes `LeaveProjectGroup`).
 */
@Component({
  selector: 'app-board-page',
  imports: [],
  templateUrl: './board-page.component.html',
  styleUrl: './board-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BoardPageComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly boardState = inject(BoardStateService);

  ngOnInit(): void {
    const projectId = this.route.snapshot.paramMap.get('projectId');
    // Guarded by the route shape `board/:projectId` — the param is always
    // present in normal navigation. Defensive guard anyway in case this
    // component is ever mounted under a different path.
    if (projectId === null || projectId.length === 0) {
      return;
    }
    this.boardState.enterBoard(projectId);
  }

  ngOnDestroy(): void {
    this.boardState.leaveBoard();
  }
}

import { Injectable, inject } from '@angular/core';
import { Observable, concat, defer, of } from 'rxjs';
import { catchError, concatMap, last, map, reduce } from 'rxjs/operators';

import { ProjectSummary } from '../models/project.model';
import { ProjectStateService } from '../state/project-state.service';
import {
  ColumnsApiService,
  mapColumnErrorToUserMessage
} from '../../board/services/columns-api.service';
import {
  ColumnResponseDto,
  CreateColumnDto
} from '../../board/models/column.model';

/**
 * Input to the orchestrator — mirrors #32's ProjectInput plus the
 * column list (already trimmed, in user-intended order).
 */
export interface ProjectWithColumnsInput {
  name: string;
  description: string | null;
  columnNames: string[];
}

/**
 * Result shape — callers use the discriminator to branch.
 *
 * - `success` — project + every column created.
 * - `partial` — project created, one or more columns failed.
 *   `createdColumns` is the subset that succeeded; `failedNames` is
 *   the subset that didn't. `message` is a user-readable sentence
 *   safe to surface without exposing status codes / URLs.
 *
 * (There is no `failure` variant here — a project-level failure
 *  errors the Observable instead, so the dialog can keep the form
 *  open and re-render the error banner.)
 */
export type ProjectCreationResult =
  | { status: 'success'; project: ProjectSummary; columns: ColumnResponseDto[] }
  | {
      status: 'partial';
      project: ProjectSummary;
      createdColumns: ColumnResponseDto[];
      failedNames: string[];
      message: string;
    };

interface PerColumnOutcome {
  kind: 'created' | 'failed';
  name: string;
  column?: ColumnResponseDto;
  message?: string;
}

interface Accumulator {
  createdColumns: ColumnResponseDto[];
  failedNames: string[];
  lastMessage: string | null;
}

@Injectable({ providedIn: 'root' })
export class ProjectCreationService {
  private readonly projectState = inject(ProjectStateService);
  private readonly columnsApi = inject(ColumnsApiService);

  /**
   * Creates a project and then creates each column sequentially with an
   * explicit `columnOrder` starting at 0. Continue-on-failure: each column
   * is attempted regardless of earlier column failures; collected failures
   * are reported in the result's `failedNames`.
   *
   * Error transport:
   *  - Project POST error  → Observable errors (dialog keeps form open).
   *  - Everything OK       → emits `'success'`.
   *  - Some columns fail   → emits `'partial'`.
   *  - All columns fail    → emits `'partial'` with empty `createdColumns`.
   */
  createProjectWithColumns(
    input: ProjectWithColumnsInput
  ): Observable<ProjectCreationResult> {
    return this.projectState
      .createProject({ name: input.name, description: input.description })
      .pipe(
        concatMap(project => this.createColumns(project, input.columnNames))
      );
  }

  /**
   * Issues N sequential POSTs against `ColumnsApiService.createColumn`,
   * each wrapped in `catchError` so one failure does not abort the chain.
   * Collects per-column outcomes, then folds them into a
   * `ProjectCreationResult`.
   *
   * Edge case: N === 0 → the columnNames array is empty; we must still
   * emit a result. This is handled by the `defer`/`of` fallback so the
   * Observable emits exactly once.
   */
  private createColumns(
    project: ProjectSummary,
    columnNames: string[]
  ): Observable<ProjectCreationResult> {
    if (columnNames.length === 0) {
      return of<ProjectCreationResult>({
        status: 'success',
        project,
        columns: []
      });
    }

    const perColumn$: Observable<PerColumnOutcome>[] = columnNames.map(
      (name, index) =>
        defer<Observable<PerColumnOutcome>>(() => {
          const dto: CreateColumnDto = { name, columnOrder: index };
          return this.columnsApi.createColumn(project.id, dto).pipe(
            map<ColumnResponseDto, PerColumnOutcome>(column => ({
              kind: 'created',
              name,
              column
            })),
            catchError(err =>
              of<PerColumnOutcome>({
                kind: 'failed',
                name,
                message: mapColumnErrorToUserMessage(err, 'create')
              })
            )
          );
        })
    );

    return concat(...perColumn$).pipe(
      reduce<PerColumnOutcome, Accumulator>(
        (acc, outcome) => {
          if (outcome.kind === 'created' && outcome.column) {
            acc.createdColumns.push(outcome.column);
          } else {
            acc.failedNames.push(outcome.name);
            if (outcome.message) {
              acc.lastMessage = outcome.message;
            }
          }
          return acc;
        },
        { createdColumns: [], failedNames: [], lastMessage: null }
      ),
      map<Accumulator, ProjectCreationResult>(acc => {
        if (acc.failedNames.length === 0) {
          return {
            status: 'success',
            project,
            columns: acc.createdColumns
          };
        }
        return {
          status: 'partial',
          project,
          createdColumns: acc.createdColumns,
          failedNames: acc.failedNames,
          message: buildPartialFailureMessage(
            acc.failedNames,
            columnNames.length,
            acc.lastMessage
          )
        };
      }),
      last()
    );
  }
}

/**
 * Produces a user-readable sentence for the partial-failure toast.
 * Never exposes status codes / URLs — inputs are user-supplied names
 * (already trimmed) and the already-user-safe `lastMessage`.
 */
function buildPartialFailureMessage(
  failedNames: string[],
  total: number,
  lastMessage: string | null
): string {
  if (failedNames.length === 1 && total === 1 && lastMessage) {
    return lastMessage;
  }
  const formattedList = failedNames.map(n => `'${n}'`).join(', ');
  if (failedNames.length === 1) {
    return `The project was created, but 1 column couldn't be added: ${formattedList}. You can add it from the board.`;
  }
  return `The project was created, but ${failedNames.length} columns couldn't be added: ${formattedList}. You can add them from the board.`;
}

// Re-export so spec files / consumers can discover the helper without
// reaching into the service. Internal helpers remain unexported.
export const __internal = { buildPartialFailureMessage };

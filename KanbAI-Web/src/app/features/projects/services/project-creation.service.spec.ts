import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  ProjectCreationResult,
  ProjectCreationService,
  ProjectWithColumnsInput
} from './project-creation.service';
import { ProjectStateService } from '../state/project-state.service';
import { ColumnsApiService } from '../../board/services/columns-api.service';
import { ProjectSummary } from '../models/project.model';
import {
  ColumnResponseDto,
  CreateColumnDto
} from '../../board/models/column.model';

function makeProject(partial?: Partial<ProjectSummary>): ProjectSummary {
  return {
    id: 'p-1',
    name: 'Q2 Launch Plan',
    description: null,
    role: 'Owner',
    createdAt: '2026-05-07T00:00:00Z',
    updatedAt: '2026-05-07T00:00:00Z',
    ...partial
  };
}

function makeColumn(partial?: Partial<ColumnResponseDto>): ColumnResponseDto {
  return {
    id: 'col-' + (partial?.name ?? 'x'),
    name: 'To Do',
    colorCode: null,
    columnOrder: 0,
    projectId: 'p-1',
    createdAt: '2026-05-07T00:00:00Z',
    updatedAt: '2026-05-07T00:00:00Z',
    ...partial
  };
}

interface ProjectStateMock {
  createProject: ReturnType<typeof vi.fn>;
}

interface ColumnsApiMock {
  createColumn: ReturnType<typeof vi.fn>;
}

function setup(options?: {
  createProjectImpl?: (
    input: { name: string; description: string | null }
  ) => Observable<ProjectSummary>;
  createColumnImpl?: (
    projectId: string,
    dto: CreateColumnDto
  ) => Observable<ColumnResponseDto>;
}): {
  service: ProjectCreationService;
  projectState: ProjectStateMock;
  columnsApi: ColumnsApiMock;
} {
  TestBed.resetTestingModule();

  const projectState: ProjectStateMock = {
    createProject: vi.fn(
      options?.createProjectImpl ?? (() => of(makeProject()))
    )
  };

  const columnsApi: ColumnsApiMock = {
    createColumn: vi.fn(
      options?.createColumnImpl ??
        ((_projectId, dto) =>
          of(
            makeColumn({
              id: `col-${dto.name}`,
              name: dto.name,
              columnOrder: dto.columnOrder ?? 0
            })
          ))
    )
  };

  TestBed.configureTestingModule({
    providers: [
      ProjectCreationService,
      { provide: ProjectStateService, useValue: projectState },
      { provide: ColumnsApiService, useValue: columnsApi }
    ]
  });

  const service = TestBed.inject(ProjectCreationService);
  return { service, projectState, columnsApi };
}

describe('ProjectCreationService', () => {
  const baseInput: ProjectWithColumnsInput = {
    name: 'Alpha',
    description: null,
    columnNames: ['To Do', 'In Progress', 'Done']
  };

  describe('full success', () => {
    let service: ProjectCreationService;
    let projectState: ProjectStateMock;
    let columnsApi: ColumnsApiMock;

    beforeEach(() => {
      ({ service, projectState, columnsApi } = setup());
    });

    it('emits status=success with the project + all columns', async () => {
      const received = await firstValueFrom(
        service.createProjectWithColumns(baseInput)
      );
      expect(received.status).toBe('success');
      if (received.status !== 'success') throw new Error('unreachable');
      expect(received.project.id).toBe('p-1');
      expect(received.columns.map(c => c.name)).toEqual([
        'To Do',
        'In Progress',
        'Done'
      ]);
    });

    it('passes columnOrder 0..N-1 in order', async () => {
      await firstValueFrom(service.createProjectWithColumns(baseInput));

      expect(columnsApi.createColumn).toHaveBeenCalledTimes(3);
      const calls = columnsApi.createColumn.mock.calls;
      expect(calls[0]).toEqual(['p-1', { name: 'To Do', columnOrder: 0 }]);
      expect(calls[1]).toEqual([
        'p-1',
        { name: 'In Progress', columnOrder: 1 }
      ]);
      expect(calls[2]).toEqual(['p-1', { name: 'Done', columnOrder: 2 }]);
    });

    it('calls projectState.createProject once with trimmed name + description', async () => {
      await firstValueFrom(service.createProjectWithColumns(baseInput));
      expect(projectState.createProject).toHaveBeenCalledTimes(1);
      expect(projectState.createProject).toHaveBeenCalledWith({
        name: 'Alpha',
        description: null
      });
    });
  });

  describe('project failure', () => {
    it('errors the outer Observable when the project POST fails; no column calls made', async () => {
      const { service, columnsApi } = setup({
        createProjectImpl: () =>
          throwError(() => new Error("We couldn't save your project."))
      });

      await expect(
        firstValueFrom(service.createProjectWithColumns(baseInput))
      ).rejects.toThrow("We couldn't save your project.");
      expect(columnsApi.createColumn).not.toHaveBeenCalled();
    });
  });

  describe('partial failures (continue-on-failure)', () => {
    it('returns partial when the first column fails but the rest succeed', async () => {
      const { service, columnsApi } = setup({
        createColumnImpl: (_projectId, dto) => {
          if (dto.name === 'To Do') {
            return throwError(() => new Error('boom'));
          }
          return of(
            makeColumn({
              id: `col-${dto.name}`,
              name: dto.name,
              columnOrder: dto.columnOrder ?? 0
            })
          );
        }
      });

      const result = await firstValueFrom(
        service.createProjectWithColumns(baseInput)
      );

      expect(result.status).toBe('partial');
      if (result.status !== 'partial') throw new Error('unreachable');
      expect(result.failedNames).toEqual(['To Do']);
      expect(result.createdColumns.map(c => c.name)).toEqual([
        'In Progress',
        'Done'
      ]);
      expect(result.message).toContain("'To Do'");
      // Every column POST attempted, even after the first one failed.
      expect(columnsApi.createColumn).toHaveBeenCalledTimes(3);
    });

    it('returns partial when ALL columns fail', async () => {
      const { service } = setup({
        createColumnImpl: () => throwError(() => new Error('boom'))
      });

      const result = await firstValueFrom(
        service.createProjectWithColumns(baseInput)
      );

      expect(result.status).toBe('partial');
      if (result.status !== 'partial') throw new Error('unreachable');
      expect(result.createdColumns).toEqual([]);
      expect(result.failedNames).toEqual(['To Do', 'In Progress', 'Done']);
      expect(result.message).toContain('3 columns');
    });

    it('returns partial when a middle column fails', async () => {
      const { service } = setup({
        createColumnImpl: (_projectId, dto) => {
          if (dto.name === 'In Progress') {
            return throwError(() => new Error('boom'));
          }
          return of(
            makeColumn({
              id: `col-${dto.name}`,
              name: dto.name,
              columnOrder: dto.columnOrder ?? 0
            })
          );
        }
      });

      const result = await firstValueFrom(
        service.createProjectWithColumns(baseInput)
      );
      expect(result.status).toBe('partial');
      if (result.status !== 'partial') throw new Error('unreachable');
      expect(result.failedNames).toEqual(['In Progress']);
      expect(result.createdColumns.map(c => c.name)).toEqual(['To Do', 'Done']);
    });
  });

  describe('order preservation', () => {
    it('POSTs columns in the order given, not alphabetical', async () => {
      const { service, columnsApi } = setup();
      await firstValueFrom(
        service.createProjectWithColumns({
          name: 'Alpha',
          description: null,
          columnNames: ['C', 'A', 'B']
        })
      );

      const calls = columnsApi.createColumn.mock.calls;
      expect(calls[0][1]).toEqual({ name: 'C', columnOrder: 0 });
      expect(calls[1][1]).toEqual({ name: 'A', columnOrder: 1 });
      expect(calls[2][1]).toEqual({ name: 'B', columnOrder: 2 });
    });
  });

  describe('sequencing', () => {
    it('does not start column 2 until column 1 resolves', () => {
      const c1$ = new Subject<ColumnResponseDto>();
      const c2$ = new Subject<ColumnResponseDto>();
      const calls: string[] = [];

      const { service, columnsApi } = setup({
        createColumnImpl: (_projectId, dto) => {
          calls.push(dto.name);
          return dto.name === 'A' ? c1$ : c2$;
        }
      });

      service
        .createProjectWithColumns({
          name: 'Alpha',
          description: null,
          columnNames: ['A', 'B']
        })
        .subscribe();

      // Only the first POST should be dispatched until the first completes.
      expect(calls).toEqual(['A']);
      expect(columnsApi.createColumn).toHaveBeenCalledTimes(1);

      c1$.next(makeColumn({ id: 'col-A', name: 'A', columnOrder: 0 }));
      c1$.complete();

      expect(calls).toEqual(['A', 'B']);

      c2$.next(makeColumn({ id: 'col-B', name: 'B', columnOrder: 1 }));
      c2$.complete();
    });
  });
});

/**
 * Minimal first-value helper — avoids pulling in rxjs' `firstValueFrom`
 * (which exists but keeps this spec self-contained).
 */
function firstValueFrom<T>(source: Observable<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let emitted = false;
    const sub = { current: undefined as undefined | { unsubscribe(): void } };
    sub.current = source.subscribe({
      next: (value: T) => {
        emitted = true;
        resolve(value);
        sub.current?.unsubscribe();
      },
      error: (err: unknown) => reject(err),
      complete: () => {
        if (!emitted) {
          reject(new Error('Observable completed without emitting'));
        }
      }
    });
  });
}

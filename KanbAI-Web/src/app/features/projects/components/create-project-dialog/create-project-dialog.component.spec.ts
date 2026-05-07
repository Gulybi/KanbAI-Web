import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DialogRef } from '@angular/cdk/dialog';
import { Observable, Subject, of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { CreateProjectDialogComponent } from './create-project-dialog.component';
import { CreateProjectDialogResult } from './create-project-dialog.types';
import {
  ProjectCreationResult,
  ProjectCreationService,
  ProjectWithColumnsInput
} from '../../services/project-creation.service';
import { ProjectSummary } from '../../models/project.model';
import { ColumnResponseDto } from '../../../board/models/column.model';

function makeProjectSummary(partial?: Partial<ProjectSummary>): ProjectSummary {
  return {
    id: 'p-1',
    name: 'Q2 Launch Plan',
    description: 'Coordinate marketing and eng for Q2 rollout.',
    role: 'Owner',
    createdAt: '2026-04-29T00:00:00Z',
    updatedAt: '2026-04-29T00:00:00Z',
    ...partial
  };
}

function makeColumn(name: string, index: number): ColumnResponseDto {
  return {
    id: `col-${index}`,
    name,
    colorCode: null,
    columnOrder: index,
    projectId: 'p-1',
    createdAt: '2026-04-29T00:00:00Z',
    updatedAt: '2026-04-29T00:00:00Z'
  };
}

interface ProjectCreationMock {
  createProjectWithColumns: ReturnType<typeof vi.fn>;
}

interface DialogRefMock {
  close: ReturnType<typeof vi.fn>;
}

async function mount(options?: {
  createProjectWithColumnsImpl?: (
    input: ProjectWithColumnsInput
  ) => Observable<ProjectCreationResult>;
}): Promise<{
  fixture: ComponentFixture<CreateProjectDialogComponent>;
  component: CreateProjectDialogComponent;
  projectCreation: ProjectCreationMock;
  dialogRef: DialogRefMock;
}> {
  TestBed.resetTestingModule();

  const projectCreation: ProjectCreationMock = {
    createProjectWithColumns: vi.fn(
      options?.createProjectWithColumnsImpl ??
        ((_input: ProjectWithColumnsInput) =>
          of<ProjectCreationResult>({
            status: 'success',
            project: makeProjectSummary(),
            columns: [
              makeColumn('To Do', 0),
              makeColumn('In Progress', 1),
              makeColumn('Done', 2)
            ]
          }))
    )
  };

  const dialogRef: DialogRefMock = {
    close: vi.fn()
  };

  await TestBed.configureTestingModule({
    imports: [CreateProjectDialogComponent],
    providers: [
      { provide: ProjectCreationService, useValue: projectCreation },
      { provide: DialogRef, useValue: dialogRef }
    ]
  }).compileComponents();

  const fixture = TestBed.createComponent(CreateProjectDialogComponent);
  fixture.detectChanges();

  return {
    fixture,
    component: fixture.componentInstance,
    projectCreation,
    dialogRef
  };
}

/**
 * Typed access to protected members for assertions. We intentionally bypass
 * TS access modifiers in the test to exercise the internal form/signals.
 */
interface InternalDialog {
  form: CreateProjectDialogComponent['form'] extends infer F ? F : never;
  submitting: () => boolean;
  errorMessage: () => string | null;
  partialFailureNames: () => string[];
  onSubmit: () => void;
  onCancel: () => void;
}
function internal(component: CreateProjectDialogComponent): InternalDialog {
  return component as unknown as InternalDialog;
}

describe('CreateProjectDialogComponent', () => {
  let fixture: ComponentFixture<CreateProjectDialogComponent>;
  let component: CreateProjectDialogComponent;
  let projectCreation: ProjectCreationMock;
  let dialogRef: DialogRefMock;

  beforeEach(async () => {
    const mounted = await mount();
    fixture = mounted.fixture;
    component = mounted.component;
    projectCreation = mounted.projectCreation;
    dialogRef = mounted.dialogRef;
  });

  // ------------------------------------------------------------------
  // Existing behavior from #32
  // ------------------------------------------------------------------

  it('renders both a Title input and a Description textarea', () => {
    const hostEl: HTMLElement = fixture.nativeElement;
    const input = hostEl.querySelector('input[type="text"]');
    const textarea = hostEl.querySelector('textarea');

    expect(input).toBeTruthy();
    expect(textarea).toBeTruthy();
  });

  it('renders an accessible heading with id="create-project-heading"', () => {
    const heading = fixture.nativeElement.querySelector('#create-project-heading');
    expect(heading).toBeTruthy();
    expect(heading?.textContent?.trim()).toBe('New Project');
  });

  it('marks the form invalid when the Title is empty', () => {
    const form = internal(component).form;
    expect(form.invalid).toBe(true);
    expect(form.controls.name.hasError('required')).toBe(true);
  });

  it('flags whitespace-only Title with the whitespaceOnly error', () => {
    const form = internal(component).form;
    form.controls.name.setValue('   ');
    expect(form.controls.name.hasError('whitespaceOnly')).toBe(true);
    expect(form.invalid).toBe(true);
  });

  it('accepts a Title at exactly 200 characters', () => {
    const form = internal(component).form;
    form.controls.name.setValue('a'.repeat(200));
    expect(form.controls.name.valid).toBe(true);
  });

  it('rejects a Title longer than 200 characters', () => {
    const form = internal(component).form;
    form.controls.name.setValue('a'.repeat(201));
    expect(form.controls.name.hasError('maxlength')).toBe(true);
  });

  it('accepts a Description at exactly 500 characters', () => {
    const form = internal(component).form;
    form.controls.name.setValue('Valid');
    form.controls.description.setValue('a'.repeat(500));
    expect(form.controls.description.valid).toBe(true);
    expect(form.valid).toBe(true);
  });

  it('rejects a Description longer than 500 characters', () => {
    const form = internal(component).form;
    form.controls.description.setValue('a'.repeat(501));
    expect(form.controls.description.hasError('maxlength')).toBe(true);
  });

  it('maps a blank Description to null in the submitted payload', () => {
    const form = internal(component).form;
    form.controls.name.setValue('Alpha');
    form.controls.description.setValue('');
    internal(component).onSubmit();

    expect(projectCreation.createProjectWithColumns).toHaveBeenCalledTimes(1);
    expect(projectCreation.createProjectWithColumns).toHaveBeenCalledWith({
      name: 'Alpha',
      description: null,
      columnNames: ['To Do', 'In Progress', 'Done']
    });
  });

  it('maps a whitespace-only Description to null', () => {
    const form = internal(component).form;
    form.controls.name.setValue('Alpha');
    form.controls.description.setValue('   ');
    internal(component).onSubmit();

    expect(projectCreation.createProjectWithColumns).toHaveBeenCalledWith({
      name: 'Alpha',
      description: null,
      columnNames: ['To Do', 'In Progress', 'Done']
    });
  });

  it('passes a non-empty Description through untrimmed', () => {
    const form = internal(component).form;
    form.controls.name.setValue('Alpha');
    form.controls.description.setValue('  real text  ');
    internal(component).onSubmit();

    expect(projectCreation.createProjectWithColumns).toHaveBeenCalledWith({
      name: 'Alpha',
      description: '  real text  ',
      columnNames: ['To Do', 'In Progress', 'Done']
    });
  });

  it('trims the Title before submitting', () => {
    const form = internal(component).form;
    form.controls.name.setValue('  Alpha  ');
    form.controls.description.setValue('');
    internal(component).onSubmit();

    expect(projectCreation.createProjectWithColumns).toHaveBeenCalledWith({
      name: 'Alpha',
      description: null,
      columnNames: ['To Do', 'In Progress', 'Done']
    });
  });

  it('closes the dialog with the success result on full success', async () => {
    const result: ProjectCreationResult = {
      status: 'success',
      project: makeProjectSummary({ id: 'p-new' }),
      columns: [
        makeColumn('To Do', 0),
        makeColumn('In Progress', 1),
        makeColumn('Done', 2)
      ]
    };
    const mounted = await mount({
      createProjectWithColumnsImpl: () => of(result)
    });
    const form = internal(mounted.component).form;
    form.controls.name.setValue('Alpha');
    internal(mounted.component).onSubmit();

    expect(mounted.dialogRef.close).toHaveBeenCalledTimes(1);
    expect(mounted.dialogRef.close).toHaveBeenCalledWith(result);
  });

  it('keeps the dialog open and populates errorMessage on project-level error', async () => {
    const mounted = await mount({
      createProjectWithColumnsImpl: () => throwError(() => new Error('Boom'))
    });
    const form = internal(mounted.component).form;
    form.controls.name.setValue('Alpha');
    internal(mounted.component).onSubmit();

    expect(mounted.dialogRef.close).not.toHaveBeenCalled();
    expect(internal(mounted.component).errorMessage()).toBe('Boom');
    expect(internal(mounted.component).submitting()).toBe(false);
    expect(form.controls.name.value).toBe('Alpha');
  });

  it('falls back to a generic message when the error has no message', async () => {
    const mounted = await mount({
      createProjectWithColumnsImpl: () => throwError(() => new Error(''))
    });
    const form = internal(mounted.component).form;
    form.controls.name.setValue('Alpha');
    internal(mounted.component).onSubmit();

    expect(internal(mounted.component).errorMessage()).toBe(
      'Something went wrong. Please try again.'
    );
  });

  it('clears errorMessage when the user edits any field after a failure', async () => {
    const mounted = await mount({
      createProjectWithColumnsImpl: () => throwError(() => new Error('Boom'))
    });
    const form = internal(mounted.component).form;
    form.controls.name.setValue('Alpha');
    internal(mounted.component).onSubmit();
    expect(internal(mounted.component).errorMessage()).toBe('Boom');

    form.controls.name.setValue('Alpha 2');
    expect(internal(mounted.component).errorMessage()).toBeNull();
  });

  it('guards against re-entrant submits while a request is in flight', async () => {
    const subject = new Subject<ProjectCreationResult>();
    const mounted = await mount({
      createProjectWithColumnsImpl: () => subject.asObservable()
    });
    const form = internal(mounted.component).form;
    form.controls.name.setValue('Alpha');
    internal(mounted.component).onSubmit();
    internal(mounted.component).onSubmit();

    expect(
      mounted.projectCreation.createProjectWithColumns
    ).toHaveBeenCalledTimes(1);

    subject.next({
      status: 'success',
      project: makeProjectSummary(),
      columns: []
    });
    subject.complete();
  });

  it('does not call the orchestrator when submitting with an invalid form', () => {
    const form = internal(component).form;
    form.controls.name.setValue('');
    internal(component).onSubmit();
    expect(projectCreation.createProjectWithColumns).not.toHaveBeenCalled();
  });

  it('closes the dialog without an API call when Cancel is invoked', () => {
    internal(component).onCancel();
    expect(projectCreation.createProjectWithColumns).not.toHaveBeenCalled();
    expect(dialogRef.close).toHaveBeenCalledTimes(1);
    expect(dialogRef.close).toHaveBeenCalledWith();
  });

  it('late response still lands after the component is destroyed', async () => {
    const subject = new Subject<ProjectCreationResult>();
    const tapSpy = vi.fn();
    const mounted = await mount({
      createProjectWithColumnsImpl: () =>
        new Observable<ProjectCreationResult>(subscriber => {
          const sub = subject.subscribe({
            next: v => {
              tapSpy(v);
              subscriber.next(v);
            },
            error: e => subscriber.error(e),
            complete: () => subscriber.complete()
          });
          return () => sub.unsubscribe();
        })
    });
    const form = internal(mounted.component).form;
    form.controls.name.setValue('Alpha');
    internal(mounted.component).onSubmit();

    mounted.fixture.destroy();

    // If subscription were tied to DestroyRef, the next emission would not
    // reach the tap. Emitting after destroy still runs because the
    // subscription is owned by the application-root injector.
    subject.next({
      status: 'success',
      project: makeProjectSummary({ id: 'p-late' }),
      columns: []
    });
    expect(tapSpy).toHaveBeenCalledTimes(1);
  });

  // ------------------------------------------------------------------
  // New behavior from #70
  // ------------------------------------------------------------------

  it('opens with exactly three default columns in order', () => {
    const form = internal(component).form;
    expect(form.controls.columns.length).toBe(3);
    expect(form.controls.columns.at(0).controls.name.value).toBe('To Do');
    expect(form.controls.columns.at(1).controls.name.value).toBe('In Progress');
    expect(form.controls.columns.at(2).controls.name.value).toBe('Done');
  });

  it('keeps the form valid with the defaults untouched', () => {
    const form = internal(component).form;
    form.controls.name.setValue('Alpha');
    expect(form.valid).toBe(true);
  });

  it('rejects a column name of exactly 101 characters', () => {
    const form = internal(component).form;
    form.controls.columns.at(0).controls.name.setValue('a'.repeat(101));
    expect(
      form.controls.columns.at(0).controls.name.hasError('maxlength')
    ).toBe(true);
    expect(form.invalid).toBe(true);
  });

  it('accepts a column name at exactly 100 characters', () => {
    const form = internal(component).form;
    form.controls.name.setValue('Alpha');
    form.controls.columns.at(0).controls.name.setValue('a'.repeat(100));
    expect(form.valid).toBe(true);
  });

  it('blocks submit on a blank column name', () => {
    const form = internal(component).form;
    form.controls.name.setValue('Alpha');
    form.controls.columns.at(0).controls.name.setValue('');
    internal(component).onSubmit();
    expect(projectCreation.createProjectWithColumns).not.toHaveBeenCalled();
  });

  it('blocks submit on a whitespace-only column name', () => {
    const form = internal(component).form;
    form.controls.name.setValue('Alpha');
    form.controls.columns.at(0).controls.name.setValue('   ');
    internal(component).onSubmit();
    expect(projectCreation.createProjectWithColumns).not.toHaveBeenCalled();
  });

  it('blocks submit on a duplicate column name (case-insensitive)', () => {
    const form = internal(component).form;
    form.controls.name.setValue('Alpha');
    form.controls.columns.at(0).controls.name.setValue('Done');
    // Row 2 is still 'Done' by default; row 0 is now also 'done' after trim/lower.
    form.controls.columns.updateValueAndValidity();
    expect(form.controls.columns.errors?.['duplicateNames']).toBeTruthy();
    internal(component).onSubmit();
    expect(projectCreation.createProjectWithColumns).not.toHaveBeenCalled();
  });

  it('blocks submit when the column list is empty', () => {
    const form = internal(component).form;
    form.controls.name.setValue('Alpha');
    form.controls.columns.clear();
    form.controls.columns.updateValueAndValidity();
    internal(component).onSubmit();
    expect(projectCreation.createProjectWithColumns).not.toHaveBeenCalled();
  });

  it('submits the column names in the order they appear in the form', () => {
    const form = internal(component).form;
    form.controls.name.setValue('Alpha');

    // Add a fourth column, rename existing, and assert order.
    const group = form.controls.columns.at(0);
    form.controls.columns.removeAt(0);
    form.controls.columns.push(group); // "To Do" moves to the end.
    form.controls.columns.updateValueAndValidity();

    internal(component).onSubmit();
    expect(projectCreation.createProjectWithColumns).toHaveBeenCalledWith({
      name: 'Alpha',
      description: null,
      columnNames: ['In Progress', 'Done', 'To Do']
    });
  });

  it('trims column names before submitting', () => {
    const form = internal(component).form;
    form.controls.name.setValue('Alpha');
    form.controls.columns.at(0).controls.name.setValue('  Backlog  ');
    internal(component).onSubmit();
    expect(projectCreation.createProjectWithColumns).toHaveBeenCalledWith({
      name: 'Alpha',
      description: null,
      columnNames: ['Backlog', 'In Progress', 'Done']
    });
  });

  it('closes the dialog with the partial result when the orchestrator emits partial', async () => {
    const partial: ProjectCreationResult = {
      status: 'partial',
      project: makeProjectSummary(),
      createdColumns: [makeColumn('To Do', 0)],
      failedNames: ['In Progress', 'Done'],
      message:
        "The project was created, but 2 columns couldn't be added: 'In Progress', 'Done'."
    };
    const mounted = await mount({
      createProjectWithColumnsImpl: () => of(partial)
    });
    const form = internal(mounted.component).form;
    form.controls.name.setValue('Alpha');
    internal(mounted.component).onSubmit();

    expect(mounted.dialogRef.close).toHaveBeenCalledTimes(1);
    expect(mounted.dialogRef.close).toHaveBeenCalledWith(partial);
  });

  it('exposes a discriminated-union-friendly close result', () => {
    const form = internal(component).form;
    form.controls.name.setValue('Alpha');
    internal(component).onSubmit();
    const arg = dialogRef.close.mock.calls[0]?.[0] as CreateProjectDialogResult;
    expect(['success', 'partial']).toContain(arg.status);
  });

  it('onCancel is a no-op while submitting', async () => {
    const subject = new Subject<ProjectCreationResult>();
    const mounted = await mount({
      createProjectWithColumnsImpl: () => subject.asObservable()
    });
    const form = internal(mounted.component).form;
    form.controls.name.setValue('Alpha');
    internal(mounted.component).onSubmit();
    expect(internal(mounted.component).submitting()).toBe(true);

    internal(mounted.component).onCancel();
    expect(mounted.dialogRef.close).not.toHaveBeenCalled();

    subject.next({
      status: 'success',
      project: makeProjectSummary(),
      columns: []
    });
    subject.complete();
  });

  it('template renders the Cancel button [disabled] while submitting', async () => {
    const subject = new Subject<ProjectCreationResult>();
    const mounted = await mount({
      createProjectWithColumnsImpl: () => subject.asObservable()
    });
    const form = internal(mounted.component).form;
    form.controls.name.setValue('Alpha');
    internal(mounted.component).onSubmit();
    mounted.fixture.detectChanges();

    const cancel: HTMLButtonElement =
      mounted.fixture.nativeElement.querySelector(
        '.create-project-dialog__cancel'
      );
    expect(cancel.disabled).toBe(true);

    subject.next({
      status: 'success',
      project: makeProjectSummary(),
      columns: []
    });
    subject.complete();
  });

  // ------------------------------------------------------------------
  // Regression test for issue #76 (NG0950 propagation to parent form)
  // ------------------------------------------------------------------

  it('root form.invalid flips to false after mount with a valid Title and default columns', async () => {
    // Pre-fix, the child ColumnDraftListComponent throws NG0950 during its
    // constructor-microtask, which swallows its init side effects and leaves
    // the root FormGroup's validity in an inconsistent state. Post-fix, the
    // child initializes cleanly and the root form reflects a valid state as
    // soon as the Title is filled in.
    const form = internal(component).form;
    form.controls.name.setValue('Alpha');
    fixture.detectChanges();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    expect(form.controls.name.valid).toBe(true);
    expect(form.controls.columns.valid).toBe(true);
    expect(form.valid).toBe(true);
    expect(form.invalid).toBe(false);
  });
});

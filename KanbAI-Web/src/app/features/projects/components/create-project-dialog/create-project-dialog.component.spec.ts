import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DialogRef } from '@angular/cdk/dialog';
import { By } from '@angular/platform-browser';
import { Observable, Subject, of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { CreateProjectDialogComponent } from './create-project-dialog.component';
import { ProjectStateService } from '../../state/project-state.service';
import { ProjectInput } from '../../state/project-state.model';
import { ProjectSummary } from '../../models/project.model';

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

interface ProjectStateMock {
  createProject: ReturnType<typeof vi.fn>;
}

interface DialogRefMock {
  close: ReturnType<typeof vi.fn>;
}

async function mount(options?: {
  createProjectImpl?: (input: ProjectInput) => Observable<ProjectSummary>;
}): Promise<{
  fixture: ComponentFixture<CreateProjectDialogComponent>;
  component: CreateProjectDialogComponent;
  projectState: ProjectStateMock;
  dialogRef: DialogRefMock;
}> {
  // Reset so callers can remount inside a single test (e.g. to swap the
  // createProject implementation) without tripping the
  // "module already instantiated" TestBed guard.
  TestBed.resetTestingModule();

  const projectState: ProjectStateMock = {
    createProject: vi.fn(
      options?.createProjectImpl ?? ((_input: ProjectInput) => of(makeProjectSummary()))
    )
  };

  const dialogRef: DialogRefMock = {
    close: vi.fn()
  };

  await TestBed.configureTestingModule({
    imports: [CreateProjectDialogComponent],
    providers: [
      { provide: ProjectStateService, useValue: projectState },
      { provide: DialogRef, useValue: dialogRef }
    ]
  }).compileComponents();

  const fixture = TestBed.createComponent(CreateProjectDialogComponent);
  fixture.detectChanges();

  return {
    fixture,
    component: fixture.componentInstance,
    projectState,
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
  onSubmit: () => void;
  onCancel: () => void;
}
function internal(component: CreateProjectDialogComponent): InternalDialog {
  return component as unknown as InternalDialog;
}

describe('CreateProjectDialogComponent', () => {
  let fixture: ComponentFixture<CreateProjectDialogComponent>;
  let component: CreateProjectDialogComponent;
  let projectState: ProjectStateMock;
  let dialogRef: DialogRefMock;

  beforeEach(async () => {
    const mounted = await mount();
    fixture = mounted.fixture;
    component = mounted.component;
    projectState = mounted.projectState;
    dialogRef = mounted.dialogRef;
  });

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

    expect(projectState.createProject).toHaveBeenCalledTimes(1);
    expect(projectState.createProject).toHaveBeenCalledWith({
      name: 'Alpha',
      description: null
    });
  });

  it('maps a whitespace-only Description to null', () => {
    const form = internal(component).form;
    form.controls.name.setValue('Alpha');
    form.controls.description.setValue('   ');
    internal(component).onSubmit();

    expect(projectState.createProject).toHaveBeenCalledWith({
      name: 'Alpha',
      description: null
    });
  });

  it('passes a non-empty Description through untrimmed', () => {
    const form = internal(component).form;
    form.controls.name.setValue('Alpha');
    form.controls.description.setValue('  real text  ');
    internal(component).onSubmit();

    expect(projectState.createProject).toHaveBeenCalledWith({
      name: 'Alpha',
      description: '  real text  '
    });
  });

  it('trims the Title before submitting', () => {
    const form = internal(component).form;
    form.controls.name.setValue('  Alpha  ');
    form.controls.description.setValue('');
    internal(component).onSubmit();

    expect(projectState.createProject).toHaveBeenCalledWith({
      name: 'Alpha',
      description: null
    });
  });

  it('closes the dialog with the created project on success', async () => {
    const created = makeProjectSummary({ id: 'p-new' });
    const mounted = await mount({
      createProjectImpl: () => of(created)
    });
    const form = internal(mounted.component).form;
    form.controls.name.setValue('Alpha');
    internal(mounted.component).onSubmit();

    expect(mounted.dialogRef.close).toHaveBeenCalledTimes(1);
    expect(mounted.dialogRef.close).toHaveBeenCalledWith({ created });
  });

  it('keeps the dialog open and populates errorMessage on error', async () => {
    const mounted = await mount({
      createProjectImpl: () => throwError(() => new Error('Boom'))
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
      createProjectImpl: () => throwError(() => new Error(''))
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
      createProjectImpl: () => throwError(() => new Error('Boom'))
    });
    const form = internal(mounted.component).form;
    form.controls.name.setValue('Alpha');
    internal(mounted.component).onSubmit();
    expect(internal(mounted.component).errorMessage()).toBe('Boom');

    form.controls.name.setValue('Alpha 2');
    expect(internal(mounted.component).errorMessage()).toBeNull();
  });

  it('guards against re-entrant submits while a request is in flight', async () => {
    const subject = new Subject<ProjectSummary>();
    const mounted = await mount({
      createProjectImpl: () => subject.asObservable()
    });
    const form = internal(mounted.component).form;
    form.controls.name.setValue('Alpha');
    internal(mounted.component).onSubmit();
    internal(mounted.component).onSubmit();

    expect(mounted.projectState.createProject).toHaveBeenCalledTimes(1);

    subject.next(makeProjectSummary());
    subject.complete();
  });

  it('does not call createProject when submitting with an invalid form', () => {
    const form = internal(component).form;
    form.controls.name.setValue('');
    internal(component).onSubmit();
    expect(projectState.createProject).not.toHaveBeenCalled();
  });

  it('closes the dialog without an API call when Cancel is invoked', () => {
    internal(component).onCancel();
    expect(projectState.createProject).not.toHaveBeenCalled();
    expect(dialogRef.close).toHaveBeenCalledTimes(1);
    expect(dialogRef.close).toHaveBeenCalledWith();
  });

  it('late response still lands after the component is destroyed (no takeUntilDestroyed on submit)', async () => {
    const subject = new Subject<ProjectSummary>();
    const tapSpy = vi.fn();
    const mounted = await mount({
      createProjectImpl: () =>
        new Observable<ProjectSummary>((subscriber) => {
          const sub = subject.subscribe({
            next: (v) => {
              tapSpy(v);
              subscriber.next(v);
            },
            error: (e) => subscriber.error(e),
            complete: () => subscriber.complete()
          });
          return () => sub.unsubscribe();
        })
    });
    const form = internal(mounted.component).form;
    form.controls.name.setValue('Alpha');
    internal(mounted.component).onSubmit();

    mounted.fixture.destroy();

    // If the subscription were tied to DestroyRef, the next emission would not
    // reach the state-service's tap (here: tapSpy). Emitting after destroy
    // still runs because the subscription is owned by the application-root
    // injector.
    subject.next(makeProjectSummary({ id: 'p-late' }));
    expect(tapSpy).toHaveBeenCalledTimes(1);
  });
});

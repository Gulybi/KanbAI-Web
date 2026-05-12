import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { WritableSignal, signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, of, throwError } from 'rxjs';
import { describe, it, expect, vi } from 'vitest';

import { PartialFailureToastComponent } from '../components/partial-failure-toast/partial-failure-toast.component';
import { CreateProjectDialogResult } from '../components/create-project-dialog/create-project-dialog.types';

import { DashboardPageComponent } from './dashboard-page.component';
import { ProjectStateService } from '../state/project-state.service';
import { ProjectsApiService } from '../services/projects-api.service';
import { ProjectSummary } from '../models/project.model';
import { DashboardSkeletonComponent } from '../components/dashboard-skeleton/dashboard-skeleton.component';
import { ProjectGridComponent } from '../components/project-grid/project-grid.component';
import { DashboardEmptyStateComponent } from '../components/dashboard-empty-state/dashboard-empty-state.component';
import { DashboardErrorStateComponent } from '../components/dashboard-error-state/dashboard-error-state.component';
import { DashboardHeaderComponent } from '../components/dashboard-header/dashboard-header.component';
import { CreateProjectDialogComponent } from '../components/create-project-dialog/create-project-dialog.component';
import { MembersDialogComponent } from '../components/members-dialog/members-dialog.component';
import { DeleteProjectConfirmDialogComponent } from '../components/delete-project-confirm-dialog/delete-project-confirm-dialog.component';
import { ToastService } from '../../../core/services/toast.service';

interface ProjectStateMock {
  projects: WritableSignal<ProjectSummary[]>;
  isLoading: WritableSignal<boolean>;
  error: WritableSignal<string | null>;
  hasLoaded: WritableSignal<boolean>;
  loadProjects: ReturnType<typeof vi.fn>;
  applyDeletedProject: ReturnType<typeof vi.fn>;
}

interface DialogMock {
  open: ReturnType<typeof vi.fn>;
}

interface RouterMock {
  navigate: ReturnType<typeof vi.fn>;
}

interface ProjectsApiMock {
  deleteProject: ReturnType<typeof vi.fn>;
}

interface ToastServiceMock {
  show: ReturnType<typeof vi.fn>;
  announce: ReturnType<typeof vi.fn>;
  dismissCurrent: ReturnType<typeof vi.fn>;
  currentToast: WritableSignal<unknown>;
  currentAnnouncement: WritableSignal<string>;
}

function makeProjects(count: number): ProjectSummary[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p-${i}`,
    name: `Project ${i}`,
    description: null,
    role: 'Owner',
    createdAt: '2026-04-10T00:00:00Z',
    updatedAt: '2026-04-10T00:00:00Z'
  }));
}

async function mount(): Promise<{
  fixture: ComponentFixture<DashboardPageComponent>;
  mock: ProjectStateMock;
  dialog: DialogMock;
  router: RouterMock;
  projectsApi: ProjectsApiMock;
  toast: ToastServiceMock;
}> {
  const mock: ProjectStateMock = {
    projects: signal<ProjectSummary[]>([]),
    isLoading: signal(false),
    error: signal<string | null>(null),
    hasLoaded: signal(false),
    loadProjects: vi.fn(),
    applyDeletedProject: vi.fn()
  };

  const dialog: DialogMock = {
    // Default: a dialog ref whose `closed` emits nothing. Tests that need
    // to assert close-result behavior override `dialog.open.mockReturnValue`
    // with a Subject they control.
    open: vi.fn(() => ({ closed: of(undefined) }))
  };

  const router: RouterMock = {
    navigate: vi.fn()
  };

  const projectsApi: ProjectsApiMock = {
    deleteProject: vi.fn(() => of(undefined))
  };

  const toast: ToastServiceMock = {
    show: vi.fn(),
    announce: vi.fn(),
    dismissCurrent: vi.fn(),
    currentToast: signal(null),
    currentAnnouncement: signal('')
  };

  await TestBed.configureTestingModule({
    imports: [DashboardPageComponent],
    providers: [
      { provide: ProjectStateService, useValue: mock },
      { provide: Dialog, useValue: dialog },
      { provide: Router, useValue: router },
      { provide: ProjectsApiService, useValue: projectsApi },
      { provide: ToastService, useValue: toast }
    ]
  }).compileComponents();

  const fixture = TestBed.createComponent(DashboardPageComponent);
  fixture.detectChanges();
  return { fixture, mock, dialog, router, projectsApi, toast };
}

describe('DashboardPageComponent', () => {
  it('calls loadProjects() on init', async () => {
    const { mock } = await mount();
    expect(mock.loadProjects).toHaveBeenCalledTimes(1);
  });

  it('renders the skeleton while the first load is in flight', async () => {
    const { fixture, mock } = await mount();

    mock.isLoading.set(true);
    mock.hasLoaded.set(false);
    fixture.detectChanges();

    const skeleton = fixture.debugElement.query(By.directive(DashboardSkeletonComponent));
    expect(skeleton).toBeTruthy();

    const grid = fixture.debugElement.query(By.directive(ProjectGridComponent));
    expect(grid).toBeNull();
  });

  it('renders the grid when the state service exposes a non-empty list', async () => {
    const { fixture, mock } = await mount();

    const projects = makeProjects(3);
    mock.projects.set(projects);
    mock.hasLoaded.set(true);
    mock.isLoading.set(false);
    fixture.detectChanges();

    const grid = fixture.debugElement.query(By.directive(ProjectGridComponent));
    expect(grid).toBeTruthy();
    expect((grid.componentInstance as ProjectGridComponent).projects).toEqual(projects);
  });

  it('renders the empty state when hasLoaded is true and projects is empty', async () => {
    const { fixture, mock } = await mount();

    mock.projects.set([]);
    mock.hasLoaded.set(true);
    mock.isLoading.set(false);
    fixture.detectChanges();

    const empty = fixture.debugElement.query(By.directive(DashboardEmptyStateComponent));
    expect(empty).toBeTruthy();

    const grid = fixture.debugElement.query(By.directive(ProjectGridComponent));
    expect(grid).toBeNull();
  });

  it('renders the error state with the message from the state service', async () => {
    const { fixture, mock } = await mount();

    mock.error.set('Something went wrong on our end. Please try again in a moment.');
    fixture.detectChanges();

    const error = fixture.debugElement.query(By.directive(DashboardErrorStateComponent));
    expect(error).toBeTruthy();
    const instance = error.componentInstance as DashboardErrorStateComponent;
    expect(instance.message).toBe('Something went wrong on our end. Please try again in a moment.');
  });

  it('re-invokes loadProjects() when the error panel emits retry', async () => {
    const { fixture, mock } = await mount();
    // loadProjects was called once in ngOnInit.
    expect(mock.loadProjects).toHaveBeenCalledTimes(1);

    mock.error.set("We couldn't load your projects. Please try again.");
    fixture.detectChanges();

    const error = fixture.debugElement.query(By.directive(DashboardErrorStateComponent));
    expect(error).toBeTruthy();

    (error.componentInstance as DashboardErrorStateComponent).retry.emit();
    fixture.detectChanges();

    expect(mock.loadProjects).toHaveBeenCalledTimes(2);
  });

  it('opens the create-project dialog when the empty-state CTA is clicked', async () => {
    const { fixture, mock, dialog } = await mount();

    mock.projects.set([]);
    mock.hasLoaded.set(true);
    fixture.detectChanges();

    const empty = fixture.debugElement.query(By.directive(DashboardEmptyStateComponent));
    (empty.componentInstance as DashboardEmptyStateComponent).createClick.emit();
    fixture.detectChanges();

    expect(dialog.open).toHaveBeenCalledTimes(1);
    expect(dialog.open).toHaveBeenCalledWith(
      CreateProjectDialogComponent,
      expect.objectContaining({
        ariaLabelledBy: 'create-project-heading',
        autoFocus: 'first-tabbable',
        restoreFocus: true,
        panelClass: 'create-project-dialog-panel'
      })
    );
  });

  it('opens the same dialog when the header emits createClick', async () => {
    const { fixture, dialog } = await mount();

    const header = fixture.debugElement.query(By.directive(DashboardHeaderComponent));
    (header.componentInstance as DashboardHeaderComponent).createClick.emit();
    fixture.detectChanges();

    expect(dialog.open).toHaveBeenCalledTimes(1);
    expect(dialog.open).toHaveBeenCalledWith(
      CreateProjectDialogComponent,
      expect.objectContaining({ ariaLabelledBy: 'create-project-heading' })
    );
  });

  it('always renders the dashboard header regardless of VM state', async () => {
    const { fixture } = await mount();

    const header = fixture.nativeElement.querySelector('app-dashboard-header');
    expect(header).toBeTruthy();
  });

  it('prefers the error branch when both error and cached projects are present', async () => {
    // This matches the tech-spec rule: the cache is preserved on list-load
    // failure, but the page flips to the error panel so the user knows the
    // last refresh did not complete.
    const { fixture, mock } = await mount();

    mock.projects.set(makeProjects(2));
    mock.hasLoaded.set(true);
    mock.error.set("We couldn't load your projects. Please try again.");
    fixture.detectChanges();

    const error = fixture.debugElement.query(By.directive(DashboardErrorStateComponent));
    expect(error).toBeTruthy();

    const grid = fixture.debugElement.query(By.directive(ProjectGridComponent));
    expect(grid).toBeNull();
  });

  // ------------------------------------------------------------------
  // openMembersDialog (issue #33)
  // ------------------------------------------------------------------
  it('opens the Members dialog when the grid emits manageMembersClick', async () => {
    const { fixture, mock, dialog } = await mount();
    const projects = makeProjects(2);
    mock.projects.set(projects);
    mock.hasLoaded.set(true);
    mock.isLoading.set(false);
    fixture.detectChanges();

    const grid = fixture.debugElement.query(By.directive(ProjectGridComponent));
    (grid.componentInstance as ProjectGridComponent).manageMembersClick.emit(projects[0]);
    fixture.detectChanges();

    expect(dialog.open).toHaveBeenCalledTimes(1);
    expect(dialog.open).toHaveBeenCalledWith(
      MembersDialogComponent,
      expect.objectContaining({
        data: { project: projects[0] },
        ariaLabelledBy: 'members-dialog-title',
        autoFocus: 'first-tabbable',
        restoreFocus: true,
        panelClass: 'members-dialog-panel'
      })
    );
  });

  it('renders empty-state block after an empty-array load', async () => {
    // Regression guard for issue #57: drives the mock signals in the exact
    // order `ProjectStateService.loadProjects()` does and asserts the vm()
    // computation arrives at the 'empty' branch. If the root-cause bug
    // (short-circuit on currentUser() === null) were reintroduced,
    // hasLoaded would stay false and the skeleton would persist instead.
    const { fixture, mock } = await mount();

    // Phase 1: loadProjects() just fired - isLoading=true, hasLoaded=false.
    mock.isLoading.set(true);
    mock.hasLoaded.set(false);
    mock.projects.set([]);
    mock.error.set(null);
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.directive(DashboardSkeletonComponent))).toBeTruthy();

    // Phase 2: empty-array response landed - setState({ projects: [],
    // isLoading: false, error: null, hasLoaded: true }).
    mock.projects.set([]);
    mock.isLoading.set(false);
    mock.error.set(null);
    mock.hasLoaded.set(true);
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.directive(DashboardEmptyStateComponent))).toBeTruthy();
    expect(fixture.debugElement.query(By.directive(DashboardSkeletonComponent))).toBeNull();
    expect(fixture.debugElement.query(By.directive(ProjectGridComponent))).toBeNull();
    expect(fixture.debugElement.query(By.directive(DashboardErrorStateComponent))).toBeNull();
  });

  it('re-renders reactively when the state service signals change after initial mount', async () => {
    const { fixture, mock } = await mount();

    // Start in loading -> skeleton present.
    mock.isLoading.set(true);
    mock.hasLoaded.set(false);
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.directive(DashboardSkeletonComponent))).toBeTruthy();

    // Flip to success -> grid replaces the skeleton.
    mock.isLoading.set(false);
    mock.projects.set(makeProjects(1));
    mock.hasLoaded.set(true);
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.directive(DashboardSkeletonComponent))).toBeNull();
    expect(fixture.debugElement.query(By.directive(ProjectGridComponent))).toBeTruthy();
  });

  // ------------------------------------------------------------------
  // openBoard navigation (issue #66)
  // ------------------------------------------------------------------
  it('navigates to /board/:projectId when the grid emits openBoard', async () => {
    const { fixture, mock, router } = await mount();
    const projects = makeProjects(2);
    mock.projects.set(projects);
    mock.hasLoaded.set(true);
    mock.isLoading.set(false);
    fixture.detectChanges();

    const grid = fixture.debugElement.query(By.directive(ProjectGridComponent));
    (grid.componentInstance as ProjectGridComponent).openBoard.emit(projects[0]);
    fixture.detectChanges();

    expect(router.navigate).toHaveBeenCalledTimes(1);
    expect(router.navigate).toHaveBeenCalledWith(['/board', projects[0].id]);
  });

  it('passes the clicked card\'s own id, not some other card\'s id (regression guard)', async () => {
    const { fixture, mock, router } = await mount();
    const projects = makeProjects(3);
    mock.projects.set(projects);
    mock.hasLoaded.set(true);
    mock.isLoading.set(false);
    fixture.detectChanges();

    const grid = fixture.debugElement.query(By.directive(ProjectGridComponent));
    (grid.componentInstance as ProjectGridComponent).openBoard.emit(projects[1]);
    fixture.detectChanges();

    expect(router.navigate).toHaveBeenCalledWith(['/board', projects[1].id]);
  });

  it('does not navigate on manageMembersClick (regression guard)', async () => {
    const { fixture, mock, router, dialog } = await mount();
    const projects = makeProjects(1);
    mock.projects.set(projects);
    mock.hasLoaded.set(true);
    mock.isLoading.set(false);
    fixture.detectChanges();

    const grid = fixture.debugElement.query(By.directive(ProjectGridComponent));
    (grid.componentInstance as ProjectGridComponent).manageMembersClick.emit(projects[0]);
    fixture.detectChanges();

    expect(router.navigate).not.toHaveBeenCalled();
    expect(dialog.open).toHaveBeenCalledTimes(1);
  });

  // ------------------------------------------------------------------
  // Partial-failure toast (issue #70)
  // ------------------------------------------------------------------
  it('renders the PartialFailureToast when the create dialog closes with "partial"', async () => {
    const closed$ = new Subject<CreateProjectDialogResult | undefined>();
    const { fixture, dialog } = await mount();
    dialog.open.mockReturnValue({ closed: closed$.asObservable() });

    const header = fixture.debugElement.query(By.directive(DashboardHeaderComponent));
    (header.componentInstance as DashboardHeaderComponent).createClick.emit();
    fixture.detectChanges();

    closed$.next({
      status: 'partial',
      project: makeProjects(1)[0],
      createdColumns: [],
      failedNames: ['Done'],
      message:
        "The project was created, but 1 column couldn't be added: 'Done'. You can add it from the board."
    });
    closed$.complete();
    fixture.detectChanges();

    const toast = fixture.debugElement.query(By.directive(PartialFailureToastComponent));
    expect(toast).toBeTruthy();
  });

  it('does NOT render the toast on a "success" close', async () => {
    const closed$ = new Subject<CreateProjectDialogResult | undefined>();
    const { fixture, dialog } = await mount();
    dialog.open.mockReturnValue({ closed: closed$.asObservable() });

    const header = fixture.debugElement.query(By.directive(DashboardHeaderComponent));
    (header.componentInstance as DashboardHeaderComponent).createClick.emit();
    fixture.detectChanges();

    closed$.next({
      status: 'success',
      project: makeProjects(1)[0],
      columns: []
    });
    closed$.complete();
    fixture.detectChanges();

    const toast = fixture.debugElement.query(By.directive(PartialFailureToastComponent));
    expect(toast).toBeNull();
  });

  it('dismisses the toast when onPartialToastDismiss is invoked', async () => {
    const closed$ = new Subject<CreateProjectDialogResult | undefined>();
    const { fixture, dialog } = await mount();
    dialog.open.mockReturnValue({ closed: closed$.asObservable() });

    const header = fixture.debugElement.query(By.directive(DashboardHeaderComponent));
    (header.componentInstance as DashboardHeaderComponent).createClick.emit();
    fixture.detectChanges();

    closed$.next({
      status: 'partial',
      project: makeProjects(1)[0],
      createdColumns: [],
      failedNames: ['Done'],
      message: 'partial'
    });
    closed$.complete();
    fixture.detectChanges();

    const toast = fixture.debugElement.query(By.directive(PartialFailureToastComponent));
    expect(toast).toBeTruthy();
    (toast.componentInstance as PartialFailureToastComponent).dismiss.emit();
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.directive(PartialFailureToastComponent))).toBeNull();
  });

  it('routes to the new project board when the toast emits openBoard', async () => {
    const closed$ = new Subject<CreateProjectDialogResult | undefined>();
    const { fixture, dialog, router } = await mount();
    dialog.open.mockReturnValue({ closed: closed$.asObservable() });

    const header = fixture.debugElement.query(By.directive(DashboardHeaderComponent));
    (header.componentInstance as DashboardHeaderComponent).createClick.emit();
    fixture.detectChanges();

    const project = makeProjects(1)[0];
    closed$.next({
      status: 'partial',
      project,
      createdColumns: [],
      failedNames: ['Done'],
      message: 'partial'
    });
    closed$.complete();
    fixture.detectChanges();

    // Router navigate was NOT called yet — opening the dialog doesn't route.
    expect(router.navigate).not.toHaveBeenCalled();

    const toast = fixture.debugElement.query(By.directive(PartialFailureToastComponent));
    (toast.componentInstance as PartialFailureToastComponent).openBoard.emit();
    fixture.detectChanges();

    expect(router.navigate).toHaveBeenCalledWith(['/board', project.id]);
  });

  // ---------------------------------------------------------------------
  // Issue #96 — Delete-project orchestration (dashboard)
  // ---------------------------------------------------------------------
  describe('openDeleteProjectDialog (issue #96)', () => {
    /**
     * Sets up a dashboard mount seeded with `project`, then triggers the
     * Delete-project flow and exposes the fake dialog + the confirm
     * emitter the fixture can fire to simulate the user pressing the
     * destructive primary button.
     */
    async function mountWithDeleteFlow(project: ProjectSummary): Promise<{
      fixture: ComponentFixture<DashboardPageComponent>;
      mock: ProjectStateMock;
      dialog: DialogMock;
      router: RouterMock;
      projectsApi: ProjectsApiMock;
      toast: ToastServiceMock;
      confirmClicked$: Subject<void>;
      closed$: Subject<unknown>;
      dialogRefCloseSpy: ReturnType<typeof vi.fn>;
      setInputSpy: ReturnType<typeof vi.fn>;
    }> {
      const ctx = await mount();
      ctx.mock.projects.set([project]);
      ctx.mock.hasLoaded.set(true);
      ctx.fixture.detectChanges();

      const confirmClicked$ = new Subject<void>();
      const closed$ = new Subject<unknown>();
      const dialogRefCloseSpy = vi.fn();
      const setInputSpy = vi.fn();
      ctx.dialog.open.mockReturnValue({
        componentInstance: { confirmClicked: confirmClicked$ },
        componentRef: { setInput: setInputSpy },
        closed: closed$.asObservable(),
        close: dialogRefCloseSpy
      });

      const grid = ctx.fixture.debugElement.query(By.directive(ProjectGridComponent));
      (grid.componentInstance as ProjectGridComponent).deleteProjectRequested.emit(project);
      ctx.fixture.detectChanges();

      return { ...ctx, confirmClicked$, closed$, dialogRefCloseSpy, setInputSpy };
    }

    it('opens the DeleteProjectConfirmDialogComponent with the project name as data', async () => {
      const project = makeProjects(1)[0];
      const { dialog } = await mountWithDeleteFlow(project);

      expect(dialog.open).toHaveBeenCalledWith(
        DeleteProjectConfirmDialogComponent,
        expect.objectContaining({
          data: { projectName: project.name },
          ariaLabelledBy: 'delete-project-confirm-heading',
          restoreFocus: true,
          panelClass: 'delete-project-confirm-panel'
        })
      );
    });

    it('on 204 fires exactly one DELETE, applies local removal, closes dialog, and shows toast + announce with verbatim copy', async () => {
      const project: ProjectSummary = {
        ...makeProjects(1)[0],
        id: 'p-42',
        name: 'Acme'
      };
      const { mock, projectsApi, confirmClicked$, toast, dialogRefCloseSpy } =
        await mountWithDeleteFlow(project);
      projectsApi.deleteProject.mockReturnValue(of(undefined));

      confirmClicked$.next();

      expect(projectsApi.deleteProject).toHaveBeenCalledTimes(1);
      expect(projectsApi.deleteProject).toHaveBeenCalledWith('p-42');
      expect(mock.applyDeletedProject).toHaveBeenCalledWith('p-42');
      expect(dialogRefCloseSpy).toHaveBeenCalledWith(true);
      expect(toast.show).toHaveBeenCalledWith("Project 'Acme' was deleted");
      expect(toast.announce).toHaveBeenCalledWith('Project deleted');
    });

    it('treats 404 as success (local removal + success toast + announce)', async () => {
      const project: ProjectSummary = { ...makeProjects(1)[0], id: 'p-42', name: 'Acme' };
      const { mock, projectsApi, confirmClicked$, toast, dialogRefCloseSpy } =
        await mountWithDeleteFlow(project);
      projectsApi.deleteProject.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 404, statusText: 'x' }))
      );

      confirmClicked$.next();

      expect(mock.applyDeletedProject).toHaveBeenCalledWith('p-42');
      expect(dialogRefCloseSpy).toHaveBeenCalledWith(true);
      expect(toast.show).toHaveBeenCalledWith("Project 'Acme' was deleted");
      expect(toast.announce).toHaveBeenCalledWith('Project deleted');
    });

    it('on 403 closes the dialog and surfaces the verbatim permission toast; no state mutation', async () => {
      const project = makeProjects(1)[0];
      const { mock, projectsApi, confirmClicked$, toast, dialogRefCloseSpy } =
        await mountWithDeleteFlow(project);
      projectsApi.deleteProject.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 403, statusText: 'x' }))
      );

      confirmClicked$.next();

      expect(mock.applyDeletedProject).not.toHaveBeenCalled();
      expect(dialogRefCloseSpy).toHaveBeenCalledWith(undefined);
      expect(toast.show).toHaveBeenCalledWith(
        'Only the project owner can delete this project',
        'info'
      );
      // Success announce must NOT fire on a 403.
      expect(toast.announce).not.toHaveBeenCalled();
    });

    it('on network failure (status 0) keeps the dialog open with verbatim inline retry copy', async () => {
      const project = makeProjects(1)[0];
      const {
        mock,
        projectsApi,
        confirmClicked$,
        toast,
        dialogRefCloseSpy,
        setInputSpy
      } = await mountWithDeleteFlow(project);
      projectsApi.deleteProject.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 0, statusText: 'x' }))
      );

      confirmClicked$.next();

      expect(mock.applyDeletedProject).not.toHaveBeenCalled();
      expect(dialogRefCloseSpy).not.toHaveBeenCalled();
      expect(toast.show).not.toHaveBeenCalled();
      expect(setInputSpy).toHaveBeenCalledWith(
        'inlineError',
        "Couldn't reach the server — try again"
      );
    });

    it('on 500 keeps the dialog open with verbatim generic inline copy', async () => {
      const project = makeProjects(1)[0];
      const { projectsApi, confirmClicked$, dialogRefCloseSpy, setInputSpy } =
        await mountWithDeleteFlow(project);
      projectsApi.deleteProject.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 500, statusText: 'x' }))
      );

      confirmClicked$.next();

      expect(dialogRefCloseSpy).not.toHaveBeenCalled();
      expect(setInputSpy).toHaveBeenCalledWith(
        'inlineError',
        "Couldn't delete project — please try again"
      );
    });

    it('retry-in-place: second confirm after network failure re-issues the DELETE and succeeds', async () => {
      const project: ProjectSummary = { ...makeProjects(1)[0], id: 'p-42', name: 'Acme' };
      const { projectsApi, confirmClicked$, mock, toast, dialogRefCloseSpy } =
        await mountWithDeleteFlow(project);
      // First attempt: network failure.
      projectsApi.deleteProject.mockReturnValueOnce(
        throwError(() => new HttpErrorResponse({ status: 0, statusText: 'x' }))
      );
      // Second attempt: success.
      projectsApi.deleteProject.mockReturnValueOnce(of(undefined));

      confirmClicked$.next();
      confirmClicked$.next();

      expect(projectsApi.deleteProject).toHaveBeenCalledTimes(2);
      expect(mock.applyDeletedProject).toHaveBeenCalledWith('p-42');
      expect(dialogRefCloseSpy).toHaveBeenCalledWith(true);
      expect(toast.show).toHaveBeenCalledWith("Project 'Acme' was deleted");
    });

    it('no error-copy variant contains an HTTP status, a URL, or a raw backend error string (hygiene)', async () => {
      const project = makeProjects(1)[0];
      const { projectsApi, confirmClicked$, setInputSpy } =
        await mountWithDeleteFlow(project);
      for (const status of [0, 500, 418, 400]) {
        projectsApi.deleteProject.mockReturnValueOnce(
          throwError(() => new HttpErrorResponse({ status, statusText: 'x' }))
        );
        confirmClicked$.next();
      }
      const inlineErrorCalls = setInputSpy.mock.calls.filter(
        ([name]) => name === 'inlineError'
      );
      for (const [, value] of inlineErrorCalls) {
        if (typeof value !== 'string' || value === null) {
          continue;
        }
        expect(value).not.toMatch(/\b\d{3}\b/); // no HTTP-like status codes
        expect(value).not.toContain('/api/'); // no endpoint URLs
        expect(value).not.toContain('An unexpected error occurred');
      }
    });

    it('ProjectDeleted silent removal on landing page fires NO toast and NO announcement', async () => {
      // The dashboard-page is agnostic to the SignalR event — the state
      // service already removes the project from `projects()` silently.
      // Verify that mutating `projects()` externally does not trigger any
      // toast/announce from the dashboard page.
      const { mock, toast } = await mount();
      const projects = makeProjects(2);
      mock.projects.set(projects);
      mock.hasLoaded.set(true);
      mock.isLoading.set(false);
      // Simulate a remote ProjectDeleted via state removing the entry.
      mock.projects.set([projects[1]]);
      expect(toast.show).not.toHaveBeenCalled();
      expect(toast.announce).not.toHaveBeenCalled();
    });
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { WritableSignal, signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { Router } from '@angular/router';
import { vi } from 'vitest';

import { DashboardPageComponent } from './dashboard-page.component';
import { ProjectStateService } from '../state/project-state.service';
import { ProjectSummary } from '../models/project.model';
import { DashboardSkeletonComponent } from '../components/dashboard-skeleton/dashboard-skeleton.component';
import { ProjectGridComponent } from '../components/project-grid/project-grid.component';
import { DashboardEmptyStateComponent } from '../components/dashboard-empty-state/dashboard-empty-state.component';
import { DashboardErrorStateComponent } from '../components/dashboard-error-state/dashboard-error-state.component';
import { DashboardHeaderComponent } from '../components/dashboard-header/dashboard-header.component';
import { CreateProjectDialogComponent } from '../components/create-project-dialog/create-project-dialog.component';
import { MembersDialogComponent } from '../components/members-dialog/members-dialog.component';

interface ProjectStateMock {
  projects: WritableSignal<ProjectSummary[]>;
  isLoading: WritableSignal<boolean>;
  error: WritableSignal<string | null>;
  hasLoaded: WritableSignal<boolean>;
  loadProjects: ReturnType<typeof vi.fn>;
}

interface DialogMock {
  open: ReturnType<typeof vi.fn>;
}

interface RouterMock {
  navigate: ReturnType<typeof vi.fn>;
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
}> {
  const mock: ProjectStateMock = {
    projects: signal<ProjectSummary[]>([]),
    isLoading: signal(false),
    error: signal<string | null>(null),
    hasLoaded: signal(false),
    loadProjects: vi.fn()
  };

  const dialog: DialogMock = {
    open: vi.fn()
  };

  const router: RouterMock = {
    navigate: vi.fn()
  };

  await TestBed.configureTestingModule({
    imports: [DashboardPageComponent],
    providers: [
      { provide: ProjectStateService, useValue: mock },
      { provide: Dialog, useValue: dialog },
      { provide: Router, useValue: router }
    ]
  }).compileComponents();

  const fixture = TestBed.createComponent(DashboardPageComponent);
  fixture.detectChanges();
  return { fixture, mock, dialog, router };
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
});
